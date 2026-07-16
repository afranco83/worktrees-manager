import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

import Database from "better-sqlite3";

const REGISTRY_DIR = join(homedir(), ".worktrees-manager");
const REGISTRY_DB_PATH = join(REGISTRY_DIR, "registry.db");

/**
 * Crea el registro central si no existe todavía y abre la conexión SQLite.
 * Sin esquema: la definición de tablas (Project/Worktree/LogEntry) es Fase 2.
 */
export function openRegistry(): Database.Database {
  mkdirSync(REGISTRY_DIR, { recursive: true });
  return new Database(REGISTRY_DB_PATH);
}

export { REGISTRY_DIR, REGISTRY_DB_PATH };
