import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, sep } from "node:path";

import { ForbiddenDirectoryPathError, InvalidDirectoryPathError } from "../errors.js";
import type { DirectoryListing } from "./schemas.js";

// El explorador de carpetas del dashboard solo puede navegar dentro del home del
// usuario: evita exponer el resto del filesystem de la máquina (el servidor escucha
// en 0.0.0.0, así que este endpoint es alcanzable desde la red local) y no tiene
// sentido de todas formas navegar a zonas del sistema buscando un repo de proyecto.
// El campo de texto libre de "Ruta local" no tiene esta restricción: ahí el usuario
// escribe una ruta deliberada, que puede vivir fuera del home (p. ej. un volumen
// externo o `/opt/`).
const ALLOWED_ROOT = realpathSync(homedir());

function isWithinAllowedRoot(resolvedPath: string): boolean {
  return resolvedPath === ALLOWED_ROOT || resolvedPath.startsWith(`${ALLOWED_ROOT}${sep}`);
}

export function listDirectories(requestedPath?: string): DirectoryListing {
  const path = requestedPath != null && requestedPath.trim() !== "" ? requestedPath : ALLOWED_ROOT;

  if (!existsSync(path) || !statSync(path).isDirectory()) {
    throw new InvalidDirectoryPathError(`${path} no existe o no es un directorio`);
  }

  const resolvedPath = realpathSync(path);

  if (!isWithinAllowedRoot(resolvedPath)) {
    throw new ForbiddenDirectoryPathError(
      `${path} está fuera del directorio permitido (${ALLOWED_ROOT})`,
    );
  }

  const directories = readdirSync(resolvedPath)
    .filter((name) => !name.startsWith("."))
    .flatMap((name) => {
      const entryPath = join(resolvedPath, name);

      try {
        return statSync(entryPath).isDirectory() ? [{ name, path: entryPath }] : [];
      } catch {
        // Enlace roto o sin permisos de lectura: se omite en vez de romper el listado completo.
        return [];
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    path: resolvedPath,
    parentPath: resolvedPath === ALLOWED_ROOT ? null : dirname(resolvedPath),
    directories,
  };
}
