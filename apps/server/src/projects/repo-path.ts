import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

export interface RepoPathInspection {
  exists: boolean;
  isGitRepo: boolean;
}

export function inspectRepoPath(localPath: string): RepoPathInspection {
  const exists = existsSync(localPath) && statSync(localPath).isDirectory();
  const isGitRepo = exists && existsSync(join(localPath, ".git"));

  return { exists, isGitRepo };
}
