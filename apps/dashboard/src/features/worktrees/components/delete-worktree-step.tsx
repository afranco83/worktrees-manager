import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
  // Bloqueo real, no solo aviso (a diferencia de `hasUnpushedCommits` más
  // abajo): sin forzado posible, el usuario tiene que limpiar el árbol a su
  // criterio (commitear, descartar o guardar en un stash) antes de poder
  // borrar — `git worktree remove` sin `--force` ya rechaza esto por su
  // cuenta en el backend, este check solo evita el viaje de ida y vuelta.
  const hasUncommittedChanges = worktree.gitStatus?.hasUncommittedChanges === true;

  async function handleConfirm(): Promise<void> {
    try {
      await deleteWorktree.mutateAsync({ id: worktree.id });
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
          Se eliminará este directorio del disco. La rama no se borra: sigue existiendo en el
          repositorio.
        </DialogDescription>
      </DialogHeader>
      <p className="rounded-md bg-muted px-3 py-2 font-mono text-xs break-all text-muted-foreground">
        {worktree.path}
      </p>
      {hasUncommittedChanges && (
        <p className="text-sm text-destructive" role="alert">
          Este worktree tiene cambios sin commitear. Límpialos (commitea, descarta o guárdalos en un
          stash) para poder borrarlo.
        </p>
      )}
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
        <Button
          variant="destructive"
          onClick={() => void handleConfirm()}
          disabled={deleteWorktree.isPending || hasUncommittedChanges}
        >
          Borrar
        </Button>
      </DialogFooter>
    </>
  );
}
