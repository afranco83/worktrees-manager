import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import type { Server } from "socket.io";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "../db/migrate.js";
import {
  DevCommandSpawnError,
  WorktreeProcessAlreadyRunningError,
  WorktreeProcessNotRunningError,
} from "../errors.js";
import { insertProject } from "../projects/repository.js";
import type { Project } from "../projects/schemas.js";
import { buildCreateProjectInput } from "../projects/test-fixtures.js";
import { listRecentLogEntries } from "./log-repository.js";
import { createProcessManager, type ProcessManager } from "./process-manager.js";
import { getWorktreeById, insertWorktree } from "./repository.js";
import type { Worktree } from "./schemas.js";

interface EmittedEvent {
  room: string;
  event: string;
  payload: unknown;
}

function buildFakeIo(): { io: Server; emitted: EmittedEvent[] } {
  const emitted: EmittedEvent[] = [];
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => {
        emitted.push({ room, event, payload });
      },
    }),
  };

  return { io: io as unknown as Server, emitted };
}

async function waitUntil(
  condition: () => boolean,
  { timeoutMs = 3000, intervalMs = 20 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const start = Date.now();

  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

describe("process manager", () => {
  let db: Database.Database;
  let manager: ProcessManager;
  let emitted: EmittedEvent[];
  let baseProject: Project;
  let tempDirs: string[];

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);

    const fakeIo = buildFakeIo();
    emitted = fakeIo.emitted;
    manager = createProcessManager({ db, io: fakeIo.io });

    baseProject = insertProject(db, buildCreateProjectInput());
    tempDirs = [];
  });

  afterEach(async () => {
    await manager.stopAll();

    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * Escribe un script de dev temporal y da de alta un worktree apuntando a él.
   * Crea `node_modules` vacío por defecto para que estos tests no disparen el
   * paso de instalación de dependencias — ese comportamiento se cubre aparte
   * en el describe "dependency installation" de más abajo.
   */
  function setUpWorktree(
    scriptBody: string,
    options: { port?: number; withNodeModules?: boolean } = {},
  ): { worktree: Worktree; project: Project } {
    const dir = mkdtempSync(join(tmpdir(), "worktrees-manager-process-manager-"));
    tempDirs.push(dir);
    const scriptPath = join(dir, "dev.js");
    writeFileSync(scriptPath, scriptBody);

    if (options.withNodeModules ?? true) {
      mkdirSync(join(dir, "node_modules"));
    }

    const worktree = insertWorktree(db, {
      projectId: baseProject.id,
      branch: `feature-${tempDirs.length}`,
      path: dir,
      port: options.port ?? 4100 + tempDirs.length,
    });
    const project = { ...baseProject, devCommand: `node ${scriptPath}` };

    return { worktree, project };
  }

  it("should start a long-running dev command and mark the worktree as running", async () => {
    const { worktree, project } = setUpWorktree(
      "console.log(`listening on port ${process.env.PORT}`); setInterval(() => console.log('tick'), 30);",
    );

    await manager.start(worktree, project);

    expect(getWorktreeById(db, worktree.id)).toMatchObject({ processStatus: "running" });
    expect(getWorktreeById(db, worktree.id)?.pid).not.toBeNull();

    const statusEvents = emitted.filter((entry) => entry.event === "process-status");
    expect(
      statusEvents.map((entry) => (entry.payload as { processStatus: string }).processStatus),
    ).toEqual(["starting", "running"]);
  });

  it("should run the worktree's dev command override instead of the project's dev command when set", async () => {
    const { worktree: baseWorktree, project } = setUpWorktree(
      "console.log('project devCommand ran'); setInterval(() => {}, 1000);",
    );
    const overrideDir = mkdtempSync(join(tmpdir(), "worktrees-manager-process-manager-override-"));
    tempDirs.push(overrideDir);
    const overrideScriptPath = join(overrideDir, "override.js");
    writeFileSync(overrideScriptPath, "console.log('override ran'); setInterval(() => {}, 1000);");
    const worktree: Worktree = {
      ...baseWorktree,
      devCommandOverride: `node ${overrideScriptPath}`,
    };

    await manager.start(worktree, project);
    await waitUntil(() =>
      listRecentLogEntries(db, worktree.id, 20).some((entry) => entry.content === "override ran"),
    );

    const contents = listRecentLogEntries(db, worktree.id, 20).map((entry) => entry.content);
    expect(contents).toContain("override ran");
    expect(contents).not.toContain("project devCommand ran");
  });

  it("should pass the assigned port as the PORT environment variable", async () => {
    const { worktree, project } = setUpWorktree("console.log(`port=${process.env.PORT}`);", {
      port: 4321,
    });

    await manager.start(worktree, project);
    // No basta con "hay al menos una línea": la nueva línea informativa
    // "▶ Arrancando…" se inserta antes de spawnear el devCommand real, así
    // que satisface un `length > 0` antes de que llegue la línea que importa.
    await waitUntil(() =>
      listRecentLogEntries(db, worktree.id, 10).some((entry) => entry.content === "port=4321"),
    );

    const entries = listRecentLogEntries(db, worktree.id, 10);
    expect(entries.some((entry) => entry.content === "port=4321")).toBe(true);
  });

  it("should stream stdout and stderr lines as log entries and socket events", async () => {
    const { worktree, project } = setUpWorktree(
      "console.log('hello from stdout'); console.error('hello from stderr'); setInterval(() => {}, 1000);",
    );

    await manager.start(worktree, project);
    await waitUntil(() =>
      listRecentLogEntries(db, worktree.id, 10).some(
        (entry) => entry.content === "hello from stderr",
      ),
    );

    const entries = listRecentLogEntries(db, worktree.id, 10);
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stream: "stdout", content: "hello from stdout" }),
        expect.objectContaining({ stream: "stderr", content: "hello from stderr" }),
      ]),
    );

    const logEvents = emitted.filter((entry) => entry.event === "log-entry");
    expect(logEvents.length).toBeGreaterThanOrEqual(2);
    // El payload lleva `{worktreeId, entry}`, no el `LogEntry` a secas: un
    // cliente puede estar unido a varias salas de worktree a la vez (ver
    // `use-worktrees.ts`), así que sin `worktreeId` no habría forma de
    // atribuir la línea al worktree correcto.
    expect(
      logEvents.every(
        (entry) => (entry.payload as { worktreeId: string }).worktreeId === worktree.id,
      ),
    ).toBe(true);
    expect(logEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          payload: expect.objectContaining({
            worktreeId: worktree.id,
            entry: expect.objectContaining({ stream: "stdout", content: "hello from stdout" }),
          }),
        }),
      ]),
    );
  });

  it("should mark the worktree as stopped after an explicit stop, even though the process is killed by signal", async () => {
    const { worktree, project } = setUpWorktree("setInterval(() => {}, 1000);");

    await manager.start(worktree, project);
    await manager.stop(worktree.id);

    expect(getWorktreeById(db, worktree.id)).toMatchObject({ processStatus: "stopped", pid: null });
  });

  it("should mark the worktree as stopped when the dev command exits cleanly on its own", async () => {
    const { worktree, project } = setUpWorktree("console.log('done'); process.exit(0);");

    await manager.start(worktree, project);
    await waitUntil(() => getWorktreeById(db, worktree.id)?.processStatus === "stopped");

    expect(getWorktreeById(db, worktree.id)).toMatchObject({ processStatus: "stopped", pid: null });
  });

  it("should mark the worktree as error when the dev command exits with a non-zero code on its own", async () => {
    const { worktree, project } = setUpWorktree("console.error('boom'); process.exit(1);");

    await manager.start(worktree, project);
    await waitUntil(() => getWorktreeById(db, worktree.id)?.processStatus === "error");

    expect(getWorktreeById(db, worktree.id)).toMatchObject({ processStatus: "error", pid: null });
  });

  it("should throw DevCommandSpawnError when the worktree path does not exist", async () => {
    const worktree = insertWorktree(db, {
      projectId: baseProject.id,
      branch: "feature-missing-path",
      path: "/this/path/does/not/exist/at/all",
      port: 4999,
    });
    const project = { ...baseProject, devCommand: "echo hi" };

    await expect(manager.start(worktree, project)).rejects.toThrow(DevCommandSpawnError);
    expect(getWorktreeById(db, worktree.id)).toMatchObject({ processStatus: "error" });
  });

  it("should reject starting a worktree that is already running", async () => {
    const { worktree, project } = setUpWorktree("setInterval(() => {}, 1000);");

    await manager.start(worktree, project);

    await expect(manager.start(worktree, project)).rejects.toThrow(
      WorktreeProcessAlreadyRunningError,
    );
  });

  it("should reject stopping a worktree that has no process running", async () => {
    const worktree = insertWorktree(db, {
      projectId: baseProject.id,
      branch: "feature-not-running",
      path: "/repos/foo.worktrees/feature-a",
      port: 4998,
    });

    await expect(manager.stop(worktree.id)).rejects.toThrow(WorktreeProcessNotRunningError);
  });

  it("should prune log entries beyond the retention limit (2000) once the process has produced enough lines", async () => {
    const lineCount = 2100;
    const { worktree, project } = setUpWorktree(
      `for (let i = 0; i < ${lineCount}; i++) { console.log("line " + i); } process.exit(0);`,
    );

    await manager.start(worktree, project);
    await waitUntil(() => getWorktreeById(db, worktree.id)?.processStatus === "stopped", {
      timeoutMs: 10000,
    });

    const entries = listRecentLogEntries(db, worktree.id, 10000);
    expect(entries).toHaveLength(2000);
    expect(entries[0]?.content).toBe("line 100");
    expect(entries.at(-1)?.content).toBe("line 2099");
  });

  /**
   * `detectInstallCommand` inyectado devuelve siempre un script `node`
   * controlado (rápido y determinista) en vez de delegar en la detección real
   * por lockfile — evita depender de `npm`/`pnpm` reales en el test.
   */
  function setUpManagerWithInstallScript(installScriptBody: string): {
    manager: ProcessManager;
    emitted: EmittedEvent[];
  } {
    const installDir = mkdtempSync(join(tmpdir(), "worktrees-manager-install-script-"));
    tempDirs.push(installDir);
    const installScriptPath = join(installDir, "install.js");
    writeFileSync(installScriptPath, installScriptBody);

    const fakeIo = buildFakeIo();

    return {
      manager: createProcessManager({
        db,
        io: fakeIo.io,
        detectInstallCommand: () => `node ${installScriptPath}`,
      }),
      emitted: fakeIo.emitted,
    };
  }

  describe("dependency installation", () => {
    it("should install dependencies before starting when node_modules is missing", async () => {
      const { manager: installingManager } = setUpManagerWithInstallScript(
        "require('fs').mkdirSync(process.cwd() + '/node_modules'); console.log('deps instaladas');",
      );
      const { worktree, project } = setUpWorktree(
        "console.log('servidor arrancado'); setInterval(() => {}, 1000);",
        {
          withNodeModules: false,
        },
      );

      await installingManager.start(worktree, project);
      await waitUntil(() =>
        listRecentLogEntries(db, worktree.id, 20).some(
          (entry) => entry.content === "servidor arrancado",
        ),
      );

      const contents = listRecentLogEntries(db, worktree.id, 20).map((entry) => entry.content);
      expect(contents).toEqual(expect.arrayContaining(["deps instaladas", "servidor arrancado"]));
      // La instalación debe completarse ANTES de arrancar el devCommand real.
      expect(contents.indexOf("deps instaladas")).toBeLessThan(
        contents.indexOf("servidor arrancado"),
      );
      expect(getWorktreeById(db, worktree.id)).toMatchObject({ processStatus: "running" });

      await installingManager.stopAll();
    });

    it("should skip installation when node_modules already exists", async () => {
      const { manager: installingManager, emitted: installEmitted } = setUpManagerWithInstallScript(
        "console.log('esto no debería ejecutarse nunca');",
      );
      const { worktree, project } = setUpWorktree(
        "console.log('servidor arrancado'); setInterval(() => {}, 1000);",
        {
          withNodeModules: true,
        },
      );

      await installingManager.start(worktree, project);
      await waitUntil(() =>
        listRecentLogEntries(db, worktree.id, 20).some(
          (entry) => entry.content === "servidor arrancado",
        ),
      );

      const contents = listRecentLogEntries(db, worktree.id, 20).map((entry) => entry.content);
      expect(contents).not.toContain("esto no debería ejecutarse nunca");
      expect(installEmitted.some((entry) => entry.event === "log-entry")).toBe(true);

      await installingManager.stopAll();
    });

    it("should mark the worktree as error and never start the dev command when installation fails", async () => {
      const { manager: installingManager } = setUpManagerWithInstallScript(
        "console.error('fallo de instalación'); process.exit(1);",
      );
      const { worktree, project } = setUpWorktree(
        "console.log('servidor arrancado'); setInterval(() => {}, 1000);",
        {
          withNodeModules: false,
        },
      );

      await expect(installingManager.start(worktree, project)).rejects.toThrow(
        DevCommandSpawnError,
      );

      const contents = listRecentLogEntries(db, worktree.id, 20).map((entry) => entry.content);
      expect(contents).toContain("fallo de instalación");
      expect(contents).not.toContain("servidor arrancado");
      expect(getWorktreeById(db, worktree.id)).toMatchObject({ processStatus: "error", pid: null });

      await installingManager.stopAll();
    });

    it("should mark the worktree as stopped, without starting the dev command, when stopped mid-installation", async () => {
      const { manager: installingManager } = setUpManagerWithInstallScript(
        "setInterval(() => {}, 1000);",
      );
      const { worktree, project } = setUpWorktree(
        "console.log('servidor arrancado'); setInterval(() => {}, 1000);",
        {
          withNodeModules: false,
        },
      );

      const startPromise = installingManager.start(worktree, project);
      await waitUntil(() => getWorktreeById(db, worktree.id)?.processStatus === "starting");

      await installingManager.stop(worktree.id);
      await startPromise;

      const contents = listRecentLogEntries(db, worktree.id, 20).map((entry) => entry.content);
      expect(contents).not.toContain("servidor arrancado");
      expect(getWorktreeById(db, worktree.id)).toMatchObject({
        processStatus: "stopped",
        pid: null,
      });
    });
  });

  describe("detected ports", () => {
    it("should return an empty array for a worktree with no process tracked", () => {
      expect(manager.getDetectedPorts("00000000-0000-4000-8000-000000000000")).toEqual([]);
    });

    it("should detect ports announced via localhost URLs in the dev command's own output, matching a monorepo starting several apps", async () => {
      const { worktree, project } = setUpWorktree(
        `console.log('app-a ready - Local: http://localhost:3001');
         console.log('app-b ready - Local: http://localhost:6006/');
         setInterval(() => {}, 1000);`,
      );

      await manager.start(worktree, project);
      await waitUntil(() => manager.getDetectedPorts(worktree.id).length >= 2);

      expect(manager.getDetectedPorts(worktree.id)).toEqual([
        { port: 3001, label: null },
        { port: 6006, label: null },
      ]);

      const portEvents = emitted.filter((entry) => entry.event === "detected-ports");
      expect(portEvents.at(-1)?.payload).toMatchObject({
        ports: [
          { port: 3001, label: null },
          { port: 6006, label: null },
        ],
      });
    });

    it("should not detect the same port twice", async () => {
      const { worktree, project } = setUpWorktree(
        `console.log('Local: http://localhost:3001');
         console.log('reprinted: http://localhost:3001');
         setInterval(() => {}, 1000);`,
      );

      await manager.start(worktree, project);
      await waitUntil(() => manager.getDetectedPorts(worktree.id).length >= 1);
      // Da tiempo a que la segunda línea (idéntica) se procese también.
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(manager.getDetectedPorts(worktree.id)).toEqual([{ port: 3001, label: null }]);
      expect(emitted.filter((entry) => entry.event === "detected-ports")).toHaveLength(1);
    });

    it("should label each detected port with its app when the output is prefixed turbo-style", async () => {
      const { worktree, project } = setUpWorktree(
        `console.log('storefront:dev: - Local: http://localhost:3000');
         console.log('@store-demo/api:dev: - Local: http://localhost:4000');
         setInterval(() => {}, 1000);`,
      );

      await manager.start(worktree, project);
      await waitUntil(() => manager.getDetectedPorts(worktree.id).length >= 2);

      expect(manager.getDetectedPorts(worktree.id)).toEqual([
        { port: 3000, label: "storefront" },
        { port: 4000, label: "api" },
      ]);
    });

    it("should not mistake a timestamp-like prefix for an app label", async () => {
      const { worktree, project } = setUpWorktree(
        "console.log('10:30:00 Local: http://localhost:3001'); setInterval(() => {}, 1000);",
      );

      await manager.start(worktree, project);
      await waitUntil(() => manager.getDetectedPorts(worktree.id).length >= 1);

      expect(manager.getDetectedPorts(worktree.id)).toEqual([{ port: 3001, label: null }]);
    });

    it("should clear detected ports once the worktree is stopped", async () => {
      const { worktree, project } = setUpWorktree(
        "console.log('Local: http://localhost:3001'); setInterval(() => {}, 1000);",
      );

      await manager.start(worktree, project);
      await waitUntil(() => manager.getDetectedPorts(worktree.id).length >= 1);

      await manager.stop(worktree.id);

      expect(manager.getDetectedPorts(worktree.id)).toEqual([]);
    });
  });

  describe("process step feedback", () => {
    it("should emit installing-dependencies then starting-dev-command then null while starting", async () => {
      const { manager: installingManager, emitted: installEmitted } = setUpManagerWithInstallScript(
        "console.log('instalando');",
      );
      const { worktree, project } = setUpWorktree("setInterval(() => {}, 1000);", {
        withNodeModules: false,
      });

      await installingManager.start(worktree, project);

      const stepEvents = installEmitted.filter((entry) => entry.event === "process-step");
      expect(stepEvents.map((entry) => (entry.payload as { step: string | null }).step)).toEqual([
        "installing-dependencies",
        "starting-dev-command",
        null,
      ]);

      await installingManager.stopAll();
    });

    it("should skip the installing-dependencies step when node_modules already exists", async () => {
      const { worktree, project } = setUpWorktree("setInterval(() => {}, 1000);", {
        withNodeModules: true,
      });

      await manager.start(worktree, project);

      const stepEvents = emitted.filter((entry) => entry.event === "process-step");
      expect(stepEvents.map((entry) => (entry.payload as { step: string | null }).step)).toEqual([
        "starting-dev-command",
        null,
      ]);
    });
  });
});
