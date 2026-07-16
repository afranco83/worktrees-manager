import { Server } from "socket.io";

import { buildApp } from "./app.js";
import { openRegistry } from "./registry.js";

const PORT = Number(process.env.PORT ?? 4100);

async function start(): Promise<void> {
  const registry = openRegistry();
  const app = buildApp(registry);

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
  console.error(error);
  process.exit(1);
});
