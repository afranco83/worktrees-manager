import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "./app.js";
import { runMigrations } from "./db/migrate.js";

describe("estáticos del dashboard en producción", () => {
  let db: Database.Database;
  let app: FastifyInstance;
  let publicDir: string;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
  });

  afterEach(async () => {
    await app?.close();
    if (publicDir) {
      rmSync(publicDir, { recursive: true, force: true });
    }
  });

  it("should return the default 404 when no build has been copied to publicDir", async () => {
    publicDir = join(mkdtempSync(join(tmpdir(), "worktrees-manager-static-")), "nonexistent");
    app = buildApp(db, { logger: false, publicDir });

    const response = await app.inject({ method: "GET", url: "/some-client-route" });

    expect(response.statusCode).toBe(404);
  });

  it("should serve an existing static asset by its exact path", async () => {
    publicDir = mkdtempSync(join(tmpdir(), "worktrees-manager-static-"));
    mkdirSync(join(publicDir, "assets"), { recursive: true });
    writeFileSync(join(publicDir, "assets", "app.js"), "console.log('hola');");
    writeFileSync(join(publicDir, "index.html"), "<html>index real</html>");
    app = buildApp(db, { logger: false, publicDir });

    const response = await app.inject({ method: "GET", url: "/assets/app.js" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("console.log('hola');");
  });

  it("should fall back to index.html for an unmatched GET route (client-side routing)", async () => {
    publicDir = mkdtempSync(join(tmpdir(), "worktrees-manager-static-"));
    writeFileSync(join(publicDir, "index.html"), "<html>index real</html>");
    app = buildApp(db, { logger: false, publicDir });

    const response = await app.inject({ method: "GET", url: "/projects/abc-123" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toBe("<html>index real</html>");
  });

  it("should return a JSON 404 (not index.html) for an unmatched API route", async () => {
    publicDir = mkdtempSync(join(tmpdir(), "worktrees-manager-static-"));
    writeFileSync(join(publicDir, "index.html"), "<html>index real</html>");
    app = buildApp(db, { logger: false, publicDir });

    const response = await app.inject({ method: "GET", url: "/api/does-not-exist" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Not Found",
      message: "Ruta no encontrada",
      statusCode: 404,
    });
  });
});
