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
  { command: "alacritty", args: (path) => ["--working-directory", path] },
  { command: "kitty", args: (path) => ["--directory", path] },
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

/**
 * Cita `value` como argumento literal de shell para la plataforma dada.
 *
 * En POSIX se usan comillas simples (todo literal salvo una comilla simple,
 * que se cierra/escapa/reabre) — a diferencia de `JSON.stringify`, que no
 * protege frente a `$()`/backticks de un shell real.
 *
 * En Windows, envolver solo en comillas dobles NO basta: `cmd.exe` expande
 * `%VAR%` como variable de entorno y trata `&`/`|`/`<`/`>`/`^`/`(`/`)` como
 * metacaracteres propios, en ambos casos independientemente de las comillas.
 * Se sigue el algoritmo documentado en https://qntm.org/cmd (el mismo que usa
 * `cross-spawn`): se duplican las barras invertidas que preceden a una
 * comilla y se escapan las comillas internas, se envuelve en comillas dobles,
 * y se antepone `^` a cada metacarácter de `cmd.exe` — incluidas las propias
 * comillas envolventes. Sigue siendo esfuerzo best-effort, no una garantía
 * formal (no existe una gramática de citado completa y consistente en
 * `cmd.exe`), pero cierra los vectores conocidos y documentados.
 */
function quoteForShell(value: string, platform: NodeJS.Platform): string {
  if (platform === "win32") {
    const quoted = `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, "$1$1")}"`;

    return quoted.replace(/(["^&|<>()%])/g, "^$1");
  }

  return `'${value.replaceAll("'", `'\\''`)}'`;
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
      { name: "Símbolo del sistema", command: "cmd /c start cmd /K cd /d {path}" },
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
      const resolvedCommand = options.preferredCommand.replaceAll(
        "{path}",
        quoteForShell(path, launcher.platform),
      );
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
        // El propio `cmd.exe` lanzado (no execa) es quien parsea e interpreta
        // esta cadena como línea de comandos vía `/K`, así que necesita el
        // mismo escapado que el comando preferido, no solo comillas.
        await launcher.run("cmd", [
          "/c",
          "start",
          "cmd",
          "/K",
          `cd /d ${quoteForShell(path, "win32")}`,
        ]);
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
        "(se probó gnome-terminal, konsole, xfce4-terminal, alacritty, kitty y xterm)",
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
