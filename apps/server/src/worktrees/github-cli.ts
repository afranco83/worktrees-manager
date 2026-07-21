import { execa } from "execa";

export const PULL_REQUEST_STATES = ["open", "closed", "merged"] as const;
export type PullRequestState = (typeof PULL_REQUEST_STATES)[number];

export interface PullRequestInfo {
  number: number;
  state: PullRequestState;
  url: string;
}

interface GhPrViewOutput {
  number: number;
  state: "OPEN" | "CLOSED" | "MERGED";
  url: string;
}

export function parseGhPrViewOutput(stdout: string): PullRequestInfo {
  const data = JSON.parse(stdout) as GhPrViewOutput;

  return {
    number: data.number,
    state: data.state.toLowerCase() as PullRequestState,
    url: data.url,
  };
}

export interface GitHubCli {
  viewPullRequest: (cwd: string, ref: string) => Promise<PullRequestInfo | null>;
}

/**
 * `ref` es el número de PR (como string) si hay override manual, o el nombre
 * de rama si no — `gh pr view` acepta ambos indistintamente.
 *
 * Nunca lanza: la inmensa mayoría de worktrees no tienen PR asociada, así que
 * "no se encontró PR" es el resultado normal, no un error — igual que
 * cualquier fallo real de `gh` (no instalado, sin sesión, sin red). Se
 * degrada a `null` sin distinguir motivos ni loguear, a diferencia de
 * `git-status.ts` (donde cualquier fallo sí es infrecuente y sí se loguea).
 */
export const systemGitHubCli: GitHubCli = {
  viewPullRequest: async (cwd, ref) => {
    try {
      const { stdout } = await execa("gh", ["pr", "view", ref, "--json", "number,state,url"], {
        cwd,
      });

      return parseGhPrViewOutput(stdout);
    } catch {
      return null;
    }
  },
};
