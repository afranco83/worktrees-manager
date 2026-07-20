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
import { buildCreateProjectInput } from "./test-fixtures.js";

describe("projects repository", () => {
  let db: Database.Database;
  let sampleProjectInput: ReturnType<typeof buildCreateProjectInput>;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    sampleProjectInput = buildCreateProjectInput();
  });

  it("should return an empty list when no project has been inserted", () => {
    expect(listProjects(db)).toEqual([]);
  });

  it("should return the inserted project when listed and fetched by id", () => {
    const created = insertProject(db, sampleProjectInput);

    expect(listProjects(db)).toEqual([created]);
    expect(getProjectById(db, created.id)).toEqual(created);
  });

  it("should return null when fetching a project id that does not exist", () => {
    expect(getProjectById(db, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("should find a project by its local path", () => {
    const created = insertProject(db, sampleProjectInput);

    expect(findProjectByLocalPath(db, sampleProjectInput.localPath)).toEqual(created);
    expect(findProjectByLocalPath(db, "/repos/does-not-exist")).toBeNull();
  });

  it("should throw DuplicateProjectPathError when inserting a project with an already-registered local path", () => {
    insertProject(db, sampleProjectInput);

    expect(() => insertProject(db, { ...sampleProjectInput, name: "otro-nombre" })).toThrow(
      DuplicateProjectPathError,
    );
  });

  it("should update only the patched fields when updating an existing project", () => {
    const created = insertProject(db, sampleProjectInput);

    const updated = updateProject(db, { id: created.id, patch: { name: "nuevo-nombre" } });

    expect(updated).toEqual({ ...created, name: "nuevo-nombre" });
    expect(getProjectById(db, created.id)).toEqual(updated);
  });

  it("should default postCreateCommand to null when not provided at creation", () => {
    const created = insertProject(db, sampleProjectInput);

    expect(created.postCreateCommand).toBeNull();
  });

  it("should persist postCreateCommand when provided at creation", () => {
    const created = insertProject(db, { ...sampleProjectInput, postCreateCommand: "pnpm seed" });

    expect(created.postCreateCommand).toBe("pnpm seed");
    expect(getProjectById(db, created.id)).toMatchObject({ postCreateCommand: "pnpm seed" });
  });

  it("should set and clear postCreateCommand via update", () => {
    const created = insertProject(db, sampleProjectInput);

    const withCommand = updateProject(db, {
      id: created.id,
      patch: { postCreateCommand: "pnpm db:migrate" },
    });
    expect(withCommand.postCreateCommand).toBe("pnpm db:migrate");

    const cleared = updateProject(db, { id: created.id, patch: { postCreateCommand: null } });
    expect(cleared.postCreateCommand).toBeNull();
  });

  it("should throw NotFoundError when updating a project id that does not exist", () => {
    expect(() =>
      updateProject(db, { id: "00000000-0000-4000-8000-000000000000", patch: { name: "x" } }),
    ).toThrow(NotFoundError);
  });

  it("should remove the project when deleting an existing id", () => {
    const created = insertProject(db, sampleProjectInput);

    deleteProject(db, created.id);

    expect(getProjectById(db, created.id)).toBeNull();
  });

  it("should throw NotFoundError when deleting a project id that does not exist", () => {
    expect(() => deleteProject(db, "00000000-0000-4000-8000-000000000000")).toThrow(NotFoundError);
  });
});
