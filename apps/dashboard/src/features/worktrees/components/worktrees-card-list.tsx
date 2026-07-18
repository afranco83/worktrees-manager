import { Play, ScrollText, SlidersHorizontal, Square, Terminal, Trash2 } from "lucide-react";
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
import { stripAnsiCodes } from "../lib/strip-ansi-codes";
import type {
  DetectedPort,
  LogEntry,
  Worktree,
  WorktreeProcessStatus,
  WorktreeProcessStep,
} from "../schemas";
import { EditWorktreeDevCommandDialog } from "./edit-worktree-dev-command-dialog";
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
