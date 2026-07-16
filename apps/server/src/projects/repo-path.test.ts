import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { inspectRepoPath } from "./repo-path.js";

function initGitRepo(repoPath: string): void {
  execFileSync("git", ["init"], { cwd: repoPath, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@example.com"], {
    cwd: repoPath,
    stdio: "ignore",
  });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: repoPath, stdio: "ignore" });
}

function commitInGitRepo(repoPath: string): void {
  writeFileSync(join(repoPath, "README.md"), "# test\n");
  execFileSync("git", ["add", "."], { cwd: repoPath, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "initial commit"], { cwd: repoPath, stdio: "ignore" });
}

describe("inspectRepoPath", () => {
  let repoPath: string;

  afterEach(() => {
    if (repoPath && existsSync(repoPath)) {
      chmodSync(repoPath, 0o755);
      rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it("should report exists=false when the path does not exist", () => {
    repoPath = join(tmpdir(), "worktrees-manager-repo-path-does-not-exist");

    expect(inspectRepoPath(repoPath)).toEqual({
      exists: false,
      isGitRepo: false,
      hasCommits: false,
      isWritable: false,
    });
  });

  it("should report isGitRepo=false and hasCommits=false for a plain directory", () => {
    repoPath = mkdtempSync(join(tmpdir(), "worktrees-manager-repo-path-plain-"));

    expect(inspectRepoPath(repoPath)).toEqual({
      exists: true,
      isGitRepo: false,
      hasCommits: false,
      isWritable: true,
    });
  });

  it("should report isGitRepo=true and hasCommits=false for a git repo without any commit", () => {
    repoPath = mkdtempSync(join(tmpdir(), "worktrees-manager-repo-path-no-commits-"));
    initGitRepo(repoPath);

    expect(inspectRepoPath(repoPath)).toEqual({
      exists: true,
      isGitRepo: true,
      hasCommits: false,
      isWritable: true,
    });
  });

  it("should report hasCommits=true for a git repo with at least one commit", () => {
    repoPath = mkdtempSync(join(tmpdir(), "worktrees-manager-repo-path-with-commit-"));
    initGitRepo(repoPath);
    commitInGitRepo(repoPath);

    expect(inspectRepoPath(repoPath)).toEqual({
      exists: true,
      isGitRepo: true,
      hasCommits: true,
      isWritable: true,
    });
  });

  it("should report isWritable=false when the process has no write permission", () => {
    // Root (habitual en contenedores de CI) ignora los bits de permisos: sin esto el test sería
    // inestable según el entorno.
    if (process.getuid?.() === 0) {
      return;
    }

    repoPath = mkdtempSync(join(tmpdir(), "worktrees-manager-repo-path-readonly-"));
    initGitRepo(repoPath);
    commitInGitRepo(repoPath);
    chmodSync(repoPath, 0o555);

    expect(inspectRepoPath(repoPath).isWritable).toBe(false);
  });
});
