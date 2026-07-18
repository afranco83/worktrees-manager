import { GitBranchPlus, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { IconButton } from "@/components/ui/icon-button";
import { useWorktrees } from "@/features/worktrees/api/use-worktrees";
import { CreateWorktreeDialog } from "@/features/worktrees/components/create-worktree-dialog";
import { DeleteWorktreeDialog } from "@/features/worktrees/components/delete-worktree-dialog";
import { WorktreesCardList } from "@/features/worktrees/components/worktrees-card-list";
import type { Worktree } from "@/features/worktrees/schemas";

import { useProjects } from "../api/use-projects";
import { DeleteProjectDialog } from "./delete-project-dialog";
import { EditProjectDialog } from "./edit-project-dialog";

type DialogState =
  | { type: "closed" }
  | { type: "edit" }
  | { type: "delete" }
  | { type: "create-worktree" }
  | { type: "delete-worktree"; worktree: Worktree };

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { data: projects, isLoading, isError, error } = useProjects();
  const worktrees = useWorktrees(projectId ?? "");
  const [dialogState, setDialogState] = useState<DialogState>({ type: "closed" });

  const project = projects?.find((candidate) => candidate.id === projectId);

  if (isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Cargando proyecto…</p>;
  }

  if (isError) {
    return (
      <p className="p-6 text-sm text-destructive" role="alert">
        {error.message}
      </p>
    );
  }

  if (!project) {
    return <p className="p-6 text-sm text-muted-foreground">No se ha encontrado el proyecto.</p>;
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle level={2} className="text-xl">
            {project.name}
          </CardTitle>
          <CardDescription>{project.localPath}</CardDescription>
          <CardAction className="flex gap-2">
            <IconButton
              icon={Pencil}
              label="Editar proyecto"
              onClick={() => setDialogState({ type: "edit" })}
            />
            <IconButton
              icon={Trash2}
              label="Borrar proyecto"
              variant="destructive"
              onClick={() => setDialogState({ type: "delete" })}
            />
          </CardAction>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Comando de arranque</dt>
              <dd>{project.devCommand}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Worktrees</h3>
          <IconButton
            icon={GitBranchPlus}
            label="Crear worktree"
            onClick={() => setDialogState({ type: "create-worktree" })}
          />
        </div>

        {worktrees.isLoading && (
          <p className="text-sm text-muted-foreground">Cargando worktrees…</p>
        )}
        {worktrees.isError && (
          <p className="text-sm text-destructive" role="alert">
            {worktrees.error.message}
          </p>
        )}
        {worktrees.data && (
          <WorktreesCardList
            worktrees={worktrees.data}
            stepByWorktreeId={worktrees.stepByWorktreeId}
            latestLogByWorktreeId={worktrees.latestLogByWorktreeId}
            onDelete={(worktree) => setDialogState({ type: "delete-worktree", worktree })}
          />
        )}
      </div>

      <EditProjectDialog
        project={project}
        open={dialogState.type === "edit"}
        onOpenChange={(open) => setDialogState(open ? { type: "edit" } : { type: "closed" })}
      />

      <DeleteProjectDialog
        project={project}
        open={dialogState.type === "delete"}
        onOpenChange={(open) => setDialogState(open ? { type: "delete" } : { type: "closed" })}
        onDeleted={() => navigate("/")}
      />

      <CreateWorktreeDialog
        projectId={project.id}
        projectName={project.name}
        open={dialogState.type === "create-worktree"}
        onOpenChange={(open) =>
          setDialogState(open ? { type: "create-worktree" } : { type: "closed" })
        }
      />

      {dialogState.type === "delete-worktree" && (
        <DeleteWorktreeDialog
          projectId={project.id}
          worktree={dialogState.worktree}
          open
          onOpenChange={(open) => setDialogState(open ? dialogState : { type: "closed" })}
        />
      )}
    </div>
  );
}
