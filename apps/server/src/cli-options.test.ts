import { describe, expect, it } from "vitest";

import { resolvePort } from "./cli-options.js";
import { InvalidPortError } from "./errors.js";

describe("resolvePort", () => {
  it("should return the default port when no flag or env var is present", () => {
    const port = resolvePort([], {});

    expect(port).toBe(4100);
  });

  it("should read the port from a --port <n> flag", () => {
    const port = resolvePort(["--port", "5000"], {});

    expect(port).toBe(5000);
  });

  it("should read the port from a --port=<n> flag", () => {
    const port = resolvePort(["--port=5001"], {});

    expect(port).toBe(5001);
  });

  it("should fall back to the PORT env var when no flag is present", () => {
    const port = resolvePort([], { PORT: "5002" });

    expect(port).toBe(5002);
  });

  it("should prioritize the flag over the PORT env var", () => {
    const port = resolvePort(["--port", "5000"], { PORT: "5002" });

    expect(port).toBe(5000);
  });

  it("should throw InvalidPortError for a non-numeric port", () => {
    expect(() => resolvePort(["--port", "not-a-number"], {})).toThrow(InvalidPortError);
  });

  it("should throw InvalidPortError for a negative port", () => {
    expect(() => resolvePort(["--port", "-1"], {})).toThrow(InvalidPortError);
  });
});
