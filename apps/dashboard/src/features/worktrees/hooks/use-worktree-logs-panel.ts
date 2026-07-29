import { useEffect, useRef, useState } from "react";

import { useWorktreeLogs } from "../api/use-worktree-logs";
import { stripAnsiCodes } from "../lib/strip-ansi-codes";

// Cuánto tiempo se ve el estado "Copiado" en el botón antes de volver a su
// icono/etiqueta normales — feedback suficiente sin depender de un sistema de
// notificaciones (toasts) que este proyecto todavía no tiene.
const COPIED_FEEDBACK_MS = 1500;

// Un mismo worktree/rama puede tener "/" en el nombre (p. ej. `feature/foo`),
// no válido como nombre de fichero.
function sanitizeFilename(value: string): string {
  return value.replaceAll(/[\\/]/g, "-");
}

/**
 * Estado y acciones del panel de logs (usado tanto por el modal como por la
 * vista de detalle del worktree, ver `worktree-logs-panel.tsx`) — cada
 * consumidor decide su propia disposición (modal vs. tarjeta embebida), pero
 * comparten toda la lógica: histórico + tiempo real, fijado del scroll al
 * final solo mientras el usuario ya estaba ahí, copiar, descargar y limpiar
 * la vista.
 */
export function useWorktreeLogsPanel(worktreeId: string, branch: string, enabled: boolean) {
  const { entries, isLoading, isError, clearEntries } = useWorktreeLogs(worktreeId, enabled);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Solo se sigue forzando el scroll al final en cada línea nueva si el
  // usuario ya estaba ahí — si se ha desplazado hacia arriba a leer algo, se
  // deja de seguir el final hasta que vuelva a bajar del todo.
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
    link.download = `${sanitizeFilename(branch)}-logs.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return {
    entries,
    isLoading,
    isError,
    clearEntries,
    scrollRef,
    handleScroll,
    handleCopy,
    handleDownload,
    justCopied,
  };
}
