import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import { runMigrations } from "../db/migrate.js";
import { readProjectConfigFile } from "./config-file.js";

function createGitRepoDir(): string {
  const repoPath = mkdtempSync(join(tmpdir(), "worktrees-manager-plugin-"));
  mkdirSync(join(repoPath, ".git"));

  return repoPath;
}

describe("projects plugin", () => {
  let db: Database.Database;
  let app: FastifyInstance;
  let repoPaths: string[];

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    app = buildApp(db, { logger: false });
    repoPaths = [];
  });

  afterEach(() => {
    for (const repoPath of repoPaths) {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });

  function trackRepoPath(): string {
    const repoPath = createGitRepoDir();
    repoPaths.push(repoPath);

    return repoPath;
  }

  it("should return an empty array when listing projects and none has been created", async () => {
    const response = await app.inject({ method: "GET", url: "/api/projects" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  it("should report no config file when looking up a fresh git repo path", async () => {
    const repoPath = trackRepoPath();

    const response = await app.inject({
      method: "GET",
      url: `/api/projects/lookup?localPath=${repoPath}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      localPath: repoPath,
      exists: true,
      isGitRepo: true,
      existingProjectId: null,
      configFile: null,
    });
  });

  it("should create a project and write the config file when the path is a valid git repo", async () => {
    const repoPath = trackRepoPath();

    const response = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: {
        localPath: repoPath,
        name: "worktrees-manager",
        devCommand: "pnpm dev",
        portRangeStart: 3000,
        portRangeEnd: 3099,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ name: "worktrees-manager", localPath: repoPath });
    expect(readProjectConfigFile(repoPath)).toEqual({
      devCommand: "pnpm dev",
      portRangeStart: 3000,
      portRangeEnd: 3099,
    });
  });

  it("should reject creating a project when the local path is not a git repository", async () => {
    const repoPath = mkdtempSync(join(tmpdir(), "worktrees-manager-plugin-not-git-"));
    repoPaths.push(repoPath);

    const response = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: {
        localPath: repoPath,
        name: "not-a-repo",
        devCommand: "pnpm dev",
        portRangeStart: 3000,
        portRangeEnd: 3099,
      },
    });

    expect(response.statusCode).toBe(422);
  });

  it("should reject creating a project when the request body fails schema validation", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: {
        localPath: "",
        name: "",
        devCommand: "",
        portRangeStart: 3000,
        portRangeEnd: 3099,
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("should reject creating a project with a local path already registered by another project", async () => {
    const repoPath = trackRepoPath();
    const projectInput = {
      localPath: repoPath,
      name: "worktrees-manager",
      devCommand: "pnpm dev",
      portRangeStart: 3000,
      portRangeEnd: 3099,
    };

    await app.inject({ method: "POST", url: "/api/projects", payload: projectInput });
    const response = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { ...projectInput, name: "otro-nombre" },
    });

    expect(response.statusCode).toBe(409);
  });

  it("should update a project and rewrite its config file when the dev command changes", async () => {
    const repoPath = trackRepoPath();
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: {
        localPath: repoPath,
        name: "worktrees-manager",
        devCommand: "pnpm dev",
        portRangeStart: 3000,
        portRangeEnd: 3099,
      },
    });
    const created = createResponse.json();

    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/api/projects/${created.id}`,
      payload: { devCommand: "npm start" },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({ devCommand: "npm start" });
    expect(readProjectConfigFile(repoPath)).toMatchObject({ devCommand: "npm start" });
  });

  it("should return 404 when updating a project id that does not exist", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/projects/00000000-0000-4000-8000-000000000000",
      payload: { name: "x" },
    });

    expect(response.statusCode).toBe(404);
  });

  it("should delete a project without removing its config file from the repo", async () => {
    const repoPath = trackRepoPath();
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: {
        localPath: repoPath,
        name: "worktrees-manager",
        devCommand: "pnpm dev",
        portRangeStart: 3000,
        portRangeEnd: 3099,
      },
    });
    const created = createResponse.json();

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/projects/${created.id}`,
    });

    expect(deleteResponse.statusCode).toBe(204);
    expect(readProjectConfigFile(repoPath)).not.toBeNull();

    const listResponse = await app.inject({ method: "GET", url: "/api/projects" });
    expect(listResponse.json()).toEqual([]);
  });

  it("should return 404 when deleting a project id that does not exist", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/projects/00000000-0000-4000-8000-000000000000",
    });

    expect(response.statusCode).toBe(404);
  });
});
