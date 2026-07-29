import { useEffect, useRef, useState } from "react";

import { socket } from "@/lib/socket";

import { logEntryEventSchema, type LogEntry } from "../schemas";
import { fetchWorktreeLogs } from "./worktrees-api";

/**
 * Se une a la sala del worktree (y empieza a bufferear eventos) antes de
 * pedir el histórico, para no perder líneas nuevas llegadas en el hueco entre
 * la petición y la suscripción. Al resolver el histórico, descarta del buffer
 * cualquier entrada con `id` <= el máximo recibido (evita duplicados) y añade
 * el resto; a partir de ahí, las líneas nuevas se añaden directamente.
 *
 * Al reabrir para el mismo worktree, no se limpia `entries` antes de que
 * llegue el histórico nuevo (evita el parpadeo a vacío y una llamada a
 * `setState` síncrona en el cuerpo del efecto): se ven las líneas de la
 * apertura anterior hasta que el fetch nuevo las sustituye.
 */
export function useWorktreeLogs(worktreeId: string, enabled: boolean) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const bufferRef = useRef<LogEntry[]>([]);
  const hasResolvedHistoryRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isCancelled = false;
    bufferRef.current = [];
    hasResolvedHistoryRef.current = false;

    function joinRoom(): void {
      socket.emit("join-worktree", worktreeId);
    }

    function handleLogEntry(event: unknown): void {
      const result = logEntryEventSchema.safeParse(event);

      // El cliente puede estar unido a varias salas de worktree a la vez (la
      // lista de worktrees ya se une a todas para trackear su estado — ver
      // `use-worktrees.ts`), así que hay que descartar cualquier línea que no
      // pertenezca a este worktree en concreto.
      if (!result.success || result.data.worktreeId !== worktreeId) {
        return;
      }

      const entry = result.data.entry;

      if (hasResolvedHistoryRef.current) {
        setEntries((current) => [...current, entry]);
      } else {
        bufferRef.current.push(entry);
      }
    }

    joinRoom();
    socket.on("connect", joinRoom);
    socket.on("log-entry", handleLogEntry);

    fetchWorktreeLogs(worktreeId)
      .then((history) => {
        if (isCancelled) {
          return;
        }

        const maxHistoryId = history.at(-1)?.id ?? 0;
        const liveEntriesSinceHistory = bufferRef.current.filter(
          (entry) => entry.id > maxHistoryId,
        );

        setEntries([...history, ...liveEntriesSinceHistory]);
        hasResolvedHistoryRef.current = true;
        setIsLoading(false);
        setIsError(false);
      })
      .catch(() => {
        if (!isCancelled) {
          setIsError(true);
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
      socket.off("connect", joinRoom);
      socket.off("log-entry", handleLogEntry);
      socket.emit("leave-worktree", worktreeId);
    };
  }, [worktreeId, enabled]);

  // Limpia solo la vista actual (como el "clear" de una terminal o de la
  // consola del navegador) — no borra nada en el servidor. Las líneas nuevas
  // que lleguen después se siguen añadiendo con normalidad; al reabrir el
  // diálogo se vuelve a pedir el histórico completo.
  function clearEntries(): void {
    setEntries([]);
  }

  return { entries, isLoading, isError, clearEntries };
}
