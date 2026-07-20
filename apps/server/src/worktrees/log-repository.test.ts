import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "../db/migrate.js";
import { insertProject } from "../projects/repository.js";
import { buildCreateProjectInput } from "../projects/test-fixtures.js";
import {
  insertLogEntry,
  listRecentLogEntries,
  pruneAllWorktreeLogs,
  pruneLogEntries,
} from "./log-repository.js";
import { insertWorktree } from "./repository.js";

describe("log repository", () => {
  let db: Database.Database;
  let worktreeId: string;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    const projectId = insertProject(db, buildCreateProjectInput()).id;
    worktreeId = insertWorktree(db, {
      projectId,
      branch: "feature-a",
      path: "/repos/foo.worktrees/feature-a",
      port: 4100,
    }).id;
  });

  it("should return an empty list when the worktree has no log entries", () => {
    expect(listRecentLogEntries(db, worktreeId, 500)).toEqual([]);
  });

  it("should insert and list log entries in chronological order", () => {
    const first = insertLogEntry(db, worktreeId, { stream: "stdout", content: "starting up" });
    const second = insertLogEntry(db, worktreeId, { stream: "stderr", content: "a warning" });

    expect(listRecentLogEntries(db, worktreeId, 500)).toEqual([first, second]);
  });

  it("should only return entries for the requested worktree", () => {
    const projectId = insertProject(db, buildCreateProjectInput()).id;
    const otherWorktreeId = insertWorktree(db, {
      projectId,
      branch: "feature-b",
      path: "/repos/bar.worktrees/feature-b",
      port: 4101,
    }).id;
    insertLogEntry(db, otherWorktreeId, { stream: "stdout", content: "other worktree" });
    const own = insertLogEntry(db, worktreeId, { stream: "stdout", content: "this worktree" });

    expect(listRecentLogEntries(db, worktreeId, 500)).toEqual([own]);
  });

  it("should respect the limit, keeping the most recent entries", () => {
    for (let index = 0; index < 5; index += 1) {
      insertLogEntry(db, worktreeId, { stream: "stdout", content: `line ${index}` });
    }

    const entries = listRecentLogEntries(db, worktreeId, 2);

    expect(entries.map((entry) => entry.content)).toEqual(["line 3", "line 4"]);
  });

  it("should prune older entries beyond the keep count", () => {
    for (let index = 0; index < 10; index += 1) {
      insertLogEntry(db, worktreeId, { stream: "stdout", content: `line ${index}` });
    }

    pruneLogEntries(db, worktreeId, 3);

    const entries = listRecentLogEntries(db, worktreeId, 100);
    expect(entries.map((entry) => entry.content)).toEqual(["line 7", "line 8", "line 9"]);
  });

  it("should be a no-op when there are fewer entries than the keep count", () => {
    insertLogEntry(db, worktreeId, { stream: "stdout", content: "only line" });

    pruneLogEntries(db, worktreeId, 100);

    expect(listRecentLogEntries(db, worktreeId, 100)).toHaveLength(1);
  });

  it("should sweep-prune every worktree that has log entries", () => {
    const projectId = insertProject(db, buildCreateProjectInput()).id;
    const otherWorktreeId = insertWorktree(db, {
      projectId,
      branch: "feature-b",
      path: "/repos/bar.worktrees/feature-b",
      port: 4101,
    }).id;

    for (let index = 0; index < 5; index += 1) {
      insertLogEntry(db, worktreeId, { stream: "stdout", content: `a-${index}` });
      insertLogEntry(db, otherWorktreeId, { stream: "stdout", content: `b-${index}` });
    }

    pruneAllWorktreeLogs(db, 2);

    expect(listRecentLogEntries(db, worktreeId, 100)).toHaveLength(2);
    expect(listRecentLogEntries(db, otherWorktreeId, 100)).toHaveLength(2);
  });
});
