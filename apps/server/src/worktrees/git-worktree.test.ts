import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  BranchAlreadyExistsError,
  DefaultBranchNotFoundError,
  InvalidBranchNameError,
  WorktreeHasUncommittedChangesError,
} from "../errors.js";
import {
  addWorktree,
  assertValidBranchName,
  computeWorktreePath,
  getCurrentBranch,
  listLocalBranches,
  removeWorktree,
  resolveDefaultBranch,
} from "./git-worktree.js";

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

function createRepo(): string {
  const repoPath = mkdtempSync(join(tmpdir(), "worktrees-manager-git-worktree-"));
  initGitRepo(repoPath);
  commitInGitRepo(repoPath);

  return repoPath;
}

describe("assertValidBranchName", () => {
  it("should not throw for a valid branch name", () => {
    expect(() => assertValidBranchName("feature/foo")).not.toThrow();
  });

  it("should throw InvalidBranchNameError for an invalid branch name", () => {
    expect(() => assertValidBranchName("../escape")).toThrow(InvalidBranchNameError);
  });
});

describe("computeWorktreePath", () => {
  it("should compute a sibling .worktrees directory named after the branch", () => {
    expect(computeWorktreePath({ localPath: "/repos/foo" }, "feature/bar")).toBe(
      join("/repos/foo.worktrees", "feature/bar"),
    );
  });
});

describe("git-worktree against a real repo", () => {
  let paths: string[];

  beforeEach(() => {
    paths = [];
  });

  afterEach(() => {
    for (const path of paths) {
      if (existsSync(path)) {
        rmSync(path, { recursive: true, force: true });
      }
    }
    paths = [];
  });

  function trackRepo(): string {
    const repoPath = createRepo();
    paths.push(repoPath, `${repoPath}.worktrees`);

    return repoPath;
  }

  it("should resolve the default branch from the local main fallback when there is no remote", async () => {
    const repoPath = trackRepo();
    execFileSync("git", ["branch", "-M", "main"], { cwd: repoPath, stdio: "ignore" });

    await expect(resolveDefaultBranch(repoPath)).resolves.toBe("main");
  });

  it("should resolve the default branch from the local master fallback when main does not exist", async () => {
    const repoPath = trackRepo();
    execFileSync("git", ["branch", "-M", "master"], { cwd: repoPath, stdio: "ignore" });

    await expect(resolveDefaultBranch(repoPath)).resolves.toBe("master");
  });

  it("should throw DefaultBranchNotFoundError when neither main nor master exist", async () => {
    const repoPath = trackRepo();
    execFileSync("git", ["branch", "-M", "trunk"], { cwd: repoPath, stdio: "ignore" });

    await expect(resolveDefaultBranch(repoPath)).rejects.toThrow(DefaultBranchNotFoundError);
  });

  it("should return the current branch name when HEAD is attached", async () => {
    const repoPath = trackRepo();
    execFileSync("git", ["branch", "-M", "main"], { cwd: repoPath, stdio: "ignore" });

    await expect(getCurrentBranch(repoPath)).resolves.toBe("main");
  });

  it("should return null from getCurrentBranch when HEAD is detached", async () => {
    const repoPath = trackRepo();
    const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoPath }).toString().trim();
    execFileSync("git", ["checkout", sha], { cwd: repoPath, stdio: "ignore" });

    await expect(getCurrentBranch(repoPath)).resolves.toBeNull();
  });

  it("should list the local branches of the repo", async () => {
    const repoPath = trackRepo();
    execFileSync("git", ["branch", "-M", "main"], { cwd: repoPath, stdio: "ignore" });
    execFileSync("git", ["branch", "other"], { cwd: repoPath, stdio: "ignore" });

    await expect(listLocalBranches(repoPath)).resolves.toEqual(
      expect.arrayContaining(["main", "other"]),
    );
  });

  it("should create a real worktree on disk with a new branch", async () => {
    const repoPath = trackRepo();
    const worktreePath = computeWorktreePath({ localPath: repoPath }, "feature-x");

    await addWorktree({ repoPath, worktreePath, newBranch: "feature-x", baseRef: "HEAD" });

    expect(existsSync(worktreePath)).toBe(true);
    expect(
      execFileSync("git", ["branch", "--list", "feature-x"], { cwd: repoPath }).toString(),
    ).toContain("feature-x");
  });

  it("should throw BranchAlreadyExistsError when the branch already exists", async () => {
    const repoPath = trackRepo();
    execFileSync("git", ["branch", "existing"], { cwd: repoPath, stdio: "ignore" });
    const worktreePath = computeWorktreePath({ localPath: repoPath }, "existing");

    await expect(
      addWorktree({ repoPath, worktreePath, newBranch: "existing", baseRef: "HEAD" }),
    ).rejects.toThrow(BranchAlreadyExistsError);
  });

  it("should remove a clean worktree from disk", async () => {
    const repoPath = trackRepo();
    const worktreePath = computeWorktreePath({ localPath: repoPath }, "feature-clean");
    await addWorktree({ repoPath, worktreePath, newBranch: "feature-clean", baseRef: "HEAD" });

    await removeWorktree({ repoPath, worktreePath, force: false });

    expect(existsSync(worktreePath)).toBe(false);
  });

  it("should throw WorktreeHasUncommittedChangesError for a dirty worktree without force", async () => {
    const repoPath = trackRepo();
    const worktreePath = computeWorktreePath({ localPath: repoPath }, "feature-dirty");
    await addWorktree({ repoPath, worktreePath, newBranch: "feature-dirty", baseRef: "HEAD" });
    writeFileSync(join(worktreePath, "untracked.txt"), "dirty");

    await expect(removeWorktree({ repoPath, worktreePath, force: false })).rejects.toThrow(
      WorktreeHasUncommittedChangesError,
    );
    expect(existsSync(worktreePath)).toBe(true);
  });

  it("should remove a dirty worktree from disk when force is true", async () => {
    const repoPath = trackRepo();
    const worktreePath = computeWorktreePath({ localPath: repoPath }, "feature-dirty-force");
    await addWorktree({
      repoPath,
      worktreePath,
      newBranch: "feature-dirty-force",
      baseRef: "HEAD",
    });
    writeFileSync(join(worktreePath, "untracked.txt"), "dirty");

    await removeWorktree({ repoPath, worktreePath, force: true });

    expect(existsSync(worktreePath)).toBe(false);
  });

  it("should succeed when the worktree directory was already deleted outside the app", async () => {
    const repoPath = trackRepo();
    const worktreePath = computeWorktreePath({ localPath: repoPath }, "feature-manual-delete");
    await addWorktree({
      repoPath,
      worktreePath,
      newBranch: "feature-manual-delete",
      baseRef: "HEAD",
    });
    rmSync(worktreePath, { recursive: true, force: true });

    await expect(removeWorktree({ repoPath, worktreePath, force: false })).resolves.toBeUndefined();
  });
});
