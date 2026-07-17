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
import type { Worktree, WorktreeProcessStatus } from "./schemas.js";

// Poda cada N líneas nuevas en caliente (nunca por-línea) — ver también la
// poda puntual en `'exit'` y el barrido de `pruneAllWorktreeLogs` en la
// reconciliación de arranque (`index.ts`).
const PRUNE_EVERY_N_LINES = 150;

const killTree = promisify(treeKill);

export function worktreeRoom(worktreeId: string): string {
  return `worktree:${worktreeId}`;
}

interface TrackedProcess {
  // Sin proceso todavía en el breve hueco entre registrar el worktree como
  // "en marcha" y que `execa` devuelva el primer child (instalación o
  // arranque directo) — `stop()` durante ese hueco solo marca la intención.
  child?: ResultPromise;
  linesSinceLastPrune: number;
  isStoppingIntentionally: boolean;
  exited: Promise<void>;
}

export interface ProcessManager {
  start(worktree: Worktree, project: Project): Promise<void>;
  stop(worktreeId: string): Promise<void>;
  stopAll(): Promise<void>;
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

  function logInfoLine(worktreeId: string, content: string): void {
    const entry = insertLogEntry(db, worktreeId, { stream: "stdout", content });
    io.to(worktreeRoom(worktreeId)).emit("log-entry", entry);
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
      const entry = insertLogEntry(db, worktreeId, { stream: streamName, content });
      io.to(worktreeRoom(worktreeId)).emit("log-entry", entry);

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
      resolveExited();
      return;
    }

    if (dependenciesOutcome === "failed") {
      processes.delete(worktree.id);
      setStatus(worktree.id, "error", null);
      resolveExited();
      throw new DevCommandSpawnError(
        `No se han podido instalar las dependencias del worktree ${worktree.id}`,
      );
    }

    logInfoLine(worktree.id, `▶ Arrancando: ${project.devCommand}`);

    const { child, outcome } = await spawnTracked(
      worktree.id,
      tracked,
      project.devCommand,
      worktree.path,
      {
        ...process.env,
        PORT: String(worktree.port),
      },
    );

    child.once("exit", (code) => {
      const finalStatus: WorktreeProcessStatus =
        tracked.isStoppingIntentionally || code === 0 ? "stopped" : "error";

      pruneLogEntries(db, worktree.id);
      setStatus(worktree.id, finalStatus, null);
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
        processes.delete(worktree.id);
      }

      resolveExited();
    });

    if (outcome === "spawn-failed") {
      processes.delete(worktree.id);
      setStatus(worktree.id, "error", null);
      resolveExited();
      throw new DevCommandSpawnError(
        `No se ha podido arrancar el comando de dev del worktree ${worktree.id}`,
      );
    }

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

  return { start, stop, stopAll };
}
