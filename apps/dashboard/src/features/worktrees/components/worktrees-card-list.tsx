import {
  GitPullRequest,
  Play,
  ScrollText,
  SlidersHorizontal,
  Square,
  Terminal,
  Trash2,
} from "lucide-react";
import { useState, type ComponentProps } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { IconButton } from "@/components/ui/icon-button";

import { useOpenWorktreeTerminal } from "../api/use-open-worktree-terminal";
import { useStartWorktree } from "../api/use-start-worktree";
import { useStopWorktree } from "../api/use-stop-worktree";
import { useWorktreePullRequest } from "../api/use-worktree-pull-request";
import { stripAnsiCodes } from "../lib/strip-ansi-codes";
import type {
  DetectedPort,
  GitStatusSummary,
  LogEntry,
  PullRequestState,
  Worktree,
  WorktreeProcessStatus,
  WorktreeProcessStep,
} from "../schemas";
import { EditWorktreeDevCommandDialog } from "./edit-worktree-dev-command-dialog";
import { EditWorktreePrDialog } from "./edit-worktree-pr-dialog";
import { WorktreeLogsDialog } from "./worktree-logs-dialog";

const PROCESS_STATUS_LABELS: Record<WorktreeProcessStatus, string> = {
  stopped: "Parado",
  starting: "Arrancando…",
  running: "Corriendo",
  error: "Error",
};

const PROCESS_STATUS_BADGE_VARIANTS: Record<
  WorktreeProcessStatus,
  ComponentProps<typeof Badge>["variant"]
> = {
  stopped: "secondary",
  starting: "outline",
  running: "default",
  error: "destructive",
};

const PROCESS_STEP_LABELS: Record<WorktreeProcessStep, string> = {
  "installing-dependencies": "Instalando dependencias…",
  "starting-dev-command": "Arrancando comando de dev…",
};

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

// Un monorepo con varias apps (turbo, workspaces...) puede levantar más de un
// puerto real; el único `port` asignado solo es el que se pasa como PORT al
// devCommand, así que en cuanto se detectan puertos reales en los logs se
// muestran esos en su lugar, con la app que los anuncia si se pudo extraer
// del prefijo de log (ver ADR-0007/ADR-0008). Solo son clicables mientras el
// entorno está corriendo — un puerto parado no tiene nada escuchando.
function WorktreePorts({ worktree }: { worktree: Worktree }) {
  if (worktree.processStatus !== "running") {
    return <p className="text-sm text-muted-foreground">Puerto {worktree.port}</p>;
  }

  const ports: DetectedPort[] =
    worktree.detectedPorts.length > 0
      ? worktree.detectedPorts
      : [{ port: worktree.port, label: null }];

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
      {ports.map(({ port, label }) => (
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
  latestLog,
  onDelete,
}: {
  worktree: Worktree;
  step: WorktreeProcessStep | null;
  latestLog: LogEntry | undefined;
  onDelete: (worktree: Worktree) => void;
}) {
  const openTerminal = useOpenWorktreeTerminal();
  const startWorktree = useStartWorktree();
  const stopWorktree = useStopWorktree();
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [isEditDevCommandOpen, setIsEditDevCommandOpen] = useState(false);
  const [isEditPrOpen, setIsEditPrOpen] = useState(false);

  const isTransitioning = worktree.processStatus === "starting";

  return (
    <Card>
      <CardHeader>
        <CardTitle level={4}>{worktree.branch}</CardTitle>
        <CardDescription className="truncate">{worktree.path}</CardDescription>
        <CardAction className="flex gap-2">
          {worktree.processStatus === "running" ? (
            <IconButton
              icon={Square}
              label="Parar entorno"
              disabled={isTransitioning || stopWorktree.isPending}
              onClick={() => stopWorktree.mutate(worktree.id)}
            />
          ) : (
            <IconButton
              icon={Play}
              label="Arrancar entorno"
              disabled={isTransitioning || startWorktree.isPending}
              onClick={() => startWorktree.mutate(worktree.id)}
            />
          )}
          <IconButton icon={ScrollText} label="Ver logs" onClick={() => setIsLogsOpen(true)} />
          <IconButton
            icon={SlidersHorizontal}
            label="Editar comando de arranque"
            onClick={() => setIsEditDevCommandOpen(true)}
          />
          <IconButton
            icon={Terminal}
            label="Abrir terminal"
            onClick={() => openTerminal.mutate(worktree.id)}
          />
          <IconButton
            icon={GitPullRequest}
            label="Asociar PR"
            onClick={() => setIsEditPrOpen(true)}
          />
          <IconButton
            icon={Trash2}
            label="Borrar worktree"
            variant="destructive"
            onClick={() => onDelete(worktree)}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Badge variant={PROCESS_STATUS_BADGE_VARIANTS[worktree.processStatus]}>
            {PROCESS_STATUS_LABELS[worktree.processStatus]}
          </Badge>
          {worktree.devCommandOverride != null && (
            <Badge variant="outline">Comando personalizado</Badge>
          )}
          <GitStatusBadge gitStatus={worktree.gitStatus} />
          <PullRequestBadge worktreeId={worktree.id} />
          <WorktreePorts worktree={worktree} />
        </div>
        {isTransitioning && step != null && (
          <p className="text-sm text-muted-foreground">{PROCESS_STEP_LABELS[step]}</p>
        )}
        {worktree.processStatus !== "stopped" && latestLog != null && (
          <p className="truncate font-mono text-xs text-muted-foreground">
            {stripAnsiCodes(latestLog.content)}
          </p>
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
  latestLogByWorktreeId,
  onDelete,
}: {
  worktrees: Worktree[];
  stepByWorktreeId: Record<string, WorktreeProcessStep | null>;
  latestLogByWorktreeId: Record<string, LogEntry>;
  onDelete: (worktree: Worktree) => void;
}) {
  if (worktrees.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay worktrees creados.</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {worktrees.map((worktree) => (
        <WorktreeCard
          key={worktree.id}
          worktree={worktree}
          step={stepByWorktreeId[worktree.id] ?? null}
          latestLog={latestLogByWorktreeId[worktree.id]}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
