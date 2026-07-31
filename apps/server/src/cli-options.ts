import { z } from "zod";

import { InvalidPortError } from "./errors.js";

const DEFAULT_PORT = 4100;
const PORT_FLAG_PREFIX = "--port=";
const PORT_FLAG = "--port";

const MAX_TCP_PORT = 65535;

const portSchema = z.coerce.number().int().positive().max(MAX_TCP_PORT);

/**
 * Resuelve el puerto de arranque del propio dashboard (no confundir con los
 * puertos que asigna la app a cada worktree): `--port <n>`/`--port=<n>` en los
 * argumentos de la CLI, o la variable de entorno `PORT` si no se pasa flag,
 * o `DEFAULT_PORT` si ninguna de las dos está presente.
 */
export function resolvePort(argv: string[], env: NodeJS.ProcessEnv): number {
  const raw = readPortFlag(argv) ?? env.PORT ?? String(DEFAULT_PORT);
  const parsed = portSchema.safeParse(raw);

  if (!parsed.success) {
    throw new InvalidPortError(
      `Puerto inválido: "${raw}". Usa --port <número> o la variable de entorno PORT.`,
    );
  }

  return parsed.data;
}

function readPortFlag(argv: string[]): string | undefined {
  const inlineFlag = argv.find((arg) => arg.startsWith(PORT_FLAG_PREFIX));
  if (inlineFlag) {
    return inlineFlag.slice(PORT_FLAG_PREFIX.length);
  }

  const flagIndex = argv.indexOf(PORT_FLAG);
  if (flagIndex === -1) {
    return undefined;
  }

  // El flag está presente pero sin valor siguiente: se devuelve "" (no
  // `undefined`) para que `resolvePort` lo distinga de "sin --port" y lo
  // rechace como puerto inválido, en vez de caer en silencio al valor de
  // PORT/DEFAULT_PORT como si el usuario no hubiera pasado el flag.
  return argv[flagIndex + 1] ?? "";
}
