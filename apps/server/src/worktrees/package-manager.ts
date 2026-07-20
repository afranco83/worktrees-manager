import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Git no versiona `node_modules`: un worktree recién creado nunca lo tiene,
 * aunque comparta lockfile con el repo principal (el lockfile sí es un
 * fichero versionado, se comprueba en el propio worktree). `npm ci` para
 * `package-lock.json` porque es exactamente el caso para el que existe
 * (checkout nuevo, respeta el lockfile al pie de la letra); el resto usan su
 * instalación estándar.
 */
const LOCKFILE_INSTALL_COMMANDS: Array<{ lockfile: string; command: string }> = [
  { lockfile: "pnpm-lock.yaml", command: "pnpm install" },
  { lockfile: "yarn.lock", command: "yarn install" },
  { lockfile: "bun.lockb", command: "bun install" },
  { lockfile: "bun.lock", command: "bun install" },
  { lockfile: "package-lock.json", command: "npm ci" },
];

const DEFAULT_INSTALL_COMMAND = "npm install";

export function detectInstallCommand(worktreePath: string): string {
  const match = LOCKFILE_INSTALL_COMMANDS.find(({ lockfile }) =>
    existsSync(join(worktreePath, lockfile)),
  );

  return match?.command ?? DEFAULT_INSTALL_COMMAND;
}

export function hasNodeModules(worktreePath: string): boolean {
  return existsSync(join(worktreePath, "node_modules"));
}
