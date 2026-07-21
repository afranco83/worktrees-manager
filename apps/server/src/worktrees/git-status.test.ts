import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getWorktreeGitStatus, hasUncommittedChanges, hasUnpushedCommits } from "./git-status.js";

function initGitRepo(repoPath: string): void {
  execFileSync("git", ["init"], { cwd: repoPath, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@example.com"], {
    cwd: repoPath,
    stdio: "ignore",
  });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: repoPath, stdio: "ignore" });
}

function commitInGitRepo(repoPath: string, message = "initial commit"): void {
  writeFileSync(join(repoPath, `${message.replace(/\s+/g, "-")}.txt`), "content");
  execFileSync("git", ["add", "."], { cwd: repoPath, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", message], { cwd: repoPath, stdio: "ignore" });
}

function headSha(repoPath: string): string {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoPath }).toString().trim();
}

function createRepo(): string {
  const repoPath = mkdtempSync(join(tmpdir(), "worktrees-manager-git-status-"));
  initGitRepo(repoPath);
  commitInGitRepo(repoPath);
  execFileSync("git", ["branch", "-M", "feature"], { cwd: repoPath, stdio: "ignore" });

  return repoPath;
}

describe("hasUncommittedChanges", () => {
  let repoPath: string;

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("should be false for a freshly committed repo", async () => {
    repoPath = createRepo();

    await expect(hasUncommittedChanges(repoPath)).resolves.toBe(false);
  });

  it("should be true when there is an untracked file", async () => {
    repoPath = createRepo();
    writeFileSync(join(repoPath, "new-file.txt"), "content");

    await expect(hasUncommittedChanges(repoPath)).resolves.toBe(true);
  });
});

describe("hasUnpushedCommits without a known remote branch", () => {
  let repoPath: string;

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("should be false when HEAD is still at the base commit", async () => {
    repoPath = createRepo();
    const baseCommitSha = headSha(repoPath);

    await expect(hasUnpushedCommits(repoPath, "feature", baseCommitSha)).resolves.toBe(false);
  });

  it("should be true after a commit made past the base commit", async () => {
    repoPath = createRepo();
    const baseCommitSha = headSha(repoPath);
    commitInGitRepo(repoPath, "own work");

    await expect(hasUnpushedCommits(repoPath, "feature", baseCommitSha)).resolves.toBe(true);
  });

  it("should degrade to false when the base commit is unknown (pre-existing worktree)", async () => {
    repoPath = createRepo();
    commitInGitRepo(repoPath, "own work");

    await expect(hasUnpushedCommits(repoPath, "feature", null)).resolves.toBe(false);
  });
});

describe("hasUnpushedCommits with a known remote branch", () => {
  let repoPath: string;
  let originPath: string;

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
    rmSync(originPath, { recursive: true, force: true });
  });

  function createRepoWithPushedOrigin(): { repoPath: string; originPath: string } {
    const origin = mkdtempSync(join(tmpdir(), "worktrees-manager-git-status-origin-"));
    execFileSync("git", ["init", "--bare"], { cwd: origin, stdio: "ignore" });

    const repo = createRepo();
    execFileSync("git", ["remote", "add", "origin", origin], { cwd: repo, stdio: "ignore" });
    execFileSync("git", ["push", "origin", "feature"], { cwd: repo, stdio: "ignore" });

    return { repoPath: repo, originPath: origin };
  }

  it("should be false right after pushing, with no unknown base commit needed", async () => {
    ({ repoPath, originPath } = createRepoWithPushedOrigin());

    await expect(hasUnpushedCommits(repoPath, "feature", null)).resolves.toBe(false);
  });

  it("should be true for a commit made after the last push", async () => {
    ({ repoPath, originPath } = createRepoWithPushedOrigin());
    commitInGitRepo(repoPath, "own work after push");

    await expect(hasUnpushedCommits(repoPath, "feature", null)).resolves.toBe(true);
  });
});

describe("getWorktreeGitStatus", () => {
  let repoPath: string;

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("should combine both signals for a clean, unpushed-free worktree", async () => {
    repoPath = createRepo();
    const baseCommitSha = headSha(repoPath);

    await expect(getWorktreeGitStatus(repoPath, "feature", baseCommitSha)).resolves.toEqual({
      hasUncommittedChanges: false,
      hasUnpushedCommits: false,
    });
  });

  it("should combine both signals for a dirty worktree with a commit past the base", async () => {
    repoPath = createRepo();
    const baseCommitSha = headSha(repoPath);
    commitInGitRepo(repoPath, "own work");
    writeFileSync(join(repoPath, "untracked.txt"), "content");

    await expect(getWorktreeGitStatus(repoPath, "feature", baseCommitSha)).resolves.toEqual({
      hasUncommittedChanges: true,
      hasUnpushedCommits: true,
    });
  });
});
