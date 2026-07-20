import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { detectInstallCommand, hasNodeModules } from "./package-manager.js";

describe("package manager detection", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "worktrees-manager-package-manager-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("should default to npm install when no lockfile is present", () => {
    expect(detectInstallCommand(dir)).toBe("npm install");
  });

  it("should detect pnpm from pnpm-lock.yaml", () => {
    writeFileSync(join(dir, "pnpm-lock.yaml"), "");

    expect(detectInstallCommand(dir)).toBe("pnpm install");
  });

  it("should detect yarn from yarn.lock", () => {
    writeFileSync(join(dir, "yarn.lock"), "");

    expect(detectInstallCommand(dir)).toBe("yarn install");
  });

  it("should detect bun from bun.lockb", () => {
    writeFileSync(join(dir, "bun.lockb"), "");

    expect(detectInstallCommand(dir)).toBe("bun install");
  });

  it("should use npm ci for package-lock.json", () => {
    writeFileSync(join(dir, "package-lock.json"), "{}");

    expect(detectInstallCommand(dir)).toBe("npm ci");
  });

  it("should report node_modules presence", () => {
    expect(hasNodeModules(dir)).toBe(false);

    mkdirSync(join(dir, "node_modules"));

    expect(hasNodeModules(dir)).toBe(true);
  });
});
