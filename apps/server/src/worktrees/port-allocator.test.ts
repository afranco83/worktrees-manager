import { createServer, type Server } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { NoFreePortAvailableError } from "../errors.js";
import { assignFreePort, isPortFree } from "./port-allocator.js";

describe("isPortFree", () => {
  let server: Server | null;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      server = null;
    }
  });

  it("should report true for a port nothing is listening on", async () => {
    await expect(isPortFree(58_213)).resolves.toBe(true);
  });

  it("should report false for a port that is already bound", async () => {
    server = createServer();
    await new Promise<void>((resolve) => server?.listen(58_214, "127.0.0.1", () => resolve()));

    await expect(isPortFree(58_214)).resolves.toBe(false);
  });
});

describe("assignFreePort", () => {
  let server: Server | null;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      server = null;
    }
  });

  it("should return the first free port in the range when none is used", async () => {
    await expect(assignFreePort({ start: 58_300, end: 58_310, usedPorts: [] })).resolves.toBe(
      58_300,
    );
  });

  it("should skip ports already reported as used by the caller", async () => {
    await expect(
      assignFreePort({ start: 58_320, end: 58_330, usedPorts: [58_320, 58_321] }),
    ).resolves.toBe(58_322);
  });

  it("should skip a port that is actually bound at the OS level", async () => {
    server = createServer();
    await new Promise<void>((resolve) => server?.listen(58_340, "127.0.0.1", () => resolve()));

    await expect(assignFreePort({ start: 58_340, end: 58_345, usedPorts: [] })).resolves.toBe(
      58_341,
    );
  });

  it("should throw NoFreePortAvailableError when the whole range is exhausted", async () => {
    await expect(
      assignFreePort({ start: 58_400, end: 58_401, usedPorts: [58_400, 58_401] }),
    ).rejects.toThrow(NoFreePortAvailableError);
  });
});
