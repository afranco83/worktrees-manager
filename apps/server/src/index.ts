#!/usr/bin/env node
import { buildApp } from "./app.js";
import { resolvePort } from "./cli-options.js";
import { InvalidPortError } from "./errors.js";
import { openRegistry } from "./registry.js";

// Referencia al app ya construido, solo para poder loguear con el logger estructurado
// de Fastify (Pino) si el arranque falla después de construirlo — ver el catch de abajo.
let app: ReturnType<typeof buildApp> | undefined;

async function start(): Promise<void> {
  const port = resolvePort(process.argv.slice(2), process.env);
  const registry = openRegistry();
  app = buildApp(registry);

  app.addHook("onClose", async () => {
    registry.close();
  });

  await app.listen({ port, host: "0.0.0.0" });
  console.log(`\nWorktrees Manager: http://localhost:${port}\n`);
}

start().catch((error: unknown) => {
  if (error instanceof InvalidPortError) {
    console.error(error.message);
    process.exit(1);
    return;
  }

  if (app) {
    app.log.error(error);
  } else {
    console.error(error);
  }

  process.exit(1);
});
