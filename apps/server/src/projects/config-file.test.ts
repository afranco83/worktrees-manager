import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { InvalidProjectConfigFileError } from "../errors.js";
import { CONFIG_FILE_NAME, readProjectConfigFile, writeProjectConfigFile } from "./config-file.js";

describe("config-file", () => {
  let repoPath: string;

  beforeEach(() => {
    repoPath = mkdtempSync(join(tmpdir(), "worktrees-manager-config-file-"));
  });

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("should return null when the repo has no config file", () => {
    expect(readProjectConfigFile(repoPath)).toBeNull();
  });

  it("should return the parsed config when the repo has a valid config file", () => {
    writeProjectConfigFile(repoPath, {
      devCommand: "pnpm dev",
      portRangeStart: 3000,
      portRangeEnd: 3099,
    });

    expect(readProjectConfigFile(repoPath)).toEqual({
      devCommand: "pnpm dev",
      portRangeStart: 3000,
      portRangeEnd: 3099,
    });
  });

  it("should throw InvalidProjectConfigFileError when the config file is not valid JSON", () => {
    writeFileSync(join(repoPath, CONFIG_FILE_NAME), "{ not valid json", "utf-8");

    expect(() => readProjectConfigFile(repoPath)).toThrow(InvalidProjectConfigFileError);
  });

  it("should throw InvalidProjectConfigFileError when the config file does not match the schema", () => {
    writeFileSync(
      join(repoPath, CONFIG_FILE_NAME),
      JSON.stringify({ devCommand: "pnpm dev" }),
      "utf-8",
    );

    expect(() => readProjectConfigFile(repoPath)).toThrow(InvalidProjectConfigFileError);
  });

  it("should overwrite an existing config file when writing again with new values", () => {
    writeProjectConfigFile(repoPath, {
      devCommand: "pnpm dev",
      portRangeStart: 3000,
      portRangeEnd: 3099,
    });
    writeProjectConfigFile(repoPath, {
      devCommand: "npm start",
      portRangeStart: 4000,
      portRangeEnd: 4099,
    });

    expect(readProjectConfigFile(repoPath)).toEqual({
      devCommand: "npm start",
      portRangeStart: 4000,
      portRangeEnd: 4099,
    });
  });
});
