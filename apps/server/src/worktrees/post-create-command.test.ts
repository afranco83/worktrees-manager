import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import type { Server } from "socket.io";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "../db/migrate.js";
import { insertProject } from "../projects/repository.js";
import { buildCreateProjectInput } from "../projects/test-fixtures.js";
import { listRecentLogEntries } from "./log-repository.js";
import { runPostCreateCommand } from "./post-create-command.js";
import { insertWorktree } from "./repository.js";

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

describe("runPostCreateCommand", () => {
  let db: Database.Database;
  let worktreePath: string;
  let worktreeId: string;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    worktreePath = mkdtempSync(join(tmpdir(), "worktrees-manager-post-create-command-"));
    // `node_modules` presente por defecto: estos tests cubren el propio
    // comando, no el paso de instalación (que tiene su describe aparte).
    mkdirSync(join(worktreePath, "node_modules"));

    const project = insertProject(db, buildCreateProjectInput());
    const worktree = insertWorktree(db, {
      projectId: project.id,
      branch: "feature-a",
      path: worktreePath,
      port: 4100,
      baseCommitSha: "0000000000000000000000000000000000000000",
    });
    worktreeId = worktree.id;
  });

  afterEach(() => {
    rmSync(worktreePath, { recursive: true, force: true });
  });

  it("should log the command's stdout and a success line when it exits with code 0", async () => {
    const { io, emitted } = buildFakeIo();

    await runPostCreateCommand({
      db,
      io,
      worktreeId,
      worktreePath,
      command: "echo 'migraciones aplicadas'",
    });

    const contents = listRecentLogEntries(db, worktreeId, 10).map((entry) => entry.content);
    expect(contents).toContain("migraciones aplicadas");
    expect(contents).toContain("✓ Comando posterior a la creación completado");
    expect(emitted.filter((entry) => entry.event === "log-entry").length).toBeGreaterThanOrEqual(2);
  });

  it("should log stderr and a failure line when the command exits with a non-zero code, without throwing", async () => {
    const { io } = buildFakeIo();

    await expect(
      runPostCreateCommand({
        db,
        io,
        worktreeId,
        worktreePath,
        command: "echo 'fallo real' >&2; exit 1",
      }),
    ).resolves.toBeUndefined();

    const entries = listRecentLogEntries(db, worktreeId, 10);
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stream: "stderr", content: "fallo real" }),
        expect.objectContaining({
          stream: "stderr",
          content: "✗ Comando posterior a la creación ha fallado (código 1)",
        }),
      ]),
    );
  });

  describe("dependency installation", () => {
    it("should install dependencies first when node_modules is missing, then run the command", async () => {
      rmSync(join(worktreePath, "node_modules"), { recursive: true, force: true });
      const { io } = buildFakeIo();

      await runPostCreateCommand({
        db,
        io,
        worktreeId,
        worktreePath,
        command: "echo 'migraciones aplicadas'",
        detectInstallCommand: () => "echo 'deps instaladas'",
      });

      const contents = listRecentLogEntries(db, worktreeId, 10).map((entry) => entry.content);
      expect(contents).toContain("deps instaladas");
      expect(contents).toContain("migraciones aplicadas");
      expect(contents.indexOf("deps instaladas")).toBeLessThan(
        contents.indexOf("migraciones aplicadas"),
      );
      expect(contents).toContain("✓ Comando posterior a la creación completado");
    });

    it("should not run the command when installing dependencies fails", async () => {
      rmSync(join(worktreePath, "node_modules"), { recursive: true, force: true });
      const { io } = buildFakeIo();

      await runPostCreateCommand({
        db,
        io,
        worktreeId,
        worktreePath,
        command: "echo 'esto no debería ejecutarse nunca'",
        detectInstallCommand: () => "exit 1",
      });

      const contents = listRecentLogEntries(db, worktreeId, 10).map((entry) => entry.content);
      expect(contents).not.toContain("esto no debería ejecutarse nunca");
      expect(contents).toContain(
        "✗ No se han podido instalar las dependencias; se aborta el comando posterior a la creación",
      );
    });

    it("should skip installation when node_modules already exists", async () => {
      const { io } = buildFakeIo();

      await runPostCreateCommand({
        db,
        io,
        worktreeId,
        worktreePath,
        command: "echo 'migraciones aplicadas'",
        detectInstallCommand: () => "echo 'esto no debería ejecutarse nunca'",
      });

      const contents = listRecentLogEntries(db, worktreeId, 10).map((entry) => entry.content);
      expect(contents).not.toContain("esto no debería ejecutarse nunca");
      expect(contents).toContain("migraciones aplicadas");
    });
  });
});
