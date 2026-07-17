import { randomUUID } from "node:crypto";

import Database from "better-sqlite3";

import { NoFreePortAvailableError, NotFoundError } from "../errors.js";
import type { Worktree, WorktreeProcessStatus } from "./schemas.js";

interface WorktreeRow {
  id: string;
  project_id: string;
  branch: string;
  path: string;
  port: number;
  process_status: WorktreeProcessStatus;
  pid: number | null;
  pr_number: number | null;
  created_at: string;
}

function toWorktree(row: WorktreeRow): Worktree {
  return {
    id: row.id,
    projectId: row.project_id,
    branch: row.branch,
    path: row.path,
    port: row.port,
    processStatus: row.process_status,
    pid: row.pid,
    prNumber: row.pr_number,
    createdAt: row.created_at,
  };
}

export function listWorktreesByProject(db: Database.Database, projectId: string): Worktree[] {
  return db
    .prepare<[string], WorktreeRow>(
      "SELECT * FROM worktrees WHERE project_id = ? ORDER BY created_at",
    )
    .all(projectId)
    .map(toWorktree);
}

export function getWorktreeById(db: Database.Database, id: string): Worktree | null {
  const row = db.prepare<[string], WorktreeRow>("SELECT * FROM worktrees WHERE id = ?").get(id);

  return row ? toWorktree(row) : null;
}

/**
 * Los puertos son un recurso de la máquina, no del proyecto (ver el índice
 * único global de la migración `0002_worktrees_port_unique`): se excluyen los
 * puertos usados por CUALQUIER worktree, no solo los del proyecto actual.
 */
export function listUsedPorts(db: Database.Database): number[] {
  return db
    .prepare<[], { port: number }>("SELECT port FROM worktrees")
    .all()
    .map((row) => row.port);
}

export function insertWorktree(
  db: Database.Database,
  input: { projectId: string; branch: string; path: string; port: number },
): Worktree {
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  try {
    db.prepare(
      `INSERT INTO worktrees (id, project_id, branch, path, port, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, input.projectId, input.branch, input.path, input.port, createdAt);
  } catch (error) {
    if (
      error instanceof Database.SqliteError &&
      error.code === "SQLITE_CONSTRAINT_UNIQUE" &&
      error.message.includes("worktrees.port")
    ) {
      throw new NoFreePortAvailableError(`El puerto ${input.port} ya está en uso`);
    }

    throw error;
  }

  return {
    id,
    projectId: input.projectId,
    branch: input.branch,
    path: input.path,
    port: input.port,
    processStatus: "stopped",
    pid: null,
    prNumber: null,
    createdAt,
  };
}

export function deleteWorktree(db: Database.Database, id: string): void {
  const result = db.prepare("DELETE FROM worktrees WHERE id = ?").run(id);

  if (result.changes === 0) {
    throw new NotFoundError(`No existe un worktree con id ${id}`);
  }
}
