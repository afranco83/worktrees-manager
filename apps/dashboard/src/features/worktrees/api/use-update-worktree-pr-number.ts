import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { PullRequestInfo } from "../schemas";
import { updateWorktreePrNumber } from "./worktrees-api";
import { worktreePullRequestQueryKey } from "./use-worktree-pull-request";

export function useUpdateWorktreePrNumber() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateWorktreePrNumber,
    onSuccess: (pullRequest: PullRequestInfo | null, variables) => {
      queryClient.setQueryData(worktreePullRequestQueryKey(variables.id), pullRequest);
    },
  });
}
