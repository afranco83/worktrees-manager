import { once } from "node:events";
import { createInterface } from "node:readline";
import { promisify } from "node:util";

import type Database from "better-sqlite3";
import { execa, type ResultPromise } from "execa";
import type { Server } from "socket.io";
import treeKill from "tree-kill";

import {
  DevCommandSpawnError,
  WorktreeProcessAlreadyRunningError,
  WorktreeProcessNotRunningError,
} from "../errors.js";
import type { Project } from "../projects/schemas.js";
import { insertLogEntry, pruneLogEntries } from "./log-repository.js";
import {
  detectInstallCommand as defaultDetectInstallCommand,
  hasNodeModules,
} from "./package-manager.js";
import { withProjectLock } from "./project-lock.js";
import { updateWorktreeProcessState } from "./repository.js";
import type {
  DetectedPort,
  Worktree,
  WorktreeProcessStatus,
  WorktreeProcessStep,
} from "./schemas.js";

// Poda cada N líneas nuevas en caliente (nunca por-línea) — ver también la
// poda puntual en `'exit'` y el barrido de `pruneAllWorktreeLogs` en la
// reconciliación de arranque (`index.ts`).
const PRUNE_EVERY_N_LINES = 150;

const killTree = promisify(treeKill);

export function worktreeRoom(worktreeId: string): string {
  return `worktree:${worktreeId}`;
}

/**
 * Un monorepo (turbo, npm/pnpm workspaces...) puede levantar varias apps en
 * paralelo, cada una en su propio puerto — el único `worktree.port` asignado
 * (pasado como variable de entorno `PORT`) solo coincide con uno de ellos, si
 * acaso. Se detectan los puertos reales anunciados por las propias apps en su
 * salida estándar (convención muy consistente en el ecosistema JS: Next.js,
 * Vite, Storybook... imprimen su URL local al arrancar), en vez de intentar
 * inspeccionar sockets del proceso a nivel de SO (mucho más frágil de hacer
 * bien multiplataforma sin una librería dedicada).
 */
const PORT_PATTERNS = [
  /(?:localhost|127\.0\.0\.1|0\.0\.0\.0)[:/](\d{2,5})\b/i,
  /\bport[:\s]+(\d{2,5})\b/i,
];

function extractPort(line: string): number | null {
  for (const pattern of PORT_PATTERNS) {
    const match = pattern.exec(line);

    if (match?.[1]) {
      const port = Number(match[1]);

      if (port > 0 && port <= 65535) {
        return port;
      }
    }
  }

  return null;
}

