import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

import Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "./app.js";
import { runMigrations } from "./db/migrate.js";
import { insertProject } from "./projects/repository.js";
import { buildCreateProjectInput } from "./projects/test-fixtures.js";
import { insertWorktree } from "./worktrees/repository.js";

/**
 * Un handshake de WebSocket no se puede ejercer con `fastify.inject()` (que no
 * abre un socket TCP real) — esta es la única suite del backend que necesita
 * `.listen()` real + un cliente `socket.io-client` real conectándose, como
 * excepción legítima y acotada al patrón de testing del canon.
 */
describe("socket.io wiring", () => {
  let db: Database.Database;
  let app: FastifyInstance;
  let baseUrl: string;
  let client: ClientSocket | undefined;
  let tempDirs: string[];

  beforeEach(async () => {
    db = new Database(":memory:");
    runMigrations(db);
    app = buildApp(db, { logger: false });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const { port } = app.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    tempDirs = [];
  });

  afterEach(async () => {
    client?.disconnect();
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    // Uno de los tests ya cierra `app` explícitamente para verificar el cierre
    // ordenado — cerrarla dos veces es un no-op seguro que se ignora aquí.
    await app.close().catch(() => undefined);
  });

  function connectClient(): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const socket = ioClient(baseUrl, { transports: ["websocket"] });
      socket.once("connect", () => resolve(socket));
      socket.once("connect_error", reject);
    });
  }

  it("should accept a real WebSocket connection", async () => {
    client = await connectClient();

    expect(client.connected).toBe(true);
  });

  it("should deliver process-status and log-entry events to a client joined to the worktree's room", async () => {
    const dir = mkdtempSync(join(tmpdir(), "worktrees-manager-socket-test-"));
    tempDirs.push(dir);
    mkdirSync(join(dir, "node_modules"));
    const scriptPath = join(dir, "dev.js");
    writeFileSync(
      scriptPath,
      "console.log('hello from the dev server'); setInterval(() => {}, 1000);",
    );

    const project = insertProject(
      db,
      buildCreateProjectInput({ devCommand: `node ${scriptPath}` }),
    );
    const worktree = insertWorktree(db, {
      projectId: project.id,
      branch: "feature-socket",
      path: dir,
      port: 4100,
    });

    client = await connectClient();
    const receivedEvents: Array<{ event: string; payload: unknown }> = [];
    client.on("process-status", (payload) =>
      receivedEvents.push({ event: "process-status", payload }),
    );
    client.on("log-entry", (payload) => receivedEvents.push({ event: "log-entry", payload }));
    client.emit("join-worktree", worktree.id);
    // Da tiempo al servidor a procesar el `join-worktree` antes de arrancar,
    // para no perder los primeros eventos por una carrera con el propio test.
    await new Promise((resolve) => setTimeout(resolve, 100));

    await app.processManager.start(worktree, project);

    const start = Date.now();
    while (
      !receivedEvents.some((entry) => entry.event === "log-entry") &&
      Date.now() - start < 3000
    ) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    expect(receivedEvents.some((entry) => entry.event === "process-status")).toBe(true);
    expect(receivedEvents.some((entry) => entry.event === "log-entry")).toBe(true);
  });

  it("should close cleanly without hanging, even with a connected client", async () => {
    client = await connectClient();

    await expect(app.close()).resolves.toBeUndefined();
  });
});
