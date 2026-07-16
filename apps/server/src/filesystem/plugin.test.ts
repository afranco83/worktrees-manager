import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import { runMigrations } from "../db/migrate.js";

const REAL_HOME = realpathSync(homedir());

describe("filesystem plugin", () => {
  let db: Database.Database;
  let app: FastifyInstance;
  let rootPath: string;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    app = buildApp(db, { logger: false });
    // Dentro del home a propósito: el explorador solo permite navegar ahí.
    rootPath = mkdtempSync(join(REAL_HOME, ".worktrees-manager-test-plugin-"));
    mkdirSync(join(rootPath, "repo-a"));
  });

  afterEach(() => {
    rmSync(rootPath, { recursive: true, force: true });
  });

  it("should default to the home directory when no path is given", async () => {
    const response = await app.inject({ method: "GET", url: "/api/filesystem/directories" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ path: REAL_HOME });
  });

  it("should list subdirectories of the given path", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/filesystem/directories?path=${encodeURIComponent(rootPath)}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      path: rootPath,
      directories: [{ name: "repo-a", path: join(rootPath, "repo-a") }],
    });
  });

  it("should return 422 when the path does not exist", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/filesystem/directories?path=${encodeURIComponent(join(rootPath, "does-not-exist"))}`,
    });

    expect(response.statusCode).toBe(422);
  });

  it("should return 403 when the path is outside the home directory", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/filesystem/directories?path=${encodeURIComponent(tmpdir())}`,
    });

    expect(response.statusCode).toBe(403);
  });
});
