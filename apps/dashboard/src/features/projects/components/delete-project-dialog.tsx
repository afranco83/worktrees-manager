import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { useDeleteProject } from "../api/use-delete-project";
import type { Project } from "../schemas";

export function DeleteProjectDialog({
  project,
  open,
  onOpenChange,
}: {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const deleteProject = useDeleteProject();

  async function handleConfirm(): Promise<void> {
    try {
      await deleteProject.mutateAsync(project.id);
    } catch {
      return;
    }

    onOpenChange(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Borrar proyecto: {project.name}</AlertDialogTitle>
          <AlertDialogDescription>
            Se eliminará el proyecto del dashboard. El fichero <code>.worktrees-manager.json</code>{" "}
            del repositorio no se modifica.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {deleteProject.isError && (
          <p className="text-sm text-destructive" role="alert">
            {deleteProject.error.message}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => void handleConfirm()}>Borrar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
