import { Check, Copy, Download, Eraser } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { useWorktreeLogsPanel } from "../hooks/use-worktree-logs-panel";
import { stripAnsiCodes } from "../lib/strip-ansi-codes";

type LogsPanelState = ReturnType<typeof useWorktreeLogsPanel>;

export function WorktreeLogEntries({
  entries,
  isLoading,
  isError,
  scrollRef,
  handleScroll,
  className,
}: Pick<LogsPanelState, "entries" | "isLoading" | "isError" | "scrollRef" | "handleScroll"> & {
  className?: string;
}) {
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Cargando logs…</p>;
  }

  if (isError) {
    return (
      <p className="text-sm text-destructive" role="alert">
        No se han podido cargar los logs.
      </p>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className={cn("overflow-y-auto rounded-md bg-muted p-3 font-mono text-xs", className)}
    >
      {entries.length === 0 ? (
        <p className="text-muted-foreground">Todavía no hay salida de este proceso.</p>
      ) : (
        entries.map((entry) => (
          <p
            key={entry.id}
            className={cn("whitespace-pre-wrap", entry.stream === "stderr" && "text-destructive")}
          >
            {stripAnsiCodes(entry.content)}
          </p>
        ))
      )}
    </div>
  );
}

export function WorktreeLogsToolbar({
  entries,
  justCopied,
  handleCopy,
  handleDownload,
  clearEntries,
}: Pick<
  LogsPanelState,
  "entries" | "justCopied" | "handleCopy" | "handleDownload" | "clearEntries"
>) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <>
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
    </>
  );
}
