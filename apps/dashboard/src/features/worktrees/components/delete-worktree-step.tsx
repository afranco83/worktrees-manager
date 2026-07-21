import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-client";

import { useDeleteWorktree } from "../api/use-delete-worktree";
import type { Worktree } from "../schemas";

export function DeleteWorktreeStep({
  projectId,
  worktree,
  onCancel,
  onDeleted,
}: {
  projectId: string;
  worktree: Worktree;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const deleteWorktree = useDeleteWorktree(projectId);
  const hasUncommittedChanges =
    deleteWorktree.isError &&
    deleteWorktree.error instanceof ApiError &&
    deleteWorktree.error.status === 409;

  async function handleConfirm(force: boolean): Promise<void> {
    try {
      await deleteWorktree.mutateAsync({ id: worktree.id, force });
    } catch {
      return;
    }

    onDeleted();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Borrar worktree: {worktree.branch}</DialogTitle>
        <DialogDescription>
          Se eliminará el directorio <code>{worktree.path}</code> del disco. La rama{" "}
          <code>{worktree.branch}</code> no se borra: sigue existiendo en el repositorio.
        </DialogDescription>
      </DialogHeader>
      {worktree.gitStatus?.hasUnpushedCommits && (
        <p className="text-sm text-muted-foreground" role="alert">
          Esta rama tiene commits sin subir a ningún remoto conocido — solo existen en este worktree
          y en el propio repositorio local.
        </p>
      )}
      {deleteWorktree.isError && (
        <p className="text-sm text-destructive" role="alert">
          {deleteWorktree.error.message}
        </p>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={deleteWorktree.isPending}>
          Cancelar
        </Button>
        {hasUncommittedChanges ? (
          <Button
            variant="destructive"
            onClick={() => void handleConfirm(true)}
            disabled={deleteWorktree.isPending}
          >
            Forzar borrado
          </Button>
        ) : (
          <Button
            variant="destructive"
            onClick={() => void handleConfirm(false)}
            disabled={deleteWorktree.isPending}
          >
            Borrar
          </Button>
        )}
      </DialogFooter>
    </>
  );
}
