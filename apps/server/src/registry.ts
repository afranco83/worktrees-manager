import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

import Database from "better-sqlite3";

import { runMigrations } from "./db/migrate.js";

const REGISTRY_DIR = join(homedir(), ".worktrees-manager");
const REGISTRY_DB_PATH = join(REGISTRY_DIR, "registry.db");

/**
 * Crea el registro central si no existe todavía, abre la conexión SQLite
 * y aplica las migraciones pendientes del esquema (Project/Worktree/LogEntry).
 */
export function openRegistry(): Database.Database {
  mkdirSync(REGISTRY_DIR, { recursive: true });
  const db = new Database(REGISTRY_DB_PATH);
  runMigrations(db);
  return db;
}

export { REGISTRY_DIR, REGISTRY_DB_PATH };
