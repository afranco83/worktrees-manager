import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { ExecaError, execa } from "execa";

import {
  BranchAlreadyExistsError,
  DefaultBranchNotFoundError,
  GitWorktreeOperationError,
  InvalidBranchNameError,
  WorktreeHasUncommittedChangesError,
} from "../errors.js";

const DEFAULT_BRANCH_CANDIDATES = ["main", "master"];

/**
 * Fuerza los mensajes de git a inglés: el resto del módulo hace matching por regex
 * sobre el stderr real ("already exists", "contains modified..."), que sale
 * localizado (p. ej. en es_ES) si no se fija el locale del proceso hijo.
 */
const GIT_ENV = { ...process.env, LC_ALL: "C" };

/**
 * Valida el nombre con el propio git (delega en sus reglas de referencia) antes de
 * usarlo para construir una ruta de filesystem — ver ADR-0003.
 */
export function assertValidBranchName(branchName: string): void {
  try {
    execFileSync("git", ["check-ref-format", "--branch", branchName], { stdio: "ignore" });
  } catch {
    throw new InvalidBranchNameError(`"${branchName}" no es un nombre de rama válido`);
  }
}

async function localBranchExists(repoPath: string, branch: string): Promise<boolean> {
  try {
    await execa("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], {
      cwd: repoPath,
      env: GIT_ENV,
    });
    return true;
  } catch {
    return false;
  }
}

export async function resolveDefaultBranch(repoPath: string): Promise<string> {
  try {
    const { stdout } = await execa("git", ["symbolic-ref", "refs/remotes/origin/HEAD"], {
      cwd: repoPath,
      env: GIT_ENV,
    });
    const match = /^refs\/remotes\/origin\/(.+)$/.exec(stdout.trim());

    if (match) {
      const branch = match[1];

      // Si no hay rama LOCAL con ese nombre, devolver el nombre pelado como
      // `baseRef` deja que `git worktree add -b <nueva> <path> <nombre>` dispare
      // el DWIM de git (crea/checkea una rama local con ese nombre, ignorando
      // por completo `-b <nueva>`). La referencia remota completa es inequívoca.
      return (await localBranchExists(repoPath, branch)) ? branch : `origin/${branch}`;
    }
  } catch {
    // Sin remoto configurado o sin HEAD simbólico: se prueban los fallbacks locales.
  }

  for (const candidate of DEFAULT_BRANCH_CANDIDATES) {
    if (await localBranchExists(repoPath, candidate)) {
      return candidate;
    }
  }

  throw new DefaultBranchNotFoundError(
    "No se pudo determinar la rama por defecto del repositorio; indica una rama concreta",
  );
}

/** `null` si el repo principal está en detached HEAD: no hay "rama actual" de la que partir. */
export async function getCurrentBranch(repoPath: string): Promise<string | null> {
  const { stdout } = await execa("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: repoPath,
    env: GIT_ENV,
  });
  const branch = stdout.trim();

  return branch === "HEAD" ? null : branch;
}

export async function listLocalBranches(repoPath: string): Promise<string[]> {
  const { stdout } = await execa(
    "git",
    ["for-each-ref", "--format=%(refname:short)", "refs/heads/"],
    { cwd: repoPath, env: GIT_ENV },
  );

  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/**
 * Anidado dentro del propio repo (no hermano) — ver ADR-0005. Requiere que el
 * repo ignore este directorio (`ensureWorktreesDirectoryIgnored`) o ensucia el
 * `git status` del repo principal con todo el contenido de cada worktree.
 */
export const WORKTREES_DIRECTORY_NAME = ".worktrees";

export function computeWorktreePath(project: { localPath: string }, newBranch: string): string {
  return join(project.localPath, WORKTREES_DIRECTORY_NAME, newBranch);
}

/**
 * Añade `.worktrees/` al `.gitignore` del repo si no está ya cubierto, para que
 * crear worktrees anidados no ensucie el `git status` del repo principal con
 * todo su contenido. Idempotente: no duplica la entrada en llamadas sucesivas.
 */
export function ensureWorktreesDirectoryIgnored(repoPath: string): void {
  const gitignorePath = join(repoPath, ".gitignore");
  const existingContent = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf-8") : "";
  const ignoreEntry = `${WORKTREES_DIRECTORY_NAME}/`;
  const alreadyIgnored = existingContent
    .split("\n")
    .some((line) => line.trim() === ignoreEntry || line.trim() === WORKTREES_DIRECTORY_NAME);

  if (alreadyIgnored) {
    return;
  }

  const needsLeadingNewline = existingContent.length > 0 && !existingContent.endsWith("\n");
  appendFileSync(gitignorePath, `${needsLeadingNewline ? "\n" : ""}${ignoreEntry}\n`);
}

function readStderr(error: unknown): string {
  return error instanceof ExecaError && typeof error.stderr === "string" ? error.stderr : "";
}

export async function addWorktree({
  repoPath,
  worktreePath,
  newBranch,
  baseRef,
}: {
  repoPath: string;
  worktreePath: string;
  newBranch: string;
  baseRef: string;
}): Promise<void> {
  try {
    await execa("git", ["worktree", "add", "-b", newBranch, worktreePath, baseRef], {
      cwd: repoPath,
      env: GIT_ENV,
    });
  } catch (error) {
    const stderr = readStderr(error);

    // Regex específico: git usa "already exists" también para "la ruta del
    // worktree ya existe en disco" (directorio residual de un intento
    // anterior), un conflicto de filesystem distinto a una rama duplicada.
    if (/a branch named .* already exists/.test(stderr)) {
      throw new BranchAlreadyExistsError(`La rama "${newBranch}" ya existe`);
    }

    throw new GitWorktreeOperationError(
      stderr || (error instanceof Error ? error.message : String(error)),
    );
  }
}

export async function deleteLocalBranch({
  repoPath,
  branch,
}: {
  repoPath: string;
  branch: string;
}): Promise<void> {
  await execa("git", ["branch", "-D", branch], { cwd: repoPath, env: GIT_ENV });
}

export async function removeWorktree({
  repoPath,
  worktreePath,
  force,
}: {
  repoPath: string;
  worktreePath: string;
  force: boolean;
}): Promise<void> {
  try {
    const args = force
      ? ["worktree", "remove", "--force", worktreePath]
      : ["worktree", "remove", worktreePath];

    await execa("git", args, { cwd: repoPath, env: GIT_ENV });
  } catch (error) {
    const stderr = readStderr(error);

    if (/is not a working tree/.test(stderr)) {
      // El directorio ya no existe (borrado a mano fuera de la app): se poda la
      // referencia interna de git y se trata como un borrado exitoso.
      await execa("git", ["worktree", "prune"], { cwd: repoPath, env: GIT_ENV });
      return;
    }

    if (/contains modified or untracked files/.test(stderr)) {
      throw new WorktreeHasUncommittedChangesError(
        `El worktree tiene cambios sin commitear o ficheros sin seguimiento: ${stderr.trim()}`,
      );
    }

    throw new GitWorktreeOperationError(
      stderr || (error instanceof Error ? error.message : String(error)),
    );
  }
}
