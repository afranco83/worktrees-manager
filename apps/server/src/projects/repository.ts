import { randomUUID } from "node:crypto";

import Database from "better-sqlite3";

import { DuplicateProjectPathError, NotFoundError } from "../errors.js";
import type { CreateProjectInput, Project, UpdateProjectInput } from "./schemas.js";

interface ProjectRow {
  id: string;
  name: string;
  local_path: string;
  dev_command: string;
  repo_owner: string | null;
  repo_name: string | null;
  created_at: string;
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    localPath: row.local_path,
    devCommand: row.dev_command,
    repoOwner: row.repo_owner,
    repoName: row.repo_name,
    createdAt: row.created_at,
  };
}

export function listProjects(db: Database.Database): Project[] {
  return db
    .prepare<[], ProjectRow>("SELECT * FROM projects ORDER BY created_at")
    .all()
    .map(toProject);
}

export function getProjectById(db: Database.Database, id: string): Project | null {
  const row = db.prepare<[string], ProjectRow>("SELECT * FROM projects WHERE id = ?").get(id);

  return row ? toProject(row) : null;
}

export function findProjectByLocalPath(db: Database.Database, localPath: string): Project | null {
  const row = db
    .prepare<[string], ProjectRow>("SELECT * FROM projects WHERE local_path = ?")
    .get(localPath);

  return row ? toProject(row) : null;
}

export function insertProject(db: Database.Database, input: CreateProjectInput): Project {
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  try {
    db.prepare(
      `INSERT INTO projects (id, name, local_path, dev_command, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(id, input.name, input.localPath, input.devCommand, createdAt);
  } catch (error) {
    if (error instanceof Database.SqliteError && error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new DuplicateProjectPathError(
        `Ya existe un proyecto registrado con la ruta ${input.localPath}`,
      );
    }

    throw error;
  }

  return {
    id,
    name: input.name,
    localPath: input.localPath,
    devCommand: input.devCommand,
    repoOwner: null,
    repoName: null,
    createdAt,
  };
}

export function updateProject(
  db: Database.Database,
  { id, patch }: { id: string; patch: UpdateProjectInput },
): Project {
  const existing = getProjectById(db, id);

  if (!existing) {
    throw new NotFoundError(`No existe un proyecto con id ${id}`);
  }

  const updated: Project = {
    ...existing,
    ...(patch.name != null && { name: patch.name }),
    ...(patch.devCommand != null && { devCommand: patch.devCommand }),
  };

  db.prepare(`UPDATE projects SET name = ?, dev_command = ? WHERE id = ?`).run(
    updated.name,
    updated.devCommand,
    id,
  );

  return updated;
}

export function deleteProject(db: Database.Database, id: string): void {
  const result = db.prepare("DELETE FROM projects WHERE id = ?").run(id);

  if (result.changes === 0) {
    throw new NotFoundError(`No existe un proyecto con id ${id}`);
  }
}
