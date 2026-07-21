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
  dev_command_override: string | null;
  // Interno — no forma parte del `Worktree` público, solo lo lee
  // `getWorktreeBaseCommitSha()` para que `withGitStatus()` (`plugin.ts`)
  // pueda calcular `hasUnpushedCommits` sin copia remota de la rama.
  base_commit_sha: string | null;
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
    devCommandOverride: row.dev_command_override,
    // No persistido — placeholder aquí; `plugin.ts` lo sustituye por el valor
    // real leído de `processManager.getDetectedPorts()` antes de responder.
    detectedPorts: [],
    // Idem, sustituido por `withGitStatus()` en `plugin.ts` allí donde se
    // aplica; el placeholder "limpio" (no `null`) es el valor por defecto
    // porque el único caso donde no se sustituye es la creación, y un
    // worktree recién creado está genuinamente sin cambios.
    gitStatus: { hasUncommittedChanges: false, hasUnpushedCommits: false },
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
  input: {
    projectId: string;
    branch: string;
    path: string;
    port: number;
    baseCommitSha: string;
  },
): Worktree {
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  try {
    db.prepare(
      `INSERT INTO worktrees (id, project_id, branch, path, port, base_commit_sha, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.projectId,
      input.branch,
      input.path,
      input.port,
      input.baseCommitSha,
      createdAt,
    );
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
    devCommandOverride: null,
    detectedPorts: [],
    gitStatus: { hasUncommittedChanges: false, hasUnpushedCommits: false },
  };
}

export function getWorktreeBaseCommitSha(db: Database.Database, id: string): string | null {
  const row = db
    .prepare<[string], { base_commit_sha: string | null }>(
      "SELECT base_commit_sha FROM worktrees WHERE id = ?",
    )
    .get(id);

  return row?.base_commit_sha ?? null;
}

export function deleteWorktree(db: Database.Database, id: string): void {
  const result = db.prepare("DELETE FROM worktrees WHERE id = ?").run(id);

  if (result.changes === 0) {
    throw new NotFoundError(`No existe un worktree con id ${id}`);
  }
}

export function updateWorktreeDevCommandOverride(
  db: Database.Database,
  id: string,
  devCommandOverride: string | null,
): Worktree {
  const existing = getWorktreeById(db, id);

  if (!existing) {
    throw new NotFoundError(`No existe un worktree con id ${id}`);
  }

  db.prepare("UPDATE worktrees SET dev_command_override = ? WHERE id = ?").run(
    devCommandOverride,
    id,
  );

  return { ...existing, devCommandOverride };
}

export function updateWorktreeProcessState(
  db: Database.Database,
  id: string,
  state: { processStatus: WorktreeProcessStatus; pid: number | null },
): void {
  db.prepare("UPDATE worktrees SET process_status = ?, pid = ? WHERE id = ?").run(
    state.processStatus,
    state.pid,
    id,
  );
}

/**
 * Al arrancar el servidor no hay forma de recuperar un handle real de un
 * proceso hijo de una ejecución anterior (viven solo en memoria, ver
 * `process-manager.ts`) — se resetea cualquier fila que no esté ya "stopped"
 * en vez de fingir que se sigue trackeando (mismo criterio que `project-lock.ts`
 * para el resto de estado en memoria de la app).
 */
export function resetStaleProcessStates(db: Database.Database): void {
  db.prepare(
    `UPDATE worktrees SET process_status = 'stopped', pid = NULL WHERE process_status != 'stopped'`,
  ).run();
}
