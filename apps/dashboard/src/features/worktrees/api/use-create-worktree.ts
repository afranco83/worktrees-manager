import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { CreateWorktreeFormValues } from "../schemas";
import { createWorktree } from "./worktrees-api";
import { worktreesQueryKey } from "./use-worktrees";

export function useCreateWorktree(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateWorktreeFormValues) => createWorktree({ projectId, input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: worktreesQueryKey(projectId) });
    },
  });
}
