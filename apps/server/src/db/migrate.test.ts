import { randomUUID } from "node:crypto";

import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "./migrate.js";

describe("runMigrations", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
  });

  it("should create the projects, worktrees and log_entries tables when run against a fresh database", () => {
    runMigrations(db);

    const tableNames = db
      .prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => row.name);

    expect(tableNames).toEqual(
      expect.arrayContaining(["projects", "worktrees", "log_entries", "schema_migrations"]),
    );
  });

  it("should not fail nor duplicate migration records when run more than once", () => {
    runMigrations(db);
    runMigrations(db);

    const appliedMigrations = db.prepare("SELECT name FROM schema_migrations").all();

    expect(appliedMigrations).toHaveLength(1);
  });

  it("should allow inserting a project, a worktree referencing it, and a log entry referencing the worktree", () => {
    runMigrations(db);

    const projectId = randomUUID();
    const worktreeId = randomUUID();

    db.prepare(
      `INSERT INTO projects (id, name, local_path, dev_command, port_range_start, port_range_end)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(projectId, "worktrees-manager", "/repo", "pnpm dev", 3000, 3099);

    db.prepare(
      `INSERT INTO worktrees (id, project_id, branch, path, port)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(worktreeId, projectId, "feat/example", "/repo-worktrees/feat-example", 3001);

    db.prepare(
      `INSERT INTO log_entries (worktree_id, stream, content)
       VALUES (?, ?, ?)`,
    ).run(worktreeId, "stdout", "server listening on port 3001");

    const worktree = db
      .prepare<[string], { process_status: string; port: number }>(
        "SELECT process_status, port FROM worktrees WHERE id = ?",
      )
      .get(worktreeId);
    const logEntryCount = db
      .prepare<[string], { count: number }>(
        "SELECT COUNT(*) AS count FROM log_entries WHERE worktree_id = ?",
      )
      .get(worktreeId);

    expect(worktree).toEqual({ process_status: "stopped", port: 3001 });
    expect(logEntryCount).toEqual({ count: 1 });
  });

  it("should reject a log entry with a stream value outside stdout/stderr", () => {
    runMigrations(db);

    const projectId = randomUUID();
    const worktreeId = randomUUID();

    db.prepare(
      `INSERT INTO projects (id, name, local_path, dev_command, port_range_start, port_range_end)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(projectId, "worktrees-manager", "/repo", "pnpm dev", 3000, 3099);

    db.prepare(
      `INSERT INTO worktrees (id, project_id, branch, path, port)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(worktreeId, projectId, "feat/example", "/repo-worktrees/feat-example", 3001);

    expect(() =>
      db
        .prepare(`INSERT INTO log_entries (worktree_id, stream, content) VALUES (?, ?, ?)`)
        .run(worktreeId, "invalid-stream", "..."),
    ).toThrow();
  });
});
