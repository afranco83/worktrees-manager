import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

import { DuplicateProjectPathError, NotFoundError } from "../errors.js";
import { runMigrations } from "../db/migrate.js";
import {
  deleteProject,
  findProjectByLocalPath,
  getProjectById,
  insertProject,
  listProjects,
  updateProject,
} from "./repository.js";
import type { CreateProjectInput } from "./schemas.js";

const SAMPLE_PROJECT_INPUT: CreateProjectInput = {
  localPath: "/repos/worktrees-manager",
  name: "worktrees-manager",
  devCommand: "pnpm dev",
  portRangeStart: 3000,
  portRangeEnd: 3099,
};

describe("projects repository", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
  });

  it("should return an empty list when no project has been inserted", () => {
    expect(listProjects(db)).toEqual([]);
  });

  it("should return the inserted project when listed and fetched by id", () => {
    const created = insertProject(db, SAMPLE_PROJECT_INPUT);

    expect(listProjects(db)).toEqual([created]);
    expect(getProjectById(db, created.id)).toEqual(created);
  });

  it("should return null when fetching a project id that does not exist", () => {
    expect(getProjectById(db, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("should find a project by its local path", () => {
    const created = insertProject(db, SAMPLE_PROJECT_INPUT);

    expect(findProjectByLocalPath(db, SAMPLE_PROJECT_INPUT.localPath)).toEqual(created);
    expect(findProjectByLocalPath(db, "/repos/does-not-exist")).toBeNull();
  });

  it("should throw DuplicateProjectPathError when inserting a project with an already-registered local path", () => {
    insertProject(db, SAMPLE_PROJECT_INPUT);

    expect(() => insertProject(db, { ...SAMPLE_PROJECT_INPUT, name: "otro-nombre" })).toThrow(
      DuplicateProjectPathError,
    );
  });

  it("should update only the patched fields when updating an existing project", () => {
    const created = insertProject(db, SAMPLE_PROJECT_INPUT);

    const updated = updateProject(db, { id: created.id, patch: { name: "nuevo-nombre" } });

    expect(updated).toEqual({ ...created, name: "nuevo-nombre" });
    expect(getProjectById(db, created.id)).toEqual(updated);
  });

  it("should throw NotFoundError when updating a project id that does not exist", () => {
    expect(() =>
      updateProject(db, { id: "00000000-0000-4000-8000-000000000000", patch: { name: "x" } }),
    ).toThrow(NotFoundError);
  });

  it("should remove the project when deleting an existing id", () => {
    const created = insertProject(db, SAMPLE_PROJECT_INPUT);

    deleteProject(db, created.id);

    expect(getProjectById(db, created.id)).toBeNull();
  });

  it("should throw NotFoundError when deleting a project id that does not exist", () => {
    expect(() => deleteProject(db, "00000000-0000-4000-8000-000000000000")).toThrow(NotFoundError);
  });
});
