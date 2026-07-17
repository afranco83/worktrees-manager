import { describe, expect, it, vi } from "vitest";

import { TerminalLaunchError } from "../errors.js";
import { openTerminalAt, terminalPresets, type TerminalLauncher } from "./terminal.js";

function buildLauncher(overrides: Partial<TerminalLauncher> = {}): TerminalLauncher {
  return {
    platform: "linux",
    commandExists: () => false,
    run: vi.fn().mockResolvedValue(undefined),
    runShellCommand: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("openTerminalAt", () => {
  it("should open macOS's Terminal.app pointed at the path", async () => {
    const launcher = buildLauncher({ platform: "darwin" });

    await openTerminalAt("/repos/foo/.worktrees/feature-a", { launcher });

    expect(launcher.run).toHaveBeenCalledWith("open", [
      "-a",
      "Terminal",
      "/repos/foo/.worktrees/feature-a",
    ]);
  });

  it("should use Windows Terminal when it is installed", async () => {
    const launcher = buildLauncher({
      platform: "win32",
      commandExists: (command) => command === "wt",
    });

    await openTerminalAt("C:\\repos\\foo\\.worktrees\\feature-a", { launcher });

    expect(launcher.run).toHaveBeenCalledWith("wt", [
      "-d",
      "C:\\repos\\foo\\.worktrees\\feature-a",
    ]);
  });

  it("should fall back to cmd.exe on Windows when Windows Terminal is not installed", async () => {
    const launcher = buildLauncher({ platform: "win32", commandExists: () => false });

    await openTerminalAt("C:\\repos\\foo", { launcher });

    expect(launcher.run).toHaveBeenCalledWith("cmd", [
      "/c",
      "start",
      "cmd",
      "/K",
      'cd /d "C:\\repos\\foo"',
    ]);
  });

  it("should use the first available Linux terminal emulator candidate", async () => {
    const launcher = buildLauncher({
      platform: "linux",
      commandExists: (command) => command === "konsole",
    });

    await openTerminalAt("/repos/foo", { launcher });

    expect(launcher.run).toHaveBeenCalledWith("konsole", ["--workdir", "/repos/foo"], {
      cwd: "/repos/foo",
    });
  });

  it("should prefer gnome-terminal over the other Linux candidates when both are available", async () => {
    const launcher = buildLauncher({
      platform: "linux",
      commandExists: (command) => command === "gnome-terminal" || command === "xterm",
    });

    await openTerminalAt("/repos/foo", { launcher });

    expect(launcher.run).toHaveBeenCalledWith(
      "gnome-terminal",
      ["--working-directory=/repos/foo"],
      { cwd: "/repos/foo" },
    );
  });

  it("should fall back to xterm passing the path as cwd instead of an argument", async () => {
    const launcher = buildLauncher({
      platform: "linux",
      commandExists: (command) => command === "xterm",
    });

    await openTerminalAt("/repos/foo", { launcher });

    expect(launcher.run).toHaveBeenCalledWith("xterm", [], { cwd: "/repos/foo" });
  });

  it("should throw TerminalLaunchError when no supported terminal is found on Linux", async () => {
    const launcher = buildLauncher({ platform: "linux", commandExists: () => false });

    await expect(openTerminalAt("/repos/foo", { launcher })).rejects.toThrow(TerminalLaunchError);
  });

  it("should wrap an unexpected failure from the launcher in TerminalLaunchError", async () => {
    const launcher = buildLauncher({
      platform: "darwin",
      run: vi.fn().mockRejectedValue(new Error("spawn failed")),
    });

    await expect(openTerminalAt("/repos/foo", { launcher })).rejects.toThrow(TerminalLaunchError);
  });

  it("should run the preferred command with {path} substituted, bypassing the platform default", async () => {
    const launcher = buildLauncher({ platform: "darwin" });

    await openTerminalAt("/repos/foo", {
      launcher,
      preferredCommand: "open -a iTerm {path}",
    });

    expect(launcher.runShellCommand).toHaveBeenCalledWith('open -a iTerm "/repos/foo"');
    expect(launcher.run).not.toHaveBeenCalled();
  });

  it("should wrap a failure of the preferred command in TerminalLaunchError", async () => {
    const launcher = buildLauncher({
      platform: "darwin",
      runShellCommand: vi.fn().mockRejectedValue(new Error("command not found")),
    });

    await expect(
      openTerminalAt("/repos/foo", { launcher, preferredCommand: "not-a-real-terminal {path}" }),
    ).rejects.toThrow(TerminalLaunchError);
  });

  it("should ignore an empty preferred command and fall back to the platform default", async () => {
    const launcher = buildLauncher({ platform: "darwin" });

    await openTerminalAt("/repos/foo", { launcher, preferredCommand: "" });

    expect(launcher.run).toHaveBeenCalledWith("open", ["-a", "Terminal", "/repos/foo"]);
    expect(launcher.runShellCommand).not.toHaveBeenCalled();
  });
});

describe("terminalPresets", () => {
  it("should list common macOS terminals", () => {
    const names = terminalPresets("darwin").map((preset) => preset.name);

    expect(names).toEqual(expect.arrayContaining(["Terminal", "iTerm2", "Warp"]));
  });

  it("should list common Linux terminals", () => {
    const names = terminalPresets("linux").map((preset) => preset.name);

    expect(names).toEqual(expect.arrayContaining(["GNOME Terminal", "Konsole", "xterm"]));
  });

  it("should list common Windows terminals", () => {
    const names = terminalPresets("win32").map((preset) => preset.name);

    expect(names).toEqual(expect.arrayContaining(["Windows Terminal", "Símbolo del sistema"]));
  });

  it("should give every preset a {path} placeholder to substitute", () => {
    for (const platform of ["darwin", "linux", "win32"] as const) {
      for (const preset of terminalPresets(platform)) {
        expect(preset.command).toContain("{path}");
      }
    }
  });
});
