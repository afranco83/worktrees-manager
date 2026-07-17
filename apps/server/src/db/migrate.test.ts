import { randomUUID } from "node:crypto";

import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "./migrate.js";
import { migrations, type Migration } from "./migrations.js";

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

  it("should seed a single app_settings row with sensible defaults", () => {
    runMigrations(db);

    const rows = db.prepare("SELECT * FROM app_settings").all();

    expect(rows).toEqual([
      { id: 1, preferred_terminal_command: null, port_range_start: 3000, port_range_end: 3999 },
    ]);
  });

  it("should not fail nor duplicate migration records when run more than once", () => {
    runMigrations(db);
    runMigrations(db);

    const appliedMigrations = db.prepare("SELECT name FROM schema_migrations").all();

    expect(appliedMigrations).toHaveLength(migrations.length);
  });

  it("should persist a project, a worktree and a log entry when they reference each other via valid foreign keys", () => {
    runMigrations(db);

    const projectId = randomUUID();
    const worktreeId = randomUUID();

    db.prepare(
      `INSERT INTO projects (id, name, local_path, dev_command)
       VALUES (?, ?, ?, ?)`,
    ).run(projectId, "worktrees-manager", "/repo", "pnpm dev");

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

  it("should reject a log entry when its stream value is outside stdout/stderr", () => {
    runMigrations(db);

    const projectId = randomUUID();
    const worktreeId = randomUUID();

    db.prepare(
      `INSERT INTO projects (id, name, local_path, dev_command)
       VALUES (?, ?, ?, ?)`,
    ).run(projectId, "worktrees-manager", "/repo", "pnpm dev");

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

  it("should leave no trace of a migration when its SQL fails partway through", () => {
    runMigrations(db);

    const brokenMigration: Migration = {
      name: "9999_broken",
      up: `
        CREATE TABLE partially_created (id INTEGER PRIMARY KEY);
        CREATE TABLE this is not valid sql;
      `,
    };

    expect(() => runMigrations(db, [brokenMigration])).toThrow();

    const appliedMigrationNames = db
      .prepare<[], { name: string }>("SELECT name FROM schema_migrations")
      .all()
      .map((row) => row.name);
    const tableNames = db
      .prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => row.name);

    expect(appliedMigrationNames).not.toContain("9999_broken");
    expect(tableNames).not.toContain("partially_created");
  });
});
