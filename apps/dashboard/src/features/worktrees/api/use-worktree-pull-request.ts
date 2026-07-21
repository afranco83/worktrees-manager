import { useQuery } from "@tanstack/react-query";

import { fetchWorktreePullRequest } from "./worktrees-api";

export function worktreePullRequestQueryKey(worktreeId: string) {
  return ["worktree-pull-request", worktreeId];
}

// Desacoplado de `useWorktrees` a propósito: a diferencia de `gitStatus`,
// esto es una llamada de red a la API de GitHub (latencia, límite de
// peticiones), no una comprobación local gratis — no tiene sentido en el
// mismo poll de 5s (ver ADR-0013).
export function useWorktreePullRequest(worktreeId: string) {
  return useQuery({
    queryKey: worktreePullRequestQueryKey(worktreeId),
    queryFn: () => fetchWorktreePullRequest(worktreeId),
    refetchInterval: 60000,
  });
}
