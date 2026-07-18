import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { copyGitignoredEnvFiles } from "./env-files.js";

describe("copyGitignoredEnvFiles", () => {
  let repoPath: string;
  let worktreePath: string;
  let tempDirs: string[];

  beforeEach(() => {
    repoPath = mkdtempSync(join(tmpdir(), "worktrees-manager-env-files-repo-"));
    worktreePath = mkdtempSync(join(tmpdir(), "worktrees-manager-env-files-worktree-"));
    tempDirs = [repoPath, worktreePath];

    execFileSync("git", ["init"], { cwd: repoPath, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: repoPath,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: repoPath, stdio: "ignore" });
    writeFileSync(join(repoPath, ".gitignore"), ".env\n.env.*\n!.env.example\n");
    execFileSync("git", ["add", ".gitignore"], { cwd: repoPath, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "initial commit"], { cwd: repoPath, stdio: "ignore" });
  });

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("should copy a gitignored root .env file into the worktree, preserving its content", async () => {
    writeFileSync(join(repoPath, ".env"), "SECRET=real-value\n");

    const copied = await copyGitignoredEnvFiles(repoPath, worktreePath);

    expect(copied).toEqual([".env"]);
    expect(readFileSync(join(worktreePath, ".env"), "utf-8")).toBe("SECRET=real-value\n");
  });

  it("should copy nested gitignored .env files, preserving their relative path", async () => {
    mkdirSync(join(repoPath, "apps", "api"), { recursive: true });
    writeFileSync(join(repoPath, "apps", "api", ".env"), "DATABASE_URL=postgres://localhost\n");

    const copied = await copyGitignoredEnvFiles(repoPath, worktreePath);

    expect(copied).toEqual(["apps/api/.env"]);
    expect(readFileSync(join(worktreePath, "apps", "api", ".env"), "utf-8")).toBe(
      "DATABASE_URL=postgres://localhost\n",
    );
  });

  it("should not copy .env.example, since it is explicitly un-ignored by the project's own .gitignore", async () => {
    writeFileSync(join(repoPath, ".env.example"), "SECRET=\n");
    execFileSync("git", ["add", ".env.example"], { cwd: repoPath, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "add .env.example"], { cwd: repoPath, stdio: "ignore" });

    const copied = await copyGitignoredEnvFiles(repoPath, worktreePath);

    expect(copied).toEqual([]);
  });

  it("should return an empty array when the repo has no .env files at all", async () => {
    const copied = await copyGitignoredEnvFiles(repoPath, worktreePath);

    expect(copied).toEqual([]);
  });
});
