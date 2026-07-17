import type Database from "better-sqlite3";

import type { LogEntry } from "./schemas.js";

/**
 * Retención acotada: última cantidad de filas por worktree. Podada en tres
 * disparadores baratos (ver `process-manager.ts`), nunca por cada línea nueva.
 */
export const LOG_ENTRIES_KEEP_COUNT = 2000;

interface LogEntryRow {
  id: number;
  timestamp: string;
  stream: "stdout" | "stderr";
  content: string;
}

function toLogEntry(row: LogEntryRow): LogEntry {
  return { id: row.id, timestamp: row.timestamp, stream: row.stream, content: row.content };
}

export function insertLogEntry(
  db: Database.Database,
  worktreeId: string,
  entry: { stream: "stdout" | "stderr"; content: string },
): LogEntry {
  const result = db
    .prepare("INSERT INTO log_entries (worktree_id, stream, content) VALUES (?, ?, ?)")
    .run(worktreeId, entry.stream, entry.content);

  const row = db
    .prepare<[number], LogEntryRow>("SELECT * FROM log_entries WHERE id = ?")
    .get(Number(result.lastInsertRowid));

  if (!row) {
    throw new Error("No se ha podido leer la entrada de log recién insertada");
  }

  return toLogEntry(row);
}

export function listRecentLogEntries(
  db: Database.Database,
  worktreeId: string,
  limit: number,
): LogEntry[] {
  const rows = db
    .prepare<[string, number], LogEntryRow>(
      "SELECT * FROM log_entries WHERE worktree_id = ? ORDER BY id DESC LIMIT ?",
    )
    .all(worktreeId, limit);

  return rows.map(toLogEntry).reverse();
}

/** Conserva solo las últimas `keep` filas de `worktreeId`, borrando el resto. */
export function pruneLogEntries(
  db: Database.Database,
  worktreeId: string,
  keep: number = LOG_ENTRIES_KEEP_COUNT,
): void {
  db.prepare(
    `DELETE FROM log_entries
     WHERE worktree_id = ?
       AND id <= (
         SELECT id FROM log_entries
         WHERE worktree_id = ?
         ORDER BY id DESC
         LIMIT 1 OFFSET ?
       )`,
  ).run(worktreeId, worktreeId, keep);
}

/**
 * Barrido único sobre todos los worktrees, invocado en la reconciliación de
 * arranque del servidor: cubre filas acumuladas por encima de `keep` antes de
 * un reinicio, que de otro modo no se podarían hasta el próximo arranque de
 * ese worktree en concreto.
 */
export function pruneAllWorktreeLogs(
  db: Database.Database,
  keep: number = LOG_ENTRIES_KEEP_COUNT,
): void {
  const worktreeIds = db
    .prepare<[], { worktree_id: string }>("SELECT DISTINCT worktree_id FROM log_entries")
    .all()
    .map((row) => row.worktree_id);

  for (const worktreeId of worktreeIds) {
    pruneLogEntries(db, worktreeId, keep);
  }
}
