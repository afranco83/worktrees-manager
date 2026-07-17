import { buildApp } from "./app.js";
import { openRegistry } from "./registry.js";

const PORT = Number(process.env.PORT ?? 4100);

// Referencia al app ya construido, solo para poder loguear con el logger estructurado
// de Fastify (Pino) si el arranque falla después de construirlo — ver el catch de abajo.
let app: ReturnType<typeof buildApp> | undefined;

async function start(): Promise<void> {
  const registry = openRegistry();
  app = buildApp(registry);

  app.addHook("onClose", async () => {
    registry.close();
  });

  await app.listen({ port: PORT, host: "0.0.0.0" });
}

start().catch((error: unknown) => {
  if (app) {
    app.log.error(error);
  } else {
    console.error(error);
  }

  process.exit(1);
});
