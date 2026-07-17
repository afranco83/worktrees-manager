import { useMutation, useQueryClient } from "@tanstack/react-query";

import { deleteWorktree } from "./worktrees-api";
import { worktreesQueryKey } from "./use-worktrees";

export function useDeleteWorktree(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteWorktree,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: worktreesQueryKey(projectId) });
    },
  });
}
