import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import { runMigrations } from "../db/migrate.js";
import { projectSchema } from "../projects/schemas.js";
import { buildCreateProjectInput } from "../projects/test-fixtures.js";

function initGitRepo(repoPath: string): void {
  execFileSync("git", ["init"], { cwd: repoPath, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@example.com"], {
    cwd: repoPath,
    stdio: "ignore",
  });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: repoPath, stdio: "ignore" });
}

function createGitRepoDir(): string {
  const repoPath = mkdtempSync(join(tmpdir(), "worktrees-manager-worktrees-plugin-"));
  initGitRepo(repoPath);
  writeFileSync(join(repoPath, "README.md"), "# test\n");
  execFileSync("git", ["add", "."], { cwd: repoPath, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "initial commit"], { cwd: repoPath, stdio: "ignore" });
  execFileSync("git", ["branch", "-M", "main"], { cwd: repoPath, stdio: "ignore" });

  return repoPath;
}

describe("worktrees plugin", () => {
  let db: Database.Database;
  let app: FastifyInstance;
  let repoPaths: string[];

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    app = buildApp(db, { logger: false });
    repoPaths = [];
  });

  afterEach(async () => {
    // Algunos tests arrancan procesos de dev reales (setInterval de larga
    // duración) — hay que pararlos explícitamente para no dejar procesos
    // huérfanos entre tests, ya que `app.inject()` nunca llama a `app.close()`.
    await app.processManager.stopAll();

    for (const repoPath of repoPaths) {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });

  async function createProject(overrides: { devCommand?: string } = {}) {
    const repoPath = createGitRepoDir();
    repoPaths.push(repoPath);

    const response = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: buildCreateProjectInput({ localPath: repoPath, ...overrides }),
    });

    return projectSchema.parse(response.json());
  }

  async function getGlobalPortRange(): Promise<{ portRangeStart: number; portRangeEnd: number }> {
    const response = await app.inject({ method: "GET", url: "/api/settings" });

    return response.json();
  }

  it("should return 404 for git-info when the project does not exist", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/projects/00000000-0000-4000-8000-000000000000/git-info",
    });

    expect(response.statusCode).toBe(404);
  });

  it("should report current/default branch and the branch list for a fresh project", async () => {
    const project = await createProject();

    const response = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/git-info`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      currentBranch: "main",
      defaultBranch: "main",
      branches: ["main"],
    });
  });

  it("should return 422 instead of a raw 500 when the project's local path no longer exists on disk", async () => {
    const project = await createProject();
    rmSync(project.localPath, { recursive: true, force: true });

    const response = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/git-info`,
    });

    expect(response.statusCode).toBe(422);
  });

  it("should return an empty array when listing worktrees for a project without any", async () => {
    const project = await createProject();

    const response = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/worktrees`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  it("should create a worktree on disk from the default branch with a port in the global range", async () => {
    const project = await createProject();
    const { portRangeStart, portRangeEnd } = await getGlobalPortRange();

    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/worktrees`,
      payload: { newBranch: "feature-a", base: { type: "default" } },
    });

    expect(response.statusCode).toBe(201);
    const worktree = response.json();
    expect(worktree).toMatchObject({ projectId: project.id, branch: "feature-a" });
    expect(worktree.port).toBeGreaterThanOrEqual(portRangeStart);
    expect(worktree.port).toBeLessThanOrEqual(portRangeEnd);
    expect(existsSync(worktree.path)).toBe(true);
  });

  it("should create the worktree nested inside the project and ignore it from the project's own git status", async () => {
    const project = await createProject();

    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/worktrees`,
      payload: { newBranch: "feature-nested", base: { type: "default" } },
    });

    const worktree = response.json();
    expect(worktree.path).toBe(join(project.localPath, ".worktrees", "feature-nested"));
    expect(readFileSync(join(project.localPath, ".gitignore"), "utf-8")).toContain(".worktrees/");
    // ".worktrees-manager.json" (config del proyecto, sin relación) sí puede
    // aparecer como sin seguimiento; solo importa que el directorio del
    // worktree en sí no aparezca.
    expect(
      execFileSync("git", ["status", "--porcelain"], { cwd: project.localPath }).toString(),
    ).not.toContain(".worktrees/feature-nested");
  });

  it("should assign non-colliding ports to two worktrees of the same project", async () => {
    const project = await createProject();

    const first = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/worktrees`,
      payload: { newBranch: "feature-a", base: { type: "default" } },
    });
    const second = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/worktrees`,
      payload: { newBranch: "feature-b", base: { type: "default" } },
    });

    expect(first.json().port).not.toBe(second.json().port);
  });

  it("should assign a free port to a second, different project from the same global pool", async () => {
    const projectA = await createProject();
    const projectB = await createProject();

    const first = await app.inject({
      method: "POST",
      url: `/api/projects/${projectA.id}/worktrees`,
      payload: { newBranch: "feature-a", base: { type: "default" } },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: "POST",
      url: `/api/projects/${projectB.id}/worktrees`,
      payload: { newBranch: "feature-b", base: { type: "default" } },
    });

    expect(second.statusCode).toBe(201);
    expect(second.json().port).not.toBe(first.json().port);
  });

  it("should create both worktrees with distinct ports when requested concurrently for the same project", async () => {
    const project = await createProject();

    const [first, second] = await Promise.all([
      app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/worktrees`,
        payload: { newBranch: "feature-concurrent-a", base: { type: "default" } },
      }),
      app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/worktrees`,
        payload: { newBranch: "feature-concurrent-b", base: { type: "default" } },
      }),
    ]);

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(first.json().port).not.toBe(second.json().port);
  });

  it("should create both worktrees with distinct ports when requested concurrently for two different projects", async () => {
    // El rango de puertos es global (ver ADR-0006): dos proyectos distintos
    // compiten por el mismo pool, así que esta carrera solo se evita si la
    // sección crítica de asignación usa una clave de lock global, no por
    // proyecto — regresión directa de ese fix.
    const projectA = await createProject();
    const projectB = await createProject();

    const [first, second] = await Promise.all([
      app.inject({
        method: "POST",
        url: `/api/projects/${projectA.id}/worktrees`,
        payload: { newBranch: "feature-concurrent-a", base: { type: "default" } },
      }),
      app.inject({
        method: "POST",
        url: `/api/projects/${projectB.id}/worktrees`,
        payload: { newBranch: "feature-concurrent-b", base: { type: "default" } },
      }),
    ]);

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(first.json().port).not.toBe(second.json().port);
  });

  it("should keep create and delete of the same project mutually exclusive when run concurrently", async () => {
    // Regresión del hallazgo de code-review: al mover la creación al lock
    // global de puertos, crear y borrar del MISMO proyecto dejaron de
    // serializarse entre sí (antes ambos usaban `project.id`). El fix anida
    // el lock por proyecto alrededor del lock global en la creación.
    const project = await createProject();
    const existing = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/worktrees`,
      payload: { newBranch: "feature-existing", base: { type: "default" } },
    });

    expect(existing.statusCode).toBe(201);

    const [deleteResponse, createResponse] = await Promise.all([
      app.inject({ method: "DELETE", url: `/api/worktrees/${existing.json().id}` }),
      app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/worktrees`,
        payload: { newBranch: "feature-concurrent-create", base: { type: "default" } },
      }),
    ]);

    expect(deleteResponse.statusCode).toBe(204);
    expect(createResponse.statusCode).toBe(201);

    const remaining = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/worktrees`,
    });

    expect(remaining.json().map((worktree: { branch: string }) => worktree.branch)).toEqual([
      "feature-concurrent-create",
    ]);
  });

  it("should reject creating a worktree with an invalid branch name", async () => {
    const project = await createProject();

    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/worktrees`,
      payload: { newBranch: "../escape", base: { type: "default" } },
    });

    expect(response.statusCode).toBe(422);
  });

  it("should reject creating a worktree whose branch already exists", async () => {
    const project = await createProject();
    await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/worktrees`,
      payload: { newBranch: "feature-dup", base: { type: "default" } },
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/worktrees`,
      payload: { newBranch: "feature-dup", base: { type: "default" } },
    });

    expect(response.statusCode).toBe(409);
  });

  it("should reject creating a worktree based on a branch that does not exist", async () => {
    const project = await createProject();

    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/worktrees`,
      payload: { newBranch: "feature-a", base: { type: "branch", branch: "does-not-exist" } },
    });

    expect(response.statusCode).toBe(422);
  });

  it("should create a worktree from the current branch of the main repo", async () => {
    const project = await createProject();
    execFileSync("git", ["checkout", "-b", "develop"], { cwd: project.localPath, stdio: "ignore" });

    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/worktrees`,
      payload: { newBranch: "feature-from-current", base: { type: "current" } },
    });

    expect(response.statusCode).toBe(201);
    expect(
      execFileSync("git", ["branch", "--list", "feature-from-current"], {
        cwd: project.localPath,
      }).toString(),
    ).toContain("feature-from-current");
  });

  it("should reject creating a worktree from the current branch when the main repo is in detached HEAD", async () => {
    const project = await createProject();
    const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: project.localPath })
      .toString()
      .trim();
    execFileSync("git", ["checkout", sha], { cwd: project.localPath, stdio: "ignore" });

    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/worktrees`,
      payload: { newBranch: "feature-a", base: { type: "current" } },
    });

    expect(response.statusCode).toBe(422);
  });

  it("should return 404 when creating a worktree for a project that does not exist", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/projects/00000000-0000-4000-8000-000000000000/worktrees",
      payload: { newBranch: "feature-a", base: { type: "default" } },
    });

    expect(response.statusCode).toBe(404);
  });

  it("should delete a clean worktree from disk and from the registry", async () => {
    const project = await createProject();
    const created = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/worktrees`,
      payload: { newBranch: "feature-a", base: { type: "default" } },
    });
    const worktree = created.json();

    const response = await app.inject({ method: "DELETE", url: `/api/worktrees/${worktree.id}` });

    expect(response.statusCode).toBe(204);
    expect(existsSync(worktree.path)).toBe(false);

    const list = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/worktrees`,
    });
    expect(list.json()).toEqual([]);
  });

  it("should reject deleting a dirty worktree without force and succeed with force", async () => {
    const project = await createProject();
    const created = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/worktrees`,
      payload: { newBranch: "feature-dirty", base: { type: "default" } },
    });
    const worktree = created.json();
    writeFileSync(join(worktree.path, "untracked.txt"), "dirty");

    const rejected = await app.inject({
      method: "DELETE",
      url: `/api/worktrees/${worktree.id}`,
    });
    expect(rejected.statusCode).toBe(409);
    expect(existsSync(worktree.path)).toBe(true);

    const rejectedExplicitFalse = await app.inject({
      method: "DELETE",
      url: `/api/worktrees/${worktree.id}?force=false`,
    });
    expect(rejectedExplicitFalse.statusCode).toBe(409);
    expect(existsSync(worktree.path)).toBe(true);

    const forced = await app.inject({
      method: "DELETE",
      url: `/api/worktrees/${worktree.id}?force=true`,
    });
    expect(forced.statusCode).toBe(204);
    expect(existsSync(worktree.path)).toBe(false);
  });

  it("should return 404 when deleting a worktree id that does not exist", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/worktrees/00000000-0000-4000-8000-000000000000",
    });

    expect(response.statusCode).toBe(404);
  });

  it("should not crash when two DELETE requests race for the same worktree", async () => {
    const project = await createProject();
    const created = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/worktrees`,
      payload: { newBranch: "feature-race", base: { type: "default" } },
    });
    const worktree = created.json();

    const [first, second] = await Promise.all([
      app.inject({ method: "DELETE", url: `/api/worktrees/${worktree.id}` }),
      app.inject({ method: "DELETE", url: `/api/worktrees/${worktree.id}` }),
    ]);

    const statusCodes = [first.statusCode, second.statusCode];
    expect(statusCodes).toContain(204);
    expect(statusCodes.every((code) => code === 204 || code === 404)).toBe(true);
    expect(existsSync(worktree.path)).toBe(false);
  });

  it("should update the dev command override of a worktree and reflect it in a later GET", async () => {
    const project = await createProject();
    const created = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/worktrees`,
      payload: { newBranch: "feature-override", base: { type: "default" } },
    });
    const worktree = created.json();

    const patched = await app.inject({
      method: "PATCH",
      url: `/api/worktrees/${worktree.id}`,
      payload: { devCommandOverride: "pnpm dev --filter=api" },
    });

    expect(patched.statusCode).toBe(200);
    expect(patched.json()).toMatchObject({ devCommandOverride: "pnpm dev --filter=api" });

    const worktrees = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/worktrees`,
    });
    expect(worktrees.json()).toMatchObject([{ devCommandOverride: "pnpm dev --filter=api" }]);
  });

  it("should clear the dev command override of a worktree when patched with null", async () => {
    const project = await createProject();
    const created = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/worktrees`,
      payload: { newBranch: "feature-clear-override", base: { type: "default" } },
    });
    const worktree = created.json();
    await app.inject({
      method: "PATCH",
      url: `/api/worktrees/${worktree.id}`,
      payload: { devCommandOverride: "pnpm dev --filter=api" },
    });

    const cleared = await app.inject({
      method: "PATCH",
      url: `/api/worktrees/${worktree.id}`,
      payload: { devCommandOverride: null },
    });

    expect(cleared.statusCode).toBe(200);
    expect(cleared.json()).toMatchObject({ devCommandOverride: null });
  });

  it("should return 404 when patching the dev command override of a worktree id that does not exist", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/worktrees/00000000-0000-4000-8000-000000000000",
      payload: { devCommandOverride: "pnpm dev" },
    });

    expect(response.statusCode).toBe(404);
  });

  it("should return 404 when opening a terminal for a worktree id that does not exist", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/worktrees/00000000-0000-4000-8000-000000000000/open-terminal",
    });

    expect(response.statusCode).toBe(404);
  });

  async function waitUntil(
    condition: () => boolean | Promise<boolean>,
    { timeoutMs = 3000, intervalMs = 20 }: { timeoutMs?: number; intervalMs?: number } = {},
  ): Promise<void> {
    const start = Date.now();

    while (!(await condition())) {
      if (Date.now() - start > timeoutMs) {
        throw new Error("Timed out waiting for condition");
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  function writeDevScript(scriptBody: string): string {
    const dir = mkdtempSync(join(tmpdir(), "worktrees-manager-worktrees-plugin-scripts-"));
    repoPaths.push(dir);
    const scriptPath = join(dir, "dev.js");
    writeFileSync(scriptPath, scriptBody);

    return `node ${scriptPath}`;
  }

  describe("start/stop/logs", () => {
    it("should start the dev command, mark the worktree as running, and stop it back to stopped", async () => {
      const devCommand = writeDevScript(
        "console.log(`listening on ${process.env.PORT}`); setInterval(() => {}, 1000);",
      );
      const project = await createProject({ devCommand });
      const created = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/worktrees`,
        payload: { newBranch: "feature-start", base: { type: "default" } },
      });
      const worktree = created.json();
      mkdirSync(join(worktree.path, "node_modules"));

      const startResponse = await app.inject({
        method: "POST",
        url: `/api/worktrees/${worktree.id}/start`,
      });

      expect(startResponse.statusCode).toBe(200);
      expect(startResponse.json()).toMatchObject({ processStatus: "running" });

      const stopResponse = await app.inject({
        method: "POST",
        url: `/api/worktrees/${worktree.id}/stop`,
      });

      expect(stopResponse.statusCode).toBe(200);
      expect(stopResponse.json()).toMatchObject({ processStatus: "stopped", pid: null });

      const worktrees = await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/worktrees`,
      });
      expect(worktrees.json()).toMatchObject([{ processStatus: "stopped", pid: null }]);
    });

    it("should report detected ports from the dev command's own output while running", async () => {
      const devCommand = writeDevScript(
        "console.log('app-a - Local: http://localhost:3001'); setInterval(() => {}, 1000);",
      );
      const project = await createProject({ devCommand });
      const created = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/worktrees`,
        payload: { newBranch: "feature-detected-ports", base: { type: "default" } },
      });
      const worktree = created.json();
      mkdirSync(join(worktree.path, "node_modules"));

      const startResponse = await app.inject({
        method: "POST",
        url: `/api/worktrees/${worktree.id}/start`,
      });

      expect(startResponse.statusCode).toBe(200);

      await waitUntil(async () => {
        const response = await app.inject({
          method: "GET",
          url: `/api/projects/${project.id}/worktrees`,
        });
        const [reportedWorktree] = response.json();
        return (reportedWorktree.detectedPorts ?? []).length > 0;
      });

      const worktrees = await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/worktrees`,
      });
      expect(worktrees.json()).toMatchObject([{ detectedPorts: [{ port: 3001, label: null }] }]);
    });

    it("should return 409 when starting a worktree that is already running", async () => {
      const devCommand = writeDevScript("setInterval(() => {}, 1000);");
      const project = await createProject({ devCommand });
      const created = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/worktrees`,
        payload: { newBranch: "feature-already-running", base: { type: "default" } },
      });
      const worktree = created.json();
      mkdirSync(join(worktree.path, "node_modules"));

      await app.inject({ method: "POST", url: `/api/worktrees/${worktree.id}/start` });
      const secondStart = await app.inject({
        method: "POST",
        url: `/api/worktrees/${worktree.id}/start`,
      });

      expect(secondStart.statusCode).toBe(409);
    });

    it("should return 409 when stopping a worktree that is not running", async () => {
      const project = await createProject();
      const created = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/worktrees`,
        payload: { newBranch: "feature-not-running", base: { type: "default" } },
      });
      const worktree = created.json();

      const response = await app.inject({
        method: "POST",
        url: `/api/worktrees/${worktree.id}/stop`,
      });

      expect(response.statusCode).toBe(409);
    });

    it("should return the log history in chronological order once the process has produced output", async () => {
      const devCommand = writeDevScript(
        "console.log('first line'); console.log('second line'); setInterval(() => {}, 1000);",
      );
      const project = await createProject({ devCommand });
      const created = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/worktrees`,
        payload: { newBranch: "feature-logs", base: { type: "default" } },
      });
      const worktree = created.json();
      mkdirSync(join(worktree.path, "node_modules"));

      await app.inject({ method: "POST", url: `/api/worktrees/${worktree.id}/start` });

      // No basta con "hay al menos 2 líneas": la línea informativa "▶
      // Arrancando…" se inserta antes del devCommand real, así que un umbral
      // por longitud puede quedar satisfecho antes de que llegue "second line".
      await waitUntil(async () => {
        const response = await app.inject({
          method: "GET",
          url: `/api/worktrees/${worktree.id}/logs`,
        });
        return response
          .json()
          .some((entry: { content: string }) => entry.content === "second line");
      });

      const logsResponse = await app.inject({
        method: "GET",
        url: `/api/worktrees/${worktree.id}/logs`,
      });

      expect(logsResponse.statusCode).toBe(200);
      // Los últimos dos son las líneas del devCommand real; antes de ellas
      // hay una línea informativa "▶ Arrancando…" que la propia app inserta.
      expect(logsResponse.json().slice(-2)).toMatchObject([
        { stream: "stdout", content: "first line" },
        { stream: "stdout", content: "second line" },
      ]);
    });

    it("should return 404 when starting/stopping/listing logs for a worktree id that does not exist", async () => {
      const missingId = "00000000-0000-4000-8000-000000000000";

      const responses = await Promise.all([
        app.inject({ method: "POST", url: `/api/worktrees/${missingId}/start` }),
        app.inject({ method: "POST", url: `/api/worktrees/${missingId}/stop` }),
        app.inject({ method: "GET", url: `/api/worktrees/${missingId}/logs` }),
      ]);

      expect(responses.every((response) => response.statusCode === 404)).toBe(true);
    });
  });
});
