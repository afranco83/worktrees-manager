import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  BranchAlreadyExistsError,
  DefaultBranchNotFoundError,
  GitWorktreeOperationError,
  InvalidBranchNameError,
  WorktreeHasUncommittedChangesError,
} from "../errors.js";
import {
  addWorktree,
  assertValidBranchName,
  computeWorktreePath,
  deleteLocalBranch,
  ensureWorktreesDirectoryIgnored,
  getCurrentBranch,
  listLocalBranches,
  removeWorktree,
  resolveDefaultBranch,
  resolveHeadCommitSha,
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
  it("should compute a .worktrees directory nested inside the project, named after the branch", () => {
    expect(computeWorktreePath({ localPath: "/repos/foo" }, "feature/bar")).toBe(
      join("/repos/foo", ".worktrees", "feature/bar"),
    );
  });
});

describe("ensureWorktreesDirectoryIgnored", () => {
  let repoPath: string;

  afterEach(() => {
    if (repoPath && existsSync(repoPath)) {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it("should create a .gitignore with the entry when the repo has none yet", () => {
    repoPath = createRepo();

    ensureWorktreesDirectoryIgnored(repoPath);

    expect(readFileSync(join(repoPath, ".gitignore"), "utf-8")).toContain(".worktrees/");
  });

  it("should append the entry to an existing .gitignore without removing its content", () => {
    repoPath = createRepo();
    writeFileSync(join(repoPath, ".gitignore"), "node_modules/");

    ensureWorktreesDirectoryIgnored(repoPath);

    const content = readFileSync(join(repoPath, ".gitignore"), "utf-8");
    expect(content).toContain("node_modules/");
    expect(content).toContain(".worktrees/");
  });

  it("should not duplicate the entry when called more than once", () => {
    repoPath = createRepo();

    ensureWorktreesDirectoryIgnored(repoPath);
    ensureWorktreesDirectoryIgnored(repoPath);

    const lines = readFileSync(join(repoPath, ".gitignore"), "utf-8")
      .split("\n")
      .filter((line) => line.trim() === ".worktrees/");
    expect(lines).toHaveLength(1);
  });

  it("should not duplicate the entry when the repo already ignores it without the trailing slash", () => {
    repoPath = createRepo();
    writeFileSync(join(repoPath, ".gitignore"), ".worktrees\n");

    ensureWorktreesDirectoryIgnored(repoPath);

    expect(readFileSync(join(repoPath, ".gitignore"), "utf-8")).toBe(".worktrees\n");
  });

  it("should keep the worktree directory out of the main repo's git status", async () => {
    repoPath = createRepo();
    ensureWorktreesDirectoryIgnored(repoPath);
    const worktreePath = computeWorktreePath({ localPath: repoPath }, "feature-ignored");

    await addWorktree({ repoPath, worktreePath, newBranch: "feature-ignored", baseRef: "HEAD" });

    const status = execFileSync("git", ["status", "--porcelain"], { cwd: repoPath }).toString();
    expect(status).not.toContain(".worktrees");
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
    paths.push(repoPath);

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

  it("should resolve to the full remote ref when origin/HEAD resolves but no local branch of that name exists", async () => {
    const sourcePath = mkdtempSync(join(tmpdir(), "worktrees-manager-git-worktree-source-"));
    paths.push(sourcePath);
    initGitRepo(sourcePath);
    commitInGitRepo(sourcePath);
    execFileSync("git", ["branch", "-M", "main"], { cwd: sourcePath, stdio: "ignore" });
    execFileSync("git", ["checkout", "-b", "develop"], { cwd: sourcePath, stdio: "ignore" });

    const originPath = mkdtempSync(join(tmpdir(), "worktrees-manager-git-worktree-origin-"));
    paths.push(originPath);
    execFileSync("git", ["clone", "--bare", sourcePath, originPath], { stdio: "ignore" });
    execFileSync("git", ["symbolic-ref", "HEAD", "refs/heads/main"], {
      cwd: originPath,
      stdio: "ignore",
    });

    const repoPath = mkdtempSync(join(tmpdir(), "worktrees-manager-git-worktree-clone-"));
    paths.push(repoPath);
    // Clonar solo "develop" deja "main" únicamente como origin/main (tracking),
    // sin ninguna rama local "main" — la precondición real del bug de DWIM.
    execFileSync("git", ["clone", "--branch", "develop", originPath, repoPath], {
      stdio: "ignore",
    });

    await expect(resolveDefaultBranch(repoPath)).resolves.toBe("origin/main");

    const worktreePath = computeWorktreePath({ localPath: repoPath }, "nuevarama");
    const baseRef = await resolveDefaultBranch(repoPath);
    await addWorktree({ repoPath, worktreePath, newBranch: "nuevarama", baseRef });

    // La rama real del worktree debe ser la solicitada, no "main" (que es lo
    // que ocurría antes del fix por el DWIM checkout de git).
    expect(
      execFileSync("git", ["branch", "--show-current"], { cwd: worktreePath }).toString().trim(),
    ).toBe("nuevarama");
  });

  it("should resolve HEAD to the same commit sha reported by git itself", async () => {
    const repoPath = trackRepo();
    const expectedSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoPath })
      .toString()
      .trim();

    await expect(resolveHeadCommitSha(repoPath)).resolves.toBe(expectedSha);
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

  it("should throw GitWorktreeOperationError, not BranchAlreadyExistsError, when a residual directory occupies the worktree path", async () => {
    const repoPath = trackRepo();
    const worktreePath = computeWorktreePath({ localPath: repoPath }, "feature-residual");
    mkdirSync(worktreePath, { recursive: true });
    writeFileSync(join(worktreePath, "leftover.txt"), "residual");

    // La rama "feature-residual" no existe en ningún sitio: el conflicto real
    // es de filesystem (directorio residual), no de rama duplicada.
    await expect(
      addWorktree({ repoPath, worktreePath, newBranch: "feature-residual", baseRef: "HEAD" }),
    ).rejects.toThrow(GitWorktreeOperationError);
  });

  it("should delete a local branch that has no worktree attached", async () => {
    const repoPath = trackRepo();
    const worktreePath = computeWorktreePath({ localPath: repoPath }, "feature-to-delete");
    await addWorktree({ repoPath, worktreePath, newBranch: "feature-to-delete", baseRef: "HEAD" });
    await removeWorktree({ repoPath, worktreePath, force: false });

    await deleteLocalBranch({ repoPath, branch: "feature-to-delete" });

    expect(
      execFileSync("git", ["branch", "--list", "feature-to-delete"], { cwd: repoPath }).toString(),
    ).toBe("");
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
