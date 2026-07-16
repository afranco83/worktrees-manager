import Fastify from "fastify";
import { Server } from "socket.io";

import { openRegistry } from "./registry.js";

const PORT = Number(process.env.PORT ?? 4100);

const app = Fastify({ logger: true });

app.get("/health", async () => ({ status: "ok" }));

async function start(): Promise<void> {
  const registry = openRegistry();

  app.addHook("onClose", async () => {
    registry.close();
  });

  await app.listen({ port: PORT, host: "0.0.0.0" });

  const io = new Server(app.server, {
    cors: { origin: true },
  });

  io.on("connection", (socket) => {
    app.log.info({ socketId: socket.id }, "cliente conectado por WebSocket");
  });
}

start().catch((error: unknown) => {
  app.log.error(error);
  process.exit(1);
});
