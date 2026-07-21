import {
  GitPullRequest,
  Loader2,
  MoreHorizontal,
  Play,
  ScrollText,
  SlidersHorizontal,
  Square,
  Terminal as TerminalIcon,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { useOpenWorktreeTerminal } from "../api/use-open-worktree-terminal";
import { useStartWorktree } from "../api/use-start-worktree";
import { useStopWorktree } from "../api/use-stop-worktree";
import { useWorktreePullRequest } from "../api/use-worktree-pull-request";
import type {
  GitStatusSummary,
  PullRequestState,
  Worktree,
  WorktreeProcessStatus,
  WorktreeProcessStep,
} from "../schemas";
import { EditWorktreeDevCommandDialog } from "./edit-worktree-dev-command-dialog";
import { EditWorktreePrDialog } from "./edit-worktree-pr-dialog";
import { WorktreeLogsDialog } from "./worktree-logs-dialog";

// `running`/`stopped`/`starting` ya se deducen del propio botón de
// arranque/parada (icono, color y loader mientras arranca o para) — mostrar
// además texto sería redundante. `error` sí lo necesita: el botón vuelve al
// mismo "Arrancar entorno" verde de un worktree parado, así que sin esta
// etiqueta sería indistinguible de un simple "parado".
const PROCESS_STATUS_LABELS: Partial<Record<WorktreeProcessStatus, string>> = {
  error: "Error",
};

const PROCESS_STATUS_DOT_COLORS: Partial<Record<WorktreeProcessStatus, string>> = {
  error: "bg-destructive",
};

const PROCESS_STEP_LABELS: Record<WorktreeProcessStep, string> = {
  "installing-dependencies": "Instalando dependencias…",
  "starting-dev-command": "Arrancando comando de dev…",
};

// Los tres botones de la barra inferior de la card comparten forma (el borde
// redondeado de las esquinas lo resuelve el `overflow-hidden` del propio
// `Card`, no hace falta redondear aquí cada botón).
const FOOTER_BUTTON_CLASSNAME = "h-11 w-full gap-1.5 rounded-none";

// El backend marca `processStatus: "running"` en cuanto el proceso hace
// `spawn` con éxito, sin esperar a que el `devCommand` esté realmente
// escuchando (ver `process-manager.ts`) — para un monorepo con varias apps
// eso puede tardar varios segundos más. `detectedPorts` sí es una señal
// positiva de que algo real está arriba (se rellena al parsear un puerto en
// los logs, ver ADR-0007/0008), así que se usa como proxy de "listo de
// verdad". Un timeout evita esperar para siempre en un `devCommand` que no
// imprime ninguna línea reconocible (p. ej. sin `localhost:<puerto>`).
const FIRST_PORT_DETECTION_TIMEOUT_MS = 10_000;

const PULL_REQUEST_STATE_LABELS: Record<PullRequestState, string> = {
  open: "Abierta",
  closed: "Cerrada",
  merged: "Mergeada",
};

const PULL_REQUEST_STATE_BADGE_VARIANTS: Record<
  PullRequestState,
  ComponentProps<typeof Badge>["variant"]
> = {
  open: "default",
  closed: "destructive",
  merged: "secondary",
};

function ProcessStatusIndicator({ status }: { status: WorktreeProcessStatus }) {
  const label = PROCESS_STATUS_LABELS[status];

  if (label == null) {
    return null;
  }

  return (
    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <span
        aria-hidden="true"
        className={cn("size-2 rounded-full", PROCESS_STATUS_DOT_COLORS[status])}
      />
      {label}
    </span>
  );
}

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
// de silencio que `GitStatusBadge`/`PullRequestBadge`: nada de puertos hasta
// tener el dato real (anunciado en los logs, ver ADR-0007/ADR-0008), en vez
// de una suposición que además puede cambiar en cuanto arranca de verdad.
function WorktreePorts({ worktree }: { worktree: Worktree }) {
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
function GitStatusBadge({ gitStatus }: { gitStatus: GitStatusSummary | null }) {
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

// Query propia (no un campo del `Worktree`, ver ADR-0013): `gh pr view` es una
// llamada de red a GitHub, así que se refresca a un ritmo mucho más lento que
// el resto de la card (60s) y de forma desacoplada del poll de 5s de
// `useWorktrees`. Sin PR asociada, silencio — mismo criterio que `GitStatusBadge`.
function PullRequestBadge({ worktreeId }: { worktreeId: string }) {
  const { data: pullRequest } = useWorktreePullRequest(worktreeId);

  if (pullRequest == null) {
    return null;
  }

  return (
    <a href={pullRequest.url} target="_blank" rel="noopener noreferrer">
      <Badge variant={PULL_REQUEST_STATE_BADGE_VARIANTS[pullRequest.state]}>
        PR #{pullRequest.number} · {PULL_REQUEST_STATE_LABELS[pullRequest.state]}
      </Badge>
    </a>
  );
}

function WorktreeCard({
  worktree,
  step,
  onDelete,
}: {
  worktree: Worktree;
  step: WorktreeProcessStep | null;
  onDelete: (worktree: Worktree) => void;
}) {
  const openTerminal = useOpenWorktreeTerminal();
  const startWorktree = useStartWorktree();
  const stopWorktree = useStopWorktree();
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [isEditDevCommandOpen, setIsEditDevCommandOpen] = useState(false);
  const [isEditPrOpen, setIsEditPrOpen] = useState(false);

  // "stopping" no existe como estado propio (ver `WORKTREE_PROCESS_STATUSES`):
  // parar espera a que el proceso termine de verdad antes de resolver la
  // mutación, así que su propio `isPending` ya es la señal exacta de "en
  // curso". Arrancar sí tiene un estado real e independiente de quién lo
  // dispara (otra pestaña, por ejemplo) — se combinan ambas señales.
  const isTransitioning = worktree.processStatus === "starting";

  // "running" llega muy pronto (ver `FIRST_PORT_DETECTION_TIMEOUT_MS` más
  // arriba) — el efecto solo arranca la espera justo después de una
  // transición a "running" propia (nunca para un worktree que ya estaba
  // corriendo al montar la card). El AND con el estado actual de más abajo
  // hace innecesario resetear el estado a mano en el resto de casos (sin
  // puertos aún no implica seguir esperando si ya se paró, por ejemplo), así
  // que el cuerpo del efecto no llama a `setState` fuera del timeout.
  const [isWaitingSinceStart, setIsWaitingSinceStart] = useState(false);
  const previousProcessStatusRef = useRef(worktree.processStatus);

  useEffect(() => {
    const justStartedRunning =
      previousProcessStatusRef.current !== "running" && worktree.processStatus === "running";
    previousProcessStatusRef.current = worktree.processStatus;

    if (!justStartedRunning || worktree.detectedPorts.length > 0) {
      return;
    }

    setIsWaitingSinceStart(true);
    const timeoutId = setTimeout(
      () => setIsWaitingSinceStart(false),
      FIRST_PORT_DETECTION_TIMEOUT_MS,
    );
    return () => clearTimeout(timeoutId);
  }, [worktree.processStatus, worktree.detectedPorts.length]);

  const isAwaitingFirstPort =
    isWaitingSinceStart &&
    worktree.processStatus === "running" &&
    worktree.detectedPorts.length === 0;
  const isStarting = isTransitioning || startWorktree.isPending || isAwaitingFirstPort;

  return (
    <Card>
      <CardHeader>
        <Tooltip>
          <TooltipTrigger
            render={
              <CardTitle level={4} className="w-fit truncate">
                {worktree.branch}
              </CardTitle>
            }
          />
          <TooltipContent>{worktree.path}</TooltipContent>
        </Tooltip>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <ProcessStatusIndicator status={worktree.processStatus} />
          <WorktreePorts worktree={worktree} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {worktree.devCommandOverride != null && (
            <Badge variant="outline">Comando personalizado</Badge>
          )}
          <GitStatusBadge gitStatus={worktree.gitStatus} />
          <PullRequestBadge worktreeId={worktree.id} />
        </div>
        {isTransitioning && step != null && (
          <p className="text-sm text-muted-foreground">{PROCESS_STEP_LABELS[step]}</p>
        )}
        {openTerminal.isError && (
          <p className="text-sm text-destructive" role="alert">
            {openTerminal.error.message}
          </p>
        )}
        {startWorktree.isError && (
          <p className="text-sm text-destructive" role="alert">
            {startWorktree.error.message}
          </p>
        )}
        {stopWorktree.isError && (
          <p className="text-sm text-destructive" role="alert">
            {stopWorktree.error.message}
          </p>
        )}
      </CardContent>
      <CardFooter className="grid grid-cols-3 divide-x divide-border bg-muted/30 p-0">
        {isStarting ? (
          // Antes que el `processStatus === "running"` de abajo a propósito:
          // el backend marca "running" en cuanto el proceso hace spawn (ver
          // ADR-0007/`process-manager.ts`), y ese evento de socket llega casi
          // siempre antes de que esta mutación se resuelva — sin esta
          // prioridad, el botón de parar sustituiría al loader de inmediato.
          <Button variant="ghost" disabled className={cn(FOOTER_BUTTON_CLASSNAME, "text-success")}>
            <Loader2 className="animate-spin" /> Arrancando…
          </Button>
        ) : worktree.processStatus === "running" ? (
          <Button
            variant="ghost"
            disabled={stopWorktree.isPending}
            onClick={() => stopWorktree.mutate(worktree.id)}
            className={cn(FOOTER_BUTTON_CLASSNAME, "text-destructive hover:bg-destructive/10")}
          >
            {stopWorktree.isPending ? <Loader2 className="animate-spin" /> : <Square />}
            {stopWorktree.isPending ? "Parando…" : "Parar"}
          </Button>
        ) : (
          <Button
            variant="ghost"
            onClick={() => startWorktree.mutate(worktree.id)}
            className={cn(FOOTER_BUTTON_CLASSNAME, "text-success hover:bg-success/10")}
          >
            <Play /> Arrancar
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={() => setIsLogsOpen(true)}
          className={FOOTER_BUTTON_CLASSNAME}
        >
          <ScrollText /> Logs
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" className={FOOTER_BUTTON_CLASSNAME}>
                <MoreHorizontal /> Más
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem onClick={() => setIsEditDevCommandOpen(true)}>
              <SlidersHorizontal /> Comando de arranque
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openTerminal.mutate(worktree.id)}>
              <TerminalIcon /> Terminal
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setIsEditPrOpen(true)}>
              <GitPullRequest /> PR
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(worktree)}>
              <Trash2 /> Borrar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardFooter>

      <WorktreeLogsDialog worktree={worktree} open={isLogsOpen} onOpenChange={setIsLogsOpen} />
      <EditWorktreeDevCommandDialog
        worktree={worktree}
        open={isEditDevCommandOpen}
        onOpenChange={setIsEditDevCommandOpen}
      />
      <EditWorktreePrDialog
        worktree={worktree}
        open={isEditPrOpen}
        onOpenChange={setIsEditPrOpen}
      />
    </Card>
  );
}

export function WorktreesCardList({
  worktrees,
  stepByWorktreeId,
  onDelete,
}: {
  worktrees: Worktree[];
  stepByWorktreeId: Record<string, WorktreeProcessStep | null>;
  onDelete: (worktree: Worktree) => void;
}) {
  if (worktrees.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay worktrees creados.</p>;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {worktrees.map((worktree) => (
        <WorktreeCard
          key={worktree.id}
          worktree={worktree}
          step={stepByWorktreeId[worktree.id] ?? null}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
