import { execa } from "execa";

import { GIT_ENV } from "./git-worktree.js";

export interface GitStatusSummary {
  hasUncommittedChanges: boolean;
  hasUnpushedCommits: boolean;
}

export async function hasUncommittedChanges(path: string): Promise<boolean> {
  const { stdout } = await execa("git", ["status", "--porcelain"], { cwd: path, env: GIT_ENV });

  return stdout.trim() !== "";
}

async function remoteBranchExists(path: string, branch: string): Promise<boolean> {
  try {
    await execa("git", ["show-ref", "--verify", "--quiet", `refs/remotes/origin/${branch}`], {
      cwd: path,
      env: GIT_ENV,
    });
    return true;
  } catch {
    return false;
  }
}

async function countCommitsAhead(path: string, baseRef: string): Promise<number> {
  const { stdout } = await execa("git", ["rev-list", "--count", `${baseRef}..HEAD`], {
    cwd: path,
    env: GIT_ENV,
  });

  return Number.parseInt(stdout.trim(), 10);
}

/**
 * "origin" queda fijo, sin concepto de remoto configurable — mismo supuesto
 * que ya hace `resolveDefaultBranch` con `refs/remotes/origin/HEAD`. Nunca se
 * hace `fetch` implícito (aquí ni en el resto de la app), así que esto
 * refleja el último fetch conocido localmente, no el estado real del remoto.
 */
export async function hasUnpushedCommits(
  path: string,
  branch: string,
  baseCommitSha: string | null,
): Promise<boolean> {
  if (await remoteBranchExists(path, branch)) {
    return (await countCommitsAhead(path, `origin/${branch}`)) > 0;
  }

  // Sin copia remota conocida: cualquier commit propio desde la creación
  // cuenta como "sin subir" (decisión del usuario). `baseCommitSha` es
  // `null` para worktrees creados antes de esta columna — no se puede saber
  // con fiabilidad, se degrada a "sin aviso" en vez de un falso positivo.
  if (baseCommitSha == null) {
    return false;
  }

  return (await countCommitsAhead(path, baseCommitSha)) > 0;
}

export async function getWorktreeGitStatus(
  path: string,
  branch: string,
  baseCommitSha: string | null,
): Promise<GitStatusSummary> {
  const [uncommitted, unpushed] = await Promise.all([
    hasUncommittedChanges(path),
    hasUnpushedCommits(path, branch, baseCommitSha),
  ]);

  return { hasUncommittedChanges: uncommitted, hasUnpushedCommits: unpushed };
}
