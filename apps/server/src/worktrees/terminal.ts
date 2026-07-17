import { execFileSync } from "node:child_process";

import { execa } from "execa";

import { TerminalLaunchError } from "../errors.js";

/**
 * En Linux no hay un único emulador de terminal estándar (a diferencia de
 * macOS/Windows): se prueban los más comunes de los entornos de escritorio
 * habituales, en orden, y se usa el primero instalado.
 */
const LINUX_TERMINAL_CANDIDATES: Array<{ command: string; args: (path: string) => string[] }> = [
  { command: "gnome-terminal", args: (path) => [`--working-directory=${path}`] },
  { command: "konsole", args: (path) => ["--workdir", path] },
  { command: "xfce4-terminal", args: (path) => [`--working-directory=${path}`] },
  { command: "xterm", args: () => [] },
];

export interface TerminalLauncher {
  platform: NodeJS.Platform;
  commandExists: (command: string) => boolean;
  run: (command: string, args: string[], options?: { cwd?: string }) => Promise<void>;
  runShellCommand: (command: string) => Promise<void>;
}

function defaultCommandExists(command: string): boolean {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [command], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export const systemTerminalLauncher: TerminalLauncher = {
  platform: process.platform,
  commandExists: defaultCommandExists,
  run: async (command, args, options) => {
    await execa(command, args, options);
  },
  runShellCommand: async (command) => {
    await execa(command, { shell: true });
  },
};

/**
 * Lista curada de las terminales más populares por plataforma — sin detección
 * real de qué hay instalado (ver ADR-0006: a petición del usuario, preferible
 * ampliar esta lista más adelante que complicar esto con `which`/`open -Ra` en
 * cada petición). `{path}` se sustituye por la ruta real del worktree al abrir.
 */
export function terminalPresets(platform: NodeJS.Platform): Array<{
  name: string;
  command: string;
}> {
  if (platform === "darwin") {
    return [
      { name: "Terminal", command: "open -a Terminal {path}" },
      { name: "iTerm2", command: "open -a iTerm {path}" },
      { name: "Warp", command: "open -a Warp {path}" },
      { name: "Alacritty", command: "open -a Alacritty {path}" },
      { name: "kitty", command: "open -a kitty {path}" },
    ];
  }

  if (platform === "win32") {
    return [
      { name: "Windows Terminal", command: "wt -d {path}" },
      { name: "Símbolo del sistema", command: 'cmd /c start cmd /K "cd /d {path}"' },
    ];
  }

  return [
    { name: "GNOME Terminal", command: "gnome-terminal --working-directory={path}" },
    { name: "Konsole", command: "konsole --workdir {path}" },
    { name: "XFCE Terminal", command: "xfce4-terminal --working-directory={path}" },
    { name: "Alacritty", command: "alacritty --working-directory {path}" },
    { name: "kitty", command: "kitty --directory {path}" },
    { name: "xterm", command: "cd {path} && xterm" },
  ];
}

export async function openTerminalAt(
  path: string,
  options: { preferredCommand?: string | null; launcher?: TerminalLauncher } = {},
): Promise<void> {
  const launcher = options.launcher ?? systemTerminalLauncher;

  try {
    if (options.preferredCommand) {
      // JSON.stringify entrecomilla el path para shells POSIX/Windows ante
      // rutas con espacios — esfuerzo proporcional, no blindaje total de
      // shell-injection (mismo criterio ya aceptado en ADR-0005 para el
      // fallback de cmd.exe: es la propia máquina del usuario configurando su
      // propio comando, no input de terceros).
      const resolvedCommand = options.preferredCommand.replaceAll("{path}", JSON.stringify(path));
      await launcher.runShellCommand(resolvedCommand);
      return;
    }

    if (launcher.platform === "darwin") {
      await launcher.run("open", ["-a", "Terminal", path]);
      return;
    }

    if (launcher.platform === "win32") {
      if (launcher.commandExists("wt")) {
        await launcher.run("wt", ["-d", path]);
      } else {
        await launcher.run("cmd", ["/c", "start", "cmd", "/K", `cd /d "${path}"`]);
      }
      return;
    }

    for (const candidate of LINUX_TERMINAL_CANDIDATES) {
      if (launcher.commandExists(candidate.command)) {
        await launcher.run(candidate.command, candidate.args(path), { cwd: path });
        return;
      }
    }

    throw new TerminalLaunchError(
      "No se ha encontrado ningún emulador de terminal soportado en este sistema " +
        "(se probó gnome-terminal, konsole, xfce4-terminal y xterm)",
    );
  } catch (error) {
    if (error instanceof TerminalLaunchError) {
      throw error;
    }

    throw new TerminalLaunchError(
      `No se pudo abrir la terminal: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
