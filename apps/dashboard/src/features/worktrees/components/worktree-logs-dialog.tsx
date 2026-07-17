import { useEffect, useRef } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { useWorktreeLogs } from "../api/use-worktree-logs";
import type { Worktree } from "../schemas";

export function WorktreeLogsDialog({
  worktree,
  open,
  onOpenChange,
}: {
  worktree: Worktree;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { entries, isLoading, isError } = useWorktreeLogs(worktree.id, open);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Logs de {worktree.branch}</DialogTitle>
          <DialogDescription>Salida en vivo del proceso de dev de este worktree.</DialogDescription>
        </DialogHeader>

        {isLoading && <p className="text-sm text-muted-foreground">Cargando logs…</p>}
        {isError && (
          <p className="text-sm text-destructive" role="alert">
            No se han podido cargar los logs.
          </p>
        )}

        {!isLoading && !isError && (
          <div
            ref={scrollRef}
            className="max-h-96 overflow-y-auto rounded-md bg-muted p-3 font-mono text-xs"
          >
            {entries.length === 0 ? (
              <p className="text-muted-foreground">Todavía no hay salida de este proceso.</p>
            ) : (
              entries.map((entry) => (
                <p
                  key={entry.id}
                  className={cn(
                    "whitespace-pre-wrap",
                    entry.stream === "stderr" && "text-destructive",
                  )}
                >
                  {entry.content}
                </p>
              ))
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
