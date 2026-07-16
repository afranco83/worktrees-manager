import { useState } from "react";

import { Button } from "@/components/ui/button";
import { WorktreesDialog } from "@/features/worktrees/components/worktrees-dialog";

import { useProjects } from "../api/use-projects";
import type { Project } from "../schemas";
import { CreateProjectDialog } from "./create-project-dialog";
import { DeleteProjectDialog } from "./delete-project-dialog";
import { EditProjectDialog } from "./edit-project-dialog";
import { ProjectsTable } from "./projects-table";

type DialogState =
  | { type: "closed" }
  | { type: "create" }
  | { type: "edit"; project: Project }
  | { type: "delete"; project: Project }
  | { type: "worktrees"; project: Project };

export function ProjectsPage() {
  const { data: projects, isLoading, isError, error } = useProjects();
  const [dialogState, setDialogState] = useState<DialogState>({ type: "closed" });

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Proyectos</h1>
        <Button onClick={() => setDialogState({ type: "create" })}>+ Añadir proyecto</Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Cargando proyectos…</p>}
      {isError && (
        <p className="text-sm text-destructive" role="alert">
          {error.message}
        </p>
      )}
      {projects && (
        <ProjectsTable
          projects={projects}
          onEdit={(project) => setDialogState({ type: "edit", project })}
          onDelete={(project) => setDialogState({ type: "delete", project })}
          onWorktrees={(project) => setDialogState({ type: "worktrees", project })}
        />
      )}

      <CreateProjectDialog
        open={dialogState.type === "create"}
        onOpenChange={(open) => setDialogState(open ? { type: "create" } : { type: "closed" })}
      />

      {dialogState.type === "edit" && (
        <EditProjectDialog
          project={dialogState.project}
          open
          onOpenChange={(open) => setDialogState(open ? dialogState : { type: "closed" })}
        />
      )}

      {dialogState.type === "delete" && (
        <DeleteProjectDialog
          project={dialogState.project}
          open
          onOpenChange={(open) => setDialogState(open ? dialogState : { type: "closed" })}
        />
      )}

      {dialogState.type === "worktrees" && (
        <WorktreesDialog
          project={dialogState.project}
          open
          onOpenChange={(open) => setDialogState(open ? dialogState : { type: "closed" })}
        />
      )}
    </main>
  );
}
