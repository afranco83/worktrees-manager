import { useQuery } from "@tanstack/react-query";

import { fetchWorktrees } from "./worktrees-api";

export function worktreesQueryKey(projectId: string) {
  return ["worktrees", projectId];
}

export function useWorktrees(projectId: string) {
  return useQuery({
    queryKey: worktreesQueryKey(projectId),
    queryFn: () => fetchWorktrees(projectId),
  });
}
