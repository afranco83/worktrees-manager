import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "../db/migrate.js";
import { getSettings, updateSettings } from "./repository.js";

describe("settings repository", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
  });

  it("should return the seeded defaults when nothing has been updated yet", () => {
    expect(getSettings(db)).toEqual({
      preferredTerminalCommand: null,
      portRangeStart: 3000,
      portRangeEnd: 3999,
    });
  });

  it("should persist a partial update while keeping the rest of the settings", () => {
    updateSettings(db, { preferredTerminalCommand: "open -a iTerm {path}" });

    expect(getSettings(db)).toEqual({
      preferredTerminalCommand: "open -a iTerm {path}",
      portRangeStart: 3000,
      portRangeEnd: 3999,
    });
  });

  it("should persist an updated port range", () => {
    const updated = updateSettings(db, { portRangeStart: 4000, portRangeEnd: 4999 });

    expect(updated).toEqual({
      preferredTerminalCommand: null,
      portRangeStart: 4000,
      portRangeEnd: 4999,
    });
    expect(getSettings(db)).toEqual(updated);
  });

  it("should be able to clear the preferred terminal command back to null", () => {
    updateSettings(db, { preferredTerminalCommand: "open -a iTerm {path}" });

    updateSettings(db, { preferredTerminalCommand: null });

    expect(getSettings(db).preferredTerminalCommand).toBeNull();
  });
});
