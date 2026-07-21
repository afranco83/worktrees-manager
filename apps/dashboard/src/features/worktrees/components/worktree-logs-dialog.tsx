import { Check, Copy, Download, Eraser } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { useWorktreeLogs } from "../api/use-worktree-logs";
import { stripAnsiCodes } from "../lib/strip-ansi-codes";
import type { Worktree } from "../schemas";

// Cuánto tiempo se ve el estado "Copiado" en el botón antes de volver a su
// icono/etiqueta normales — feedback suficiente sin depender de un sistema de
// notificaciones (toasts) que este proyecto todavía no tiene.
const COPIED_FEEDBACK_MS = 1500;

// Un mismo worktree/rama puede tener "/" en el nombre (p. ej. `feature/foo`),
// no válido como nombre de fichero.
function sanitizeFilename(value: string): string {
  return value.replaceAll(/[\\/]/g, "-");
}

export function WorktreeLogsDialog({
  worktree,
  open,
  onOpenChange,
}: {
  worktree: Worktree;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { entries, isLoading, isError, clearEntries } = useWorktreeLogs(worktree.id, open);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Solo se seguía forzando el scroll al final en cada línea nueva incluso
  // si el usuario se había desplazado hacia arriba a leer algo — se sigue
  // "pegado" al final únicamente mientras ya estaba ahí.
  const isPinnedToBottomRef = useRef(true);
  const [justCopied, setJustCopied] = useState(false);

  useEffect(() => {
    if (scrollRef.current && isPinnedToBottomRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  function handleScroll(): void {
    const el = scrollRef.current;

    if (!el) {
      return;
    }

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isPinnedToBottomRef.current = distanceFromBottom < 24;
  }

  function getPlainTextLog(): string {
    return entries.map((entry) => stripAnsiCodes(entry.content)).join("\n");
  }

  async function handleCopy(): Promise<void> {
    await navigator.clipboard.writeText(getPlainTextLog());
    setJustCopied(true);
    setTimeout(() => setJustCopied(false), COPIED_FEEDBACK_MS);
  }

  function handleDownload(): void {
    const url = URL.createObjectURL(new Blob([getPlainTextLog()], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${sanitizeFilename(worktree.branch)}-logs.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col sm:max-w-6xl">
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
            onScroll={handleScroll}
            className="h-[65vh] overflow-y-auto rounded-md bg-muted p-3 font-mono text-xs"
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
                  {stripAnsiCodes(entry.content)}
                </p>
              ))
            )}
          </div>
        )}

        {entries.length > 0 && (
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => void handleCopy()}>
              {justCopied ? (
                <>
                  <Check /> Copiado
                </>
              ) : (
                <>
                  <Copy /> Copiar
                </>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download /> Descargar
            </Button>
            <Button variant="outline" size="sm" onClick={clearEntries}>
              <Eraser /> Limpiar
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
