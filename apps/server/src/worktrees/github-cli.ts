import { execa } from "execa";
import { z } from "zod";

export const PULL_REQUEST_STATES = ["open", "closed", "merged"] as const;
export type PullRequestState = (typeof PULL_REQUEST_STATES)[number];

export interface PullRequestInfo {
  number: number;
  state: PullRequestState;
  url: string;
}

// El JSON de `gh pr view` es una respuesta externa como cualquier otra — se
// valida en el borde en vez de asumir su forma con un `as`, para no dejar
// pasar en silencio un cambio de formato de una versión futura de `gh`.
const ghPrViewOutputSchema = z.object({
  number: z.number().int(),
  state: z.enum(["OPEN", "CLOSED", "MERGED"]),
  url: z.string(),
});

const PULL_REQUEST_STATE_BY_GH_STATE: Record<"OPEN" | "CLOSED" | "MERGED", PullRequestState> = {
  OPEN: "open",
  CLOSED: "closed",
  MERGED: "merged",
};

export function parseGhPrViewOutput(stdout: string): PullRequestInfo {
  const data = ghPrViewOutputSchema.parse(JSON.parse(stdout));

  return {
    number: data.number,
    state: PULL_REQUEST_STATE_BY_GH_STATE[data.state],
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
 * `withGitStatus()` en `plugin.ts` (donde cualquier fallo sí es infrecuente
 * y sí se loguea) — `git-status.ts` en sí tampoco loguea, es el caller quien
 * decide si un fallo merece dejar constancia.
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
