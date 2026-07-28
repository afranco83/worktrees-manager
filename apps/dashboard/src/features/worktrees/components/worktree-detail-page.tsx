import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  Pencil,
  Play,
  Square,
  Terminal as TerminalIcon,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { IconButton } from "@/components/ui/icon-button";
import { useProjects } from "@/features/projects/api/use-projects";

import { useOpenWorktreeTerminal } from "../api/use-open-worktree-terminal";
import { useStartWorktree } from "../api/use-start-worktree";
import { useStopWorktree } from "../api/use-stop-worktree";
import { useWorktreePullRequest } from "../api/use-worktree-pull-request";
import { useWorktrees } from "../api/use-worktrees";
import { useIsWorktreeStarting } from "../hooks/use-is-worktree-starting";
import { useWorktreeLogsPanel } from "../hooks/use-worktree-logs-panel";
import {
  PROCESS_STEP_LABELS,
  PULL_REQUEST_STATE_BADGE_VARIANTS,
  PULL_REQUEST_STATE_LABELS,
} from "../lib/worktree-labels";
import { DeleteWorktreeDialog } from "./delete-worktree-dialog";
import { EditWorktreeDevCommandDialog } from "./edit-worktree-dev-command-dialog";
import { EditWorktreePrDialog } from "./edit-worktree-pr-dialog";
import { GitStatusBadge } from "./worktree-status-badges";
import { WorktreeLogEntries, WorktreeLogsToolbar } from "./worktree-logs-panel";

export function WorktreeDetailPage() {
  const { projectId, worktreeId } = useParams<{ projectId: string; worktreeId: string }>();
  const navigate = useNavigate();
  const { data: projects } = useProjects();
  const worktrees = useWorktrees(projectId ?? "");
  const { data: pullRequest } = useWorktreePullRequest(worktreeId ?? "");
  const openTerminal = useOpenWorktreeTerminal();
  const startWorktree = useStartWorktree();
  const stopWorktree = useStopWorktree();
  const [isEditDevCommandOpen, setIsEditDevCommandOpen] = useState(false);
  const [isEditPrOpen, setIsEditPrOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const project = projects?.find((candidate) => candidate.id === projectId);
  const worktree = worktrees.data?.find((candidate) => candidate.id === worktreeId);

  const isStarting = useIsWorktreeStarting(worktree, startWorktree.isPending);
  const logsPanel = useWorktreeLogsPanel(
    worktreeId ?? "",
    worktree?.branch ?? "",
    worktree != null,
  );

  if (worktrees.isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Cargando worktree…</p>;
  }

  if (worktrees.isError) {
    return (
      <p className="p-6 text-sm text-destructive" role="alert">
        {worktrees.error.message}
      </p>
    );
  }

  if (!worktree) {
    return (
      <div className="flex flex-col items-start gap-3 p-6">
        <p className="text-sm text-muted-foreground">No se ha encontrado el worktree.</p>
        {projectId && (
          <Link
            to={`/projects/${projectId}`}
            className="inline-flex items-center gap-1 text-sm text-foreground hover:underline"
          >
            <ArrowLeft className="size-4" /> Volver al proyecto
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <Link
        to={`/projects/${worktree.projectId}`}
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        <ArrowLeft className="size-4" /> {project ? project.name : "Volver al proyecto"}
      </Link>

      <Card>
        <CardHeader>
          <CardTitle level={2} className="flex items-center gap-2 text-xl">
            {worktree.branch}
            <GitStatusBadge gitStatus={worktree.gitStatus} />
          </CardTitle>
          <CardDescription>{worktree.path}</CardDescription>
          <CardAction className="flex items-center gap-2">
            {isStarting ? (
              <Button disabled>
                <Loader2 className="animate-spin" /> Arrancando…
              </Button>
            ) : worktree.processStatus === "running" ? (
              <Button
                className="bg-chart-1 text-black hover:bg-chart-1/80"
                disabled={stopWorktree.isPending}
                onClick={() => stopWorktree.mutate(worktree.id)}
              >
                {stopWorktree.isPending ? <Loader2 className="animate-spin" /> : <Square />}
                {stopWorktree.isPending ? "Parando…" : "Parar"}
              </Button>
            ) : (
              <Button onClick={() => startWorktree.mutate(worktree.id)}>
                <Play /> Arrancar
              </Button>
            )}
            <IconButton
              icon={TerminalIcon}
              label="Abrir terminal"
              onClick={() => openTerminal.mutate(worktree.id)}
            />
            <IconButton
              icon={Trash2}
              label="Borrar worktree"
              variant="destructive"
              onClick={() => setIsDeleteOpen(true)}
            />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="text-sm">
            <dt className="flex items-center gap-1 text-muted-foreground">
              Comando de arranque
              <IconButton
                icon={Pencil}
                label="Editar comando de arranque"
                size="icon-xs"
                variant="ghost"
                onClick={() => setIsEditDevCommandOpen(true)}
              />
            </dt>
            <dd>{worktree.devCommandOverride ?? project?.devCommand}</dd>
          </dl>

          {worktree.processStatus === "starting" && (
            <p className="text-sm text-muted-foreground">
              {/* El `step` en vivo (vía socket) solo lo trackea `useWorktrees` por
              worktree — la card del listado ya lo consume por id; aquí, sin ese
              detalle fino, basta con el paso genérico. */}
              {PROCESS_STEP_LABELS["starting-dev-command"]}
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
      </Card>

      <Card>
        <CardHeader>
          <CardTitle level={3}>Puertos</CardTitle>
        </CardHeader>
        <CardContent>
          {worktree.detectedPorts.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {worktree.detectedPorts.map(({ port, label }) => (
                <a
                  key={port}
                  href={`http://localhost:${port}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-md border border-border bg-muted px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  {label ? (
                    <>
                      <span className="font-medium">{label}</span>
                      <span className="text-muted-foreground">:{port}</span>
                    </>
                  ) : (
                    `Puerto ${port}`
                  )}
                  <ExternalLink className="size-3.5 text-muted-foreground" />
                </a>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {worktree.processStatus === "running"
                ? "Todavía sin detectar"
                : "Se detectan al arrancar"}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle level={3}>Pull Request</CardTitle>
          <CardAction>
            <IconButton
              icon={Pencil}
              label={pullRequest ? "Editar Pull Request" : "Asociar Pull Request"}
              onClick={() => setIsEditPrOpen(true)}
            />
          </CardAction>
        </CardHeader>
        <CardContent>
          {pullRequest ? (
            <a
              href={pullRequest.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm hover:underline"
            >
              <Badge variant={PULL_REQUEST_STATE_BADGE_VARIANTS[pullRequest.state]}>
                PR #{pullRequest.number} · {PULL_REQUEST_STATE_LABELS[pullRequest.state]}
              </Badge>
              <ExternalLink className="size-3.5 text-muted-foreground" />
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">Sin Pull Request asociada.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle level={3}>Logs</CardTitle>
          <CardAction className="flex gap-2">
            <WorktreeLogsToolbar {...logsPanel} />
          </CardAction>
        </CardHeader>
        <CardContent>
          <WorktreeLogEntries {...logsPanel} className="h-[50vh]" />
        </CardContent>
      </Card>

      <DeleteWorktreeDialog
        projectId={worktree.projectId}
        worktree={worktree}
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        onDeleted={() => navigate(`/projects/${worktree.projectId}`)}
      />
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
    </div>
  );
}
