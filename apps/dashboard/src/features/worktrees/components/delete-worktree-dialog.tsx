import { Dialog, DialogContent } from "@/components/ui/dialog";

import type { Worktree } from "../schemas";
import { DeleteWorktreeStep } from "./delete-worktree-step";

export function DeleteWorktreeDialog({
  projectId,
  worktree,
  open,
  onOpenChange,
  onDeleted = () => onOpenChange(false),
}: {
  projectId: string;
  worktree: Worktree;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Por defecto solo cierra el diálogo — la vista de detalle del worktree
   * pasa la suya propia para navegar de vuelta al proyecto, ya que el
   * worktree deja de existir. */
  onDeleted?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DeleteWorktreeStep
          projectId={projectId}
          worktree={worktree}
          onCancel={() => onOpenChange(false)}
          onDeleted={onDeleted}
        />
      </DialogContent>
    </Dialog>
  );
}
