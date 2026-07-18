import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import { runMigrations } from "../db/migrate.js";
import { readProjectConfigFile } from "./config-file.js";
import { buildCreateProjectInput } from "./test-fixtures.js";

function initGitRepoDir(): string {
  const repoPath = mkdtempSync(join(tmpdir(), "worktrees-manager-plugin-"));
  execFileSync("git", ["init"], { cwd: repoPath, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@example.com"], {
    cwd: repoPath,
    stdio: "ignore",
  });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: repoPath, stdio: "ignore" });

  return repoPath;
}

function createGitRepoDir(): string {
  const repoPath = initGitRepoDir();

  writeFileSync(join(repoPath, "README.md"), "# test\n");
  execFileSync("git", ["add", "."], { cwd: repoPath, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "initial commit"], { cwd: repoPath, stdio: "ignore" });

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
      chmodSync(repoPath, 0o755);
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

  it("should report hasCommits and isWritable when looking up a fresh git repo path", async () => {
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
      hasCommits: true,
      isWritable: true,
      existingProjectId: null,
      configFile: null,
    });
  });

  it("should report configFile=null instead of failing when the config file is corrupt", async () => {
    const repoPath = trackRepoPath();
    writeFileSync(join(repoPath, ".worktrees-manager.json"), "{ not valid json");

    const response = await app.inject({
      method: "GET",
      url: `/api/projects/lookup?localPath=${repoPath}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ configFile: null });
  });

  it("should report hasCommits=false when looking up a git repo without any commit", async () => {
    const repoPath = initGitRepoDir();
    repoPaths.push(repoPath);

    const response = await app.inject({
      method: "GET",
      url: `/api/projects/lookup?localPath=${repoPath}`,
    });

    expect(response.json()).toMatchObject({ isGitRepo: true, hasCommits: false });
  });

  it("should create a project and write the config file when the path is a valid git repo", async () => {
    const repoPath = trackRepoPath();
    const input = buildCreateProjectInput({ localPath: repoPath });

    const response = await app.inject({ method: "POST", url: "/api/projects", payload: input });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ name: input.name, localPath: repoPath });
    expect(readProjectConfigFile(repoPath)).toEqual({ devCommand: input.devCommand });
  });

  it("should reject creating a project when the local path is not a git repository", async () => {
    const repoPath = mkdtempSync(join(tmpdir(), "worktrees-manager-plugin-not-git-"));
    repoPaths.push(repoPath);

    const response = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: buildCreateProjectInput({ localPath: repoPath }),
    });

    expect(response.statusCode).toBe(422);
  });

  it("should reject creating a project when the git repo has no commits yet", async () => {
    const repoPath = initGitRepoDir();
    repoPaths.push(repoPath);

    const response = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: buildCreateProjectInput({ localPath: repoPath }),
    });

    expect(response.statusCode).toBe(422);
  });

  it("should reject creating a project when the local path has no write permission", async () => {
    // Root (habitual en contenedores de CI) ignora los bits de permisos.
    if (process.getuid?.() === 0) {
      return;
    }

    const repoPath = trackRepoPath();
    chmodSync(repoPath, 0o555);

    const response = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: buildCreateProjectInput({ localPath: repoPath }),
    });

    expect(response.statusCode).toBe(422);
  });

  it("should reject creating a project when the request body fails schema validation", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { localPath: "", name: "", devCommand: "" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("should reject creating a project with a local path already registered by another project", async () => {
    const repoPath = trackRepoPath();
    const projectInput = buildCreateProjectInput({ localPath: repoPath });

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
      payload: buildCreateProjectInput({ localPath: repoPath }),
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

  it("should create a project with a postCreateCommand, default it to null when omitted, and write both to the config file", async () => {
    const repoPathWithCommand = trackRepoPath();
    const withCommand = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: buildCreateProjectInput({
        localPath: repoPathWithCommand,
        postCreateCommand: "pnpm db:migrate",
      }),
    });
    expect(withCommand.json()).toMatchObject({ postCreateCommand: "pnpm db:migrate" });
    expect(readProjectConfigFile(repoPathWithCommand)).toMatchObject({
      postCreateCommand: "pnpm db:migrate",
    });

    const repoPathWithoutCommand = trackRepoPath();
    const withoutCommand = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: buildCreateProjectInput({ localPath: repoPathWithoutCommand }),
    });
    expect(withoutCommand.json()).toMatchObject({ postCreateCommand: null });
    // Ausente del fichero, no `null` — así un proyecto sin comando posterior
    // a la creación sigue teniendo un `.worktrees-manager.json` mínimo.
    expect(readProjectConfigFile(repoPathWithoutCommand)).not.toHaveProperty("postCreateCommand");
  });

  it("should set and clear a project's postCreateCommand via PATCH, keeping the config file in sync", async () => {
    const repoPath = trackRepoPath();
    const created = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: buildCreateProjectInput({ localPath: repoPath }),
    });
    const project = created.json();

    const withCommand = await app.inject({
      method: "PATCH",
      url: `/api/projects/${project.id}`,
      payload: { postCreateCommand: "pnpm db:migrate" },
    });
    expect(withCommand.json()).toMatchObject({ postCreateCommand: "pnpm db:migrate" });
    expect(readProjectConfigFile(repoPath)).toMatchObject({
      postCreateCommand: "pnpm db:migrate",
    });

    const cleared = await app.inject({
      method: "PATCH",
      url: `/api/projects/${project.id}`,
      payload: { postCreateCommand: null },
    });
    expect(cleared.json()).toMatchObject({ postCreateCommand: null });
    expect(readProjectConfigFile(repoPath)).not.toHaveProperty("postCreateCommand");
  });

  it("should include postCreateCommand when looking up a path with an existing config file", async () => {
    const repoPath = trackRepoPath();
    writeFileSync(
      join(repoPath, ".worktrees-manager.json"),
      JSON.stringify({ devCommand: "pnpm dev", postCreateCommand: "pnpm db:migrate" }),
    );

    const response = await app.inject({
      method: "GET",
      url: `/api/projects/lookup?localPath=${repoPath}`,
    });

    expect(response.json()).toMatchObject({
      configFile: { devCommand: "pnpm dev", postCreateCommand: "pnpm db:migrate" },
    });
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
      payload: buildCreateProjectInput({ localPath: repoPath }),
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
