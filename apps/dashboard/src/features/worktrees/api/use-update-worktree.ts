import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { Worktree } from "../schemas";
import { updateWorktreeDevCommandOverride } from "./worktrees-api";
import { worktreesQueryKey } from "./use-worktrees";

export function useUpdateWorktree() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateWorktreeDevCommandOverride,
    onSuccess: (updatedWorktree) => {
      queryClient.setQueryData<Worktree[]>(
        worktreesQueryKey(updatedWorktree.projectId),
        (current) =>
          current?.map((worktree) =>
            worktree.id === updatedWorktree.id ? updatedWorktree : worktree,
          ),
      );
    },
  });
}