// eslint-disable-next-line no-control-regex -- el propio carácter de escape (0x1B) es lo que se busca eliminar, no un control character accidental.
const ANSI_ESCAPE_PATTERN = /\x1b\[[0-9;?]*[a-zA-Z]/g;

// `turbo` (y orquestadores equivalentes) prefija cada línea de un monorepo
// con `<paquete>:<tarea>: `, lo que permite etiquetar cada puerto detectado
// con la app que lo anuncia — sin este prefijo (repo de una sola app), no hay
// forma de saberlo y se deja sin etiqueta.
const TURBO_LINE_PREFIX_PATTERN = /^([^\s:]+):([^\s:]+):\s*/;

function extractAppLabel(line: string): string | null {
  const stripped = line.replace(ANSI_ESCAPE_PATTERN, "");
  const match = TURBO_LINE_PREFIX_PATTERN.exec(stripped);

  if (!match) {
    return null;
  }

  const [, workspaceName, taskName] = match;

  // Un timestamp tipo "10:30:00" encaja en la misma forma `algo:algo:`; se
  // descarta cualquier captura sin ninguna letra, ya que ningún nombre de
  // paquete real es puramente numérico.
  if (!/[a-zA-Z]/.test(workspaceName) || !/[a-zA-Z]/.test(taskName)) {
    return null;
  }

  return workspaceName.split("/").at(-1) ?? null;
}

function sortDetectedPorts(detectedPorts: Map<number, string | null>): DetectedPort[] {
  return Array.from(detectedPorts, ([port, label]) => ({ port, label })).sort(
    (a, b) => a.port - b.port,
  );
}

interface TrackedProcess {
  // Sin proceso todavía en el breve hueco entre registrar el worktree como
  // "en marcha" y que `execa` devuelva el primer child (instalación o
  // arranque directo) — `stop()` durante ese hueco solo marca la intención.
  child?: ResultPromise;
  linesSinceLastPrune: number;
  isStoppingIntentionally: boolean;
  exited: Promise<void>;
  // Clave = puerto, valor = etiqueta de app (null si no se pudo determinar,
  // ver `extractAppLabel`) — el primer nombre visto para un puerto se
  // conserva, un mismo puerto no cambia de app durante la vida del proceso.
  detectedPorts: Map<number, string | null>;
}

export interface ProcessManager {
  start(worktree: Worktree, project: Project): Promise<void>;
  stop(worktreeId: string): Promise<void>;
  stopAll(): Promise<void>;
  getDetectedPorts(worktreeId: string): DetectedPort[];
}

export function createProcessManager({
  db,
  io,
  detectInstallCommand = defaultDetectInstallCommand,
}: {
  db: Database.Database;
  io: Server;
  /** Inyectable para tests — por defecto detecta por lockfile (ver package-manager.ts). */
  detectInstallCommand?: (worktreePath: string) => string;
}): ProcessManager {
  const processes = new Map<string, TrackedProcess>();

  function setStatus(
    worktreeId: string,
    processStatus: WorktreeProcessStatus,
    pid: number | null,
  ): void {
    updateWorktreeProcessState(db, worktreeId, { processStatus, pid });
    io.to(worktreeRoom(worktreeId)).emit("process-status", { worktreeId, processStatus, pid });
  }

  /** Sub-paso dentro de "starting" — no persistido, solo señal en vivo para la UI. */
  function setStep(worktreeId: string, step: WorktreeProcessStep | null): void {
    io.to(worktreeRoom(worktreeId)).emit("process-step", { worktreeId, step });
  }

  function logInfoLine(worktreeId: string, content: string): void {
    const entry = insertLogEntry(db, worktreeId, { stream: "stdout", content });
    io.to(worktreeRoom(worktreeId)).emit("log-entry", { worktreeId, entry });
  }

  function streamOutput(
    worktreeId: string,
    readable: NodeJS.ReadableStream | null,
    streamName: "stdout" | "stderr",
    tracked: TrackedProcess,
  ): void {
    if (!readable) {
      return;
    }

    createInterface({ input: readable }).on("line", (content) => {
      const detectedPort = extractPort(content);

      if (detectedPort != null && !tracked.detectedPorts.has(detectedPort)) {
        tracked.detectedPorts.set(detectedPort, extractAppLabel(content));
        io.to(worktreeRoom(worktreeId)).emit("detected-ports", {
          worktreeId,
          ports: sortDetectedPorts(tracked.detectedPorts),
        });
      }

      const entry = insertLogEntry(db, worktreeId, { stream: streamName, content });
      io.to(worktreeRoom(worktreeId)).emit("log-entry", { worktreeId, entry });

      tracked.linesSinceLastPrune += 1;
      if (tracked.linesSinceLastPrune >= PRUNE_EVERY_N_LINES) {
        pruneLogEntries(db, worktreeId);
        tracked.linesSinceLastPrune = 0;
      }
    });
  }

  /** Spawnea `command`, streamea su output, y resuelve en cuanto se confirma (o falla) el spawn — sin esperar a que termine. */
  async function spawnTracked(
    worktreeId: string,
    tracked: TrackedProcess,
    command: string,
    cwd: string,
    env: NodeJS.ProcessEnv,
  ): Promise<{ child: ResultPromise; outcome: "spawned" | "spawn-failed" }> {
    const child = execa(command, { shell: true, cwd, env, buffer: false, reject: false });

    tracked.child = child;
    streamOutput(worktreeId, child.stdout, "stdout", tracked);
    streamOutput(worktreeId, child.stderr, "stderr", tracked);

    // `events.once` trata `'error'` de forma especial: al esperar CUALQUIER
    // otro evento (aquí `'spawn'`), añade su propio listener interno de
    // `'error'` y RECHAZA esa promesa si `'error'` llega antes — así que sin
    // el segundo argumento de este `.then()`, un fallo de spawn escaparía
    // como el error crudo de Node en vez de convertirse en `"spawn-failed"` y
    // dejar que `Promise.race` decida por el evento que realmente llega primero.
    const outcome = await Promise.race([
      once(child, "spawn").then(
        () => "spawned" as const,
        () => "spawn-failed" as const,
      ),
      once(child, "error").then(() => "spawn-failed" as const),
    ]);

    return { child, outcome };
  }

  async function killTracked(tracked: TrackedProcess): Promise<void> {
    tracked.isStoppingIntentionally = true;

    if (tracked.child?.pid != null) {
      // Un proceso que ya ha terminado por su cuenta justo antes de esta
      // llamada es un resultado benigno, no un fallo real de "parar".
      await killTree(tracked.child.pid).catch(() => undefined);
    }

    await tracked.exited;
  }

  /** Instala dependencias si faltan, esperando a que termine antes de devolver el control. */
  async function ensureDependenciesInstalled(
    worktree: Worktree,
    tracked: TrackedProcess,
  ): Promise<"ready" | "failed" | "stopped"> {
    if (hasNodeModules(worktree.path)) {
      return "ready";
    }

    const installCommand = detectInstallCommand(worktree.path);
    setStep(worktree.id, "installing-dependencies");
    logInfoLine(worktree.id, `▶ Instalando dependencias (${installCommand})…`);

    const { child, outcome } = await spawnTracked(
      worktree.id,
      tracked,
      installCommand,
      worktree.path,
      process.env,
    );

    if (outcome === "spawn-failed") {
      return "failed";
    }

    // Igual que en `spawnTracked`: `events.once` añade su propio listener de
    // `'error'` mientras espera `'exit'` y rechaza si `'error'` llega antes
    // (raro tras un spawn ya confirmado, pero documentado por Node como
    // posible) — se trata como una instalación fallida, no como una excepción
    // sin capturar.
    const exitArgs = await once(child, "exit").catch(() => null);
    const code = exitArgs?.[0] ?? 1;

    if (tracked.isStoppingIntentionally) {
      return "stopped";
    }

    return code === 0 ? "ready" : "failed";
  }

  async function start(worktree: Worktree, project: Project): Promise<void> {
    let resolveExited: () => void = () => {};
    const exited = new Promise<void>((resolve) => {
      resolveExited = resolve;
    });
    const tracked: TrackedProcess = {
      linesSinceLastPrune: 0,
      isStoppingIntentionally: false,
      exited,
      detectedPorts: new Map(),
    };

    // El lock solo cubre este chequeo-y-registro atómico (evita que dos
    // arranques concurrentes pasen ambos el `has()` antes de que ninguno
    // registre nada) — NO la instalación/arranque real de más abajo, que
    // puede tardar. Si `stop()` también compartiera este lock durante todo
    // ese tiempo, un "Parar" pedido mientras se instalan dependencias se
    // quedaría esperando a que la instalación termine para hacer nada, justo
    // lo contrario de lo que se espera de un botón de parar.
    const alreadyRunning = await withProjectLock(worktree.id, async () => {
      if (processes.has(worktree.id)) {
        return true;
      }

      processes.set(worktree.id, tracked);
      return false;
    });

    if (alreadyRunning) {
      throw new WorktreeProcessAlreadyRunningError(
        `El worktree ${worktree.id} ya tiene un proceso de dev en marcha`,
      );
    }

    setStatus(worktree.id, "starting", null);

    const dependenciesOutcome = await ensureDependenciesInstalled(worktree, tracked);

    if (dependenciesOutcome === "stopped") {
      processes.delete(worktree.id);
      setStatus(worktree.id, "stopped", null);
      setStep(worktree.id, null);
      resolveExited();
      return;
    }

    if (dependenciesOutcome === "failed") {
      processes.delete(worktree.id);
      setStatus(worktree.id, "error", null);
      setStep(worktree.id, null);
      resolveExited();
      throw new DevCommandSpawnError(
        `No se han podido instalar las dependencias del worktree ${worktree.id}`,
      );
    }

    // El override por worktree permite restringir qué arranca (p. ej. solo
    // algunas apps de un monorepo) sin asumir ninguna herramienta concreta —
    // el texto lo decide el usuario con las flags de la suya (ver ADR-0009).
    const devCommand = worktree.devCommandOverride ?? project.devCommand;

    setStep(worktree.id, "starting-dev-command");
    logInfoLine(worktree.id, `▶ Arrancando: ${devCommand}`);

    const { child, outcome } = await spawnTracked(worktree.id, tracked, devCommand, worktree.path, {
      ...process.env,
      PORT: String(worktree.port),
    });

    child.once("exit", (code) => {
      const finalStatus: WorktreeProcessStatus =
        tracked.isStoppingIntentionally || code === 0 ? "stopped" : "error";

      pruneLogEntries(db, worktree.id);
      setStatus(worktree.id, finalStatus, null);
      setStep(worktree.id, null);
      processes.delete(worktree.id);
      resolveExited();
    });

    child.once("error", () => {
      // Si ya se había confirmado el `spawn`, esto es un fallo tardío poco
      // habitual (p. ej. no se pudo enviar una señal): se trata como una
      // salida con error. El caso "falló antes de arrancar" lo resuelve
      // `outcome` de más abajo, sin pasar por aquí.
      if (processes.has(worktree.id)) {
        setStatus(worktree.id, "error", null);
        setStep(worktree.id, null);
        processes.delete(worktree.id);
      }

      resolveExited();
    });

    if (outcome === "spawn-failed") {
      processes.delete(worktree.id);
      setStatus(worktree.id, "error", null);
      setStep(worktree.id, null);
      resolveExited();
      throw new DevCommandSpawnError(
        `No se ha podido arrancar el comando de dev del worktree ${worktree.id}`,
      );
    }

    setStep(worktree.id, null);
    setStatus(worktree.id, "running", child.pid ?? null);
  }

  async function stop(worktreeId: string): Promise<void> {
    // Sin lock compartido con `start()`: matar un proceso ya muerto (o uno
    // que todavía no ha llegado a spawnear nada) es benigno vía `killTracked`,
    // y bloquear aquí impediría parar un arranque todavía instalando dependencias.
    const tracked = processes.get(worktreeId);

    if (!tracked) {
      throw new WorktreeProcessNotRunningError(
        `El worktree ${worktreeId} no tiene ningún proceso de dev en marcha`,
      );
    }

    await killTracked(tracked);
  }

  async function stopAll(): Promise<void> {
    await Promise.all(Array.from(processes.values()).map((tracked) => killTracked(tracked)));
  }

  function getDetectedPorts(worktreeId: string): DetectedPort[] {
    const tracked = processes.get(worktreeId);

    return tracked ? sortDetectedPorts(tracked.detectedPorts) : [];
  }

  return { start, stop, stopAll, getDetectedPorts };
}
