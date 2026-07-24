import {
  Eye,
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
import { useState } from "react";
import { useNavigate } from "react-router";

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
import { useIsWorktreeStarting } from "../hooks/use-is-worktree-starting";
import {
  PROCESS_STEP_LABELS,
  PULL_REQUEST_STATE_BADGE_VARIANTS,
  PULL_REQUEST_STATE_LABELS,
} from "../lib/worktree-labels";
import type { Worktree, WorktreeProcessStatus, WorktreeProcessStep } from "../schemas";
import { EditWorktreeDevCommandDialog } from "./edit-worktree-dev-command-dialog";
import { EditWorktreePrDialog } from "./edit-worktree-pr-dialog";
import { WorktreeLogsDialog } from "./worktree-logs-dialog";
import { GitStatusBadge, WorktreePorts } from "./worktree-status-badges";

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

// Los botones de la barra inferior de la card comparten forma (el borde
// redondeado de las esquinas lo resuelve el `overflow-hidden` del propio
// `Card`, no hace falta redondear aquí cada botón).
const FOOTER_BUTTON_CLASSNAME = "h-11 w-full gap-1 rounded-none px-1.5 text-[0.8rem]";

// Con 4 acciones en una sola fila, el hueco disponible por botón depende del
// ancho real de la card, no del viewport — la propia card puede ocupar 1, 2 o
// 3 columnas del grid del listado según el tamaño de pantalla. Se usa una
// container query sobre el propio `CardFooter` (`@container/card-footer`, ver
// `card.tsx`) en vez de un breakpoint de página, para que el texto se oculte
// justo antes de que el hueco se quede apretado, sea cual sea el motivo por
// el que la card es estrecha. El nombre accesible del botón no depende de
// este texto (cada uno lleva su propio `aria-label`, ver más abajo), así que
// ocultarlo aquí no deja el botón sin nombre para lectores de pantalla.
const FOOTER_BUTTON_LABEL_CLASSNAME = "hidden @sm/card-footer:inline";

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
  const navigate = useNavigate();
  const openTerminal = useOpenWorktreeTerminal();
  const startWorktree = useStartWorktree();
  const stopWorktree = useStopWorktree();
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [isEditDevCommandOpen, setIsEditDevCommandOpen] = useState(false);
  const [isEditPrOpen, setIsEditPrOpen] = useState(false);

  const isTransitioning = worktree.processStatus === "starting";
  const isStarting = useIsWorktreeStarting(worktree, startWorktree.isPending);

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
      <CardFooter className="grid grid-cols-4 divide-x divide-border bg-muted/30 p-0">
        {isStarting ? (
          // Antes que el `processStatus === "running"` de abajo a propósito:
          // el backend marca "running" en cuanto el proceso hace spawn (ver
          // ADR-0007/`process-manager.ts`), y ese evento de socket llega casi
          // siempre antes de que esta mutación se resuelva — sin esta
          // prioridad, el botón de parar sustituiría al loader de inmediato.
          <Button
            variant="ghost"
            disabled
            aria-label="Arrancando…"
            className={cn(FOOTER_BUTTON_CLASSNAME, "text-success")}
          >
            <Loader2 className="animate-spin" />{" "}
            <span className={FOOTER_BUTTON_LABEL_CLASSNAME}>Arrancando…</span>
          </Button>
        ) : worktree.processStatus === "running" ? (
          <Button
            variant="ghost"
            disabled={stopWorktree.isPending}
            onClick={() => stopWorktree.mutate(worktree.id)}
            aria-label={stopWorktree.isPending ? "Parando…" : "Parar"}
            className={cn(FOOTER_BUTTON_CLASSNAME, "text-destructive hover:bg-destructive/10")}
          >
            {stopWorktree.isPending ? <Loader2 className="animate-spin" /> : <Square />}
            <span className={FOOTER_BUTTON_LABEL_CLASSNAME}>
              {stopWorktree.isPending ? "Parando…" : "Parar"}
            </span>
          </Button>
        ) : (
          <Button
            variant="ghost"
            onClick={() => startWorktree.mutate(worktree.id)}
            aria-label="Arrancar"
            className={cn(FOOTER_BUTTON_CLASSNAME, "text-success hover:bg-success/10")}
          >
            <Play /> <span className={FOOTER_BUTTON_LABEL_CLASSNAME}>Arrancar</span>
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={() => navigate(`/projects/${worktree.projectId}/worktrees/${worktree.id}`)}
          aria-label="Detalle"
          className={FOOTER_BUTTON_CLASSNAME}
        >
          <Eye /> <span className={FOOTER_BUTTON_LABEL_CLASSNAME}>Detalle</span>
        </Button>
        <Button
          variant="ghost"
          onClick={() => setIsLogsOpen(true)}
          aria-label="Logs"
          className={FOOTER_BUTTON_CLASSNAME}
        >
          <ScrollText /> <span className={FOOTER_BUTTON_LABEL_CLASSNAME}>Logs</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" aria-label="Más" className={FOOTER_BUTTON_CLASSNAME}>
                <MoreHorizontal /> <span className={FOOTER_BUTTON_LABEL_CLASSNAME}>Más</span>
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
