import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
    writeProjectConfigFile(repoPath, { devCommand: "pnpm dev" });

    expect(readProjectConfigFile(repoPath)).toEqual({ devCommand: "pnpm dev" });
  });

  it("should throw InvalidProjectConfigFileError when the config file is not valid JSON", () => {
    writeFileSync(join(repoPath, CONFIG_FILE_NAME), "{ not valid json", "utf-8");

    expect(() => readProjectConfigFile(repoPath)).toThrow(InvalidProjectConfigFileError);
  });

  it("should throw InvalidProjectConfigFileError when the config file does not match the schema", () => {
    writeFileSync(join(repoPath, CONFIG_FILE_NAME), JSON.stringify({ devCommand: "" }), "utf-8");

    expect(() => readProjectConfigFile(repoPath)).toThrow(InvalidProjectConfigFileError);
  });

  it("should ignore leftover fields from an older config file format", () => {
    writeFileSync(
      join(repoPath, CONFIG_FILE_NAME),
      JSON.stringify({ devCommand: "pnpm dev", portRangeStart: 3000, portRangeEnd: 3099 }),
      "utf-8",
    );

    expect(readProjectConfigFile(repoPath)).toEqual({ devCommand: "pnpm dev" });
  });

  it("should overwrite an existing config file when writing again with new values", () => {
    writeProjectConfigFile(repoPath, { devCommand: "pnpm dev" });
    writeProjectConfigFile(repoPath, { devCommand: "npm start" });

    expect(readProjectConfigFile(repoPath)).toEqual({ devCommand: "npm start" });
  });

  it("should round-trip postCreateCommand when present", () => {
    writeProjectConfigFile(repoPath, {
      devCommand: "pnpm dev",
      postCreateCommand: "pnpm db:migrate",
    });

    expect(readProjectConfigFile(repoPath)).toEqual({
      devCommand: "pnpm dev",
      postCreateCommand: "pnpm db:migrate",
    });
  });

  it("should omit postCreateCommand from the written file when not provided", () => {
    writeProjectConfigFile(repoPath, { devCommand: "pnpm dev" });

    const rawContent = readFileSync(join(repoPath, CONFIG_FILE_NAME), "utf-8");
    expect(JSON.parse(rawContent)).not.toHaveProperty("postCreateCommand");
  });
});
