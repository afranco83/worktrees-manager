import Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import { runMigrations } from "../db/migrate.js";

describe("settings plugin", () => {
  let db: Database.Database;
  let app: FastifyInstance;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    app = buildApp(db, { logger: false });
  });

  it("should return the seeded defaults", async () => {
    const response = await app.inject({ method: "GET", url: "/api/settings" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      preferredTerminalCommand: null,
      portRangeStart: 3000,
      portRangeEnd: 3999,
    });
  });

  it("should update the preferred terminal command", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/settings",
      payload: { preferredTerminalCommand: "open -a iTerm {path}" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ preferredTerminalCommand: "open -a iTerm {path}" });
  });

  it("should update the global port range when both bounds are sent together", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/settings",
      payload: { portRangeStart: 4000, portRangeEnd: 4999 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ portRangeStart: 4000, portRangeEnd: 4999 });
  });

  it("should reject updating only one port bound without the other", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/settings",
      payload: { portRangeStart: 4000 },
    });

    expect(response.statusCode).toBe(400);
  });

  it("should reject a port range where start is not less than end", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/settings",
      payload: { portRangeStart: 5000, portRangeEnd: 4000 },
    });

    expect(response.statusCode).toBe(400);
  });

  it("should reject a preferred terminal command without the {path} placeholder", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/settings",
      payload: { preferredTerminalCommand: "open -a iTerm" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("should list the terminal presets for the current platform", async () => {
    const response = await app.inject({ method: "GET", url: "/api/settings/terminal-presets" });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.platform).toBe(process.platform);
    expect(Array.isArray(body.presets)).toBe(true);
    expect(body.presets.length).toBeGreaterThan(0);
  });
});
