import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "../db/migrate.js";
import { NoFreePortAvailableError, NotFoundError } from "../errors.js";
import { insertProject } from "../projects/repository.js";
import { buildCreateProjectInput } from "../projects/test-fixtures.js";
import {
  deleteWorktree,
  getWorktreeById,
  insertWorktree,
  listUsedPorts,
  listWorktreesByProject,
} from "./repository.js";

describe("worktrees repository", () => {
  let db: Database.Database;
  let projectId: string;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    projectId = insertProject(db, buildCreateProjectInput()).id;
  });

  it("should return an empty list when the project has no worktrees", () => {
    expect(listWorktreesByProject(db, projectId)).toEqual([]);
  });

  it("should return the inserted worktree when listed and fetched by id", () => {
    const created = insertWorktree(db, {
      projectId,
      branch: "feature-a",
      path: "/repos/foo.worktrees/feature-a",
      port: 4100,
    });

    expect(listWorktreesByProject(db, projectId)).toEqual([created]);
    expect(getWorktreeById(db, created.id)).toEqual(created);
    expect(created).toMatchObject({ processStatus: "stopped", pid: null, prNumber: null });
  });

  it("should return null when fetching a worktree id that does not exist", () => {
    expect(getWorktreeById(db, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("should list the ports already used by a project's worktrees", () => {
    insertWorktree(db, {
      projectId,
      branch: "feature-a",
      path: "/repos/foo.worktrees/feature-a",
      port: 4100,
    });
    insertWorktree(db, {
      projectId,
      branch: "feature-b",
      path: "/repos/foo.worktrees/feature-b",
      port: 4101,
    });

    expect(listUsedPorts(db, projectId)).toEqual(expect.arrayContaining([4100, 4101]));
  });

  it("should throw NoFreePortAvailableError when the port is already taken by another worktree", () => {
    insertWorktree(db, {
      projectId,
      branch: "feature-a",
      path: "/repos/foo.worktrees/feature-a",
      port: 4100,
    });

    expect(() =>
      insertWorktree(db, {
        projectId,
        branch: "feature-b",
        path: "/repos/foo.worktrees/feature-b",
        port: 4100,
      }),
    ).toThrow(NoFreePortAvailableError);
  });

  it("should delete a worktree", () => {
    const created = insertWorktree(db, {
      projectId,
      branch: "feature-a",
      path: "/repos/foo.worktrees/feature-a",
      port: 4100,
    });

    deleteWorktree(db, created.id);

    expect(listWorktreesByProject(db, projectId)).toEqual([]);
  });

  it("should throw NotFoundError when deleting a worktree id that does not exist", () => {
    expect(() => deleteWorktree(db, "00000000-0000-4000-8000-000000000000")).toThrow(NotFoundError);
  });
});
