import { createServer } from "node:net";

import { NoFreePortAvailableError } from "../errors.js";

export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, "127.0.0.1");
  });
}

export async function assignFreePort({
  start,
  end,
  usedPorts,
}: {
  start: number;
  end: number;
  usedPorts: number[];
}): Promise<number> {
  const usedPortSet = new Set(usedPorts);

  for (let port = start; port <= end; port += 1) {
    if (usedPortSet.has(port)) {
      continue;
    }

    if (await isPortFree(port)) {
      return port;
    }
  }

  throw new NoFreePortAvailableError(`No hay ningún puerto libre en el rango ${start}-${end}`);
}
