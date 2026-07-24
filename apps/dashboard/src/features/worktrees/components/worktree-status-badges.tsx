import { Badge } from "@/components/ui/badge";

import type { GitStatusSummary, Worktree } from "../schemas";

function PortLink({ port, label }: { port: number; label?: string | null }) {
  return (
    <a
      href={`http://localhost:${port}`}
      target="_blank"
      rel="noopener noreferrer"
      className="underline-offset-2 hover:underline"
    >
      {label ? `${label}: ${port}` : `Puerto ${port}`}
    </a>
  );
}

// `worktree.port` es solo el valor pasado como PORT al devCommand, no una
// garantía de qué acabará escuchando: un monorepo con varias apps (turbo,
// workspaces...) puede levantar puertos completamente distintos, y ni
// siquiera una app única tiene por qué respetar esa variable. Mismo criterio
// de silencio que `GitStatusBadge`: nada de puertos hasta tener el dato real
// (anunciado en los logs, ver ADR-0007/ADR-0008), en vez de una suposición
// que además puede cambiar en cuanto arranca de verdad.
export function WorktreePorts({ worktree }: { worktree: Worktree }) {
  if (worktree.detectedPorts.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
      {worktree.detectedPorts.map(({ port, label }) => (
        <PortLink key={port} port={port} label={label} />
      ))}
    </div>
  );
}

// Aviso de seguridad ante el borrado, no un resumen de ficheros (ver
// ADR-0012): silencio cuando no hay nada pendiente o cuando `gitStatus` es
// `null` (no se pudo determinar, p. ej. el directorio ya no existe en
// disco) — mostrar "sin cambios" en ese caso afirmaría algo que no se sabe.
export function GitStatusBadge({ gitStatus }: { gitStatus: GitStatusSummary | null }) {
  if (gitStatus === null) {
    return null;
  }

  return (
    <>
      {gitStatus.hasUncommittedChanges && <Badge variant="secondary">Cambios sin commitear</Badge>}
      {gitStatus.hasUnpushedCommits && <Badge variant="secondary">Commits sin subir</Badge>}
    </>
  );
}
