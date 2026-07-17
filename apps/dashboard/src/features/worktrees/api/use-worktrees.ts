import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { socket } from "@/lib/socket";

import { processStatusEventSchema, type Worktree } from "../schemas";
import { fetchWorktrees } from "./worktrees-api";

export function worktreesQueryKey(projectId: string) {
  return ["worktrees", projectId];
}

export function useWorktrees(projectId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: worktreesQueryKey(projectId),
    queryFn: () => fetchWorktrees(projectId),
  });

  useEffect(() => {
    const worktrees = query.data;

    if (!worktrees || worktrees.length === 0) {
      return;
    }

    function joinAllRooms(): void {
      for (const worktree of worktrees ?? []) {
        socket.emit("join-worktree", worktree.id);
      }
    }

    // Una reconexión es un socket nuevo sin membership previa de sala, así
    // que hay que volver a unirse en cada `connect`, no solo al montar.
    joinAllRooms();
    socket.on("connect", joinAllRooms);

    function handleProcessStatus(event: unknown): void {
      const result = processStatusEventSchema.safeParse(event);

      if (!result.success) {
        return;
      }

      queryClient.setQueryData<Worktree[]>(worktreesQueryKey(projectId), (current) =>
        current?.map((worktree) =>
          worktree.id === result.data.worktreeId
            ? { ...worktree, processStatus: result.data.processStatus, pid: result.data.pid }
            : worktree,
        ),
      );
    }

    socket.on("process-status", handleProcessStatus);

    return () => {
      socket.off("connect", joinAllRooms);
      socket.off("process-status", handleProcessStatus);

      for (const worktree of worktrees) {
        socket.emit("leave-worktree", worktree.id);
      }
    };
  }, [query.data, projectId, queryClient]);

  return query;
}
