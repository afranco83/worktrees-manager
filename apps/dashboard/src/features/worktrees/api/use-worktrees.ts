import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { socket } from "@/lib/socket";

import {
  detectedPortsEventSchema,
  logEntryEventSchema,
  processStatusEventSchema,
  processStepEventSchema,
  type LogEntry,
  type Worktree,
  type WorktreeProcessStep,
} from "../schemas";
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

  // Estado en vivo transitorio (no forma parte del `Worktree` persistido):
  // sub-paso dentro de "starting" y la última línea de log de cada worktree,
  // para dar feedback de progreso en la propia card sin abrir el diálogo de
  // logs (ver ADR-0007 y el hallazgo de UX sobre feedback de arranque).
  const [stepByWorktreeId, setStepByWorktreeId] = useState<
    Record<string, WorktreeProcessStep | null>
  >({});
  const [latestLogByWorktreeId, setLatestLogByWorktreeId] = useState<Record<string, LogEntry>>({});

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

    function handleDetectedPorts(event: unknown): void {
      const result = detectedPortsEventSchema.safeParse(event);

      if (!result.success) {
        return;
      }

      queryClient.setQueryData<Worktree[]>(worktreesQueryKey(projectId), (current) =>
        current?.map((worktree) =>
          worktree.id === result.data.worktreeId
            ? { ...worktree, detectedPorts: result.data.ports }
            : worktree,
        ),
      );
    }

    function handleProcessStep(event: unknown): void {
      const result = processStepEventSchema.safeParse(event);

      if (!result.success) {
        return;
      }

      setStepByWorktreeId((current) => ({
        ...current,
        [result.data.worktreeId]: result.data.step,
      }));
    }

    function handleLogEntry(event: unknown): void {
      const result = logEntryEventSchema.safeParse(event);

      if (!result.success) {
        return;
      }

      setLatestLogByWorktreeId((current) => ({
        ...current,
        [result.data.worktreeId]: result.data.entry,
      }));
    }

    socket.on("process-status", handleProcessStatus);
    socket.on("detected-ports", handleDetectedPorts);
    socket.on("process-step", handleProcessStep);
    socket.on("log-entry", handleLogEntry);

    return () => {
      socket.off("connect", joinAllRooms);
      socket.off("process-status", handleProcessStatus);
      socket.off("detected-ports", handleDetectedPorts);
      socket.off("process-step", handleProcessStep);
      socket.off("log-entry", handleLogEntry);

      for (const worktree of worktrees) {
        socket.emit("leave-worktree", worktree.id);
      }
    };
  }, [query.data, projectId, queryClient]);

  return { ...query, stepByWorktreeId, latestLogByWorktreeId };
}
