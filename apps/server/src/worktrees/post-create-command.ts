import type Database from "better-sqlite3";
import { execa } from "execa";
import type { Server } from "socket.io";

import { insertLogEntry } from "./log-repository.js";
import {
  detectInstallCommand as defaultDetectInstallCommand,
  hasNodeModules,
} from "./package-manager.js";
import { worktreeRoom } from "./process-manager.js";

/**
 * Ejecuta el `postCreateCommand` opcional de un proyecto (ver ADR-0011) una
 * sola vez, justo tras crear un worktree — para bootstrap que `.env` no
 * cubre (migrar/seedear una base de datos local, generar un cliente...).
 * Espera a que termine (a diferencia del `devCommand` real, que es de larga
 * duración) y vuelca su output como logs del propio worktree, visibles en
 * "Ver logs" igual que el resto de su actividad.
 *
 * Casi cualquier comando real de este tipo es a su vez un script de
 * `package.json` (necesita `node_modules`) — pero un worktree recién creado
 * todavía no lo tiene (se instala al ARRANCAR el `devCommand`, no al crear,
 * ver `process-manager.ts`). Se instala aquí primero si hace falta, para que
 * este comando no falle sistemáticamente por esa carrera.
 *
 * Nunca lanza por un código de salida distinto de cero: un fallo aquí no
 * debe impedir usar el worktree recién creado, solo dejar constancia visible
 * (ver la respuesta del usuario a "si falla" al diseñar esto).
 */
export async function runPostCreateCommand({
  db,
  io,
  worktreeId,
  worktreePath,
  command,
  detectInstallCommand = defaultDetectInstallCommand,
}: {
  db: Database.Database;
  io: Server;
  worktreeId: string;
  worktreePath: string;
  command: string;
  /** Inyectable para tests — por defecto detecta por lockfile (ver package-manager.ts). */
  detectInstallCommand?: (worktreePath: string) => string;
}): Promise<void> {
  function logLine(stream: "stdout" | "stderr", content: string): void {
    const entry = insertLogEntry(db, worktreeId, { stream, content });
    io.to(worktreeRoom(worktreeId)).emit("log-entry", { worktreeId, entry });
  }

  async function runAndLog(commandToRun: string): Promise<number> {
    const result = await execa(commandToRun, { shell: true, cwd: worktreePath, reject: false });

    for (const line of result.stdout.split("\n").filter((content) => content !== "")) {
      logLine("stdout", line);
    }
    for (const line of result.stderr.split("\n").filter((content) => content !== "")) {
      logLine("stderr", line);
    }

    return result.exitCode ?? 1;
  }

  if (!hasNodeModules(worktreePath)) {
    const installCommand = detectInstallCommand(worktreePath);
    logLine("stdout", `▶ Instalando dependencias (${installCommand})…`);

    if ((await runAndLog(installCommand)) !== 0) {
      logLine(
        "stderr",
        "✗ No se han podido instalar las dependencias; se aborta el comando posterior a la creación",
      );
      return;
    }
  }

  logLine("stdout", `▶ Comando posterior a la creación: ${command}`);

  const exitCode = await runAndLog(command);

  logLine(
    exitCode === 0 ? "stdout" : "stderr",
    exitCode === 0
      ? "✓ Comando posterior a la creación completado"
      : `✗ Comando posterior a la creación ha fallado (código ${String(exitCode)})`,
  );
}
