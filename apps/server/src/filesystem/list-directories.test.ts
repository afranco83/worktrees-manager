import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ForbiddenDirectoryPathError, InvalidDirectoryPathError } from "../errors.js";
import { listDirectories } from "./list-directories.js";

const REAL_HOME = realpathSync(homedir());

describe("listDirectories", () => {
  let rootPath: string;

  beforeEach(() => {
    // Dentro del home a propósito: el explorador solo permite navegar ahí (ver
    // list-directories.ts), así que las rutas de prueba deben vivir bajo el home real.
    rootPath = mkdtempSync(join(REAL_HOME, ".worktrees-manager-test-"));
    mkdirSync(join(rootPath, "repo-a"));
    mkdirSync(join(rootPath, "repo-b"));
    mkdirSync(join(rootPath, ".hidden-dir"));
    writeFileSync(join(rootPath, "not-a-directory.txt"), "");
  });

  afterEach(() => {
    rmSync(rootPath, { recursive: true, force: true });
  });

  it("should list only non-hidden subdirectories when given a valid directory path", () => {
    const listing = listDirectories(rootPath);

    expect(listing.path).toBe(rootPath);
    expect(listing.directories).toEqual([
      { name: "repo-a", path: join(rootPath, "repo-a") },
      { name: "repo-b", path: join(rootPath, "repo-b") },
    ]);
  });

  it("should resolve the parent path unless already at the home directory", () => {
    const listing = listDirectories(rootPath);

    expect(listing.parentPath).toBe(dirname(rootPath));
  });

  it("should default to the home directory when no path is given", () => {
    const listing = listDirectories();

    expect(listing.path).toBe(REAL_HOME);
  });

  it("should report no parent path when listing the home directory itself", () => {
    const listing = listDirectories(REAL_HOME);

    expect(listing.parentPath).toBeNull();
  });

  it("should throw InvalidDirectoryPathError when the path does not exist", () => {
    expect(() => listDirectories(join(rootPath, "does-not-exist"))).toThrow(
      InvalidDirectoryPathError,
    );
  });

  it("should throw InvalidDirectoryPathError when the path points to a file", () => {
    expect(() => listDirectories(join(rootPath, "not-a-directory.txt"))).toThrow(
      InvalidDirectoryPathError,
    );
  });

  it("should skip a broken symlink instead of failing the whole listing", () => {
    symlinkSync(join(rootPath, "does-not-exist"), join(rootPath, "broken-link"));

    const listing = listDirectories(rootPath);

    expect(listing.directories.map((directory) => directory.name)).toEqual(["repo-a", "repo-b"]);
  });

  it("should throw ForbiddenDirectoryPathError when the path is outside the home directory", () => {
    expect(() => listDirectories(tmpdir())).toThrow(ForbiddenDirectoryPathError);
  });

  it("should throw ForbiddenDirectoryPathError when a symlink inside home escapes to outside home", () => {
    const escapeTarget = mkdtempSync(join(tmpdir(), "worktrees-manager-fs-escape-"));
    const symlinkPath = join(rootPath, "escape-link");
    symlinkSync(escapeTarget, symlinkPath);

    try {
      expect(() => listDirectories(symlinkPath)).toThrow(ForbiddenDirectoryPathError);
    } finally {
      rmSync(escapeTarget, { recursive: true, force: true });
    }
  });
});
