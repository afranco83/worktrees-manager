import { execFileSync } from "node:child_process";
import { accessSync, constants, existsSync, statSync } from "node:fs";
import { join } from "node:path";

export interface RepoPathInspection {
  exists: boolean;
  isGitRepo: boolean;
  /** Falso también cuando no es un repo git: sin commit no hay rama de la que crear un worktree. */
  hasCommits: boolean;
  isWritable: boolean;
}

function hasAtLeastOneCommit(localPath: string): boolean {
  try {
    execFileSync("git", ["rev-parse", "--verify", "HEAD"], { cwd: localPath, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function hasWritePermission(localPath: string): boolean {
  try {
    accessSync(localPath, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function inspectRepoPath(localPath: string): RepoPathInspection {
  const exists = existsSync(localPath) && statSync(localPath).isDirectory();
  const isGitRepo = exists && existsSync(join(localPath, ".git"));

  return {
    exists,
    isGitRepo,
    hasCommits: isGitRepo && hasAtLeastOneCommit(localPath),
    isWritable: exists && hasWritePermission(localPath),
  };
}
