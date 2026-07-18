import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { execa } from "execa";

/**
 * `.env*` reales (`.env`, `.env.local`...) están gitignoreados por convención
 * (`§Seguridad` del canon) — `git worktree add` solo hace checkout de lo
 * versionado, así que un worktree nuevo nace sin ellos y cualquier app que
 * los necesite (secretos de auth, `DATABASE_URL`...) falla al arrancar. Se
 * delega en `git ls-files` la decisión de qué está realmente ignorado (en
 * vez de reimplementar el matching de `.gitignore` a mano): así respeta
 * excepciones propias del proyecto como `!.env.example` sin que este código
 * necesite saber nada de ellas.
 */
function isEnvFileName(fileName: string): boolean {
  return fileName === ".env" || fileName.startsWith(".env.");
}

/**
 * Copia al worktree nuevo cualquier fichero `.env*` gitignoreado que exista
 * en el repo principal, preservando su ruta relativa (p. ej.
 * `apps/api/.env`). Devuelve las rutas copiadas para que quien llame pueda
 * loguearlo; no lanza si no encuentra ninguno (caso normal en un repo sin
 * `.env` locales).
 */
export async function copyGitignoredEnvFiles(
  repoPath: string,
  worktreePath: string,
): Promise<string[]> {
  const { stdout } = await execa(
    "git",
    ["ls-files", "--others", "--ignored", "--exclude-standard", "--directory"],
    { cwd: repoPath },
  );

  const envFilePaths = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && isEnvFileName(line.split("/").at(-1) ?? ""));

  for (const relativePath of envFilePaths) {
    const destination = join(worktreePath, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(repoPath, relativePath), destination);
  }

  return envFilePaths;
}
