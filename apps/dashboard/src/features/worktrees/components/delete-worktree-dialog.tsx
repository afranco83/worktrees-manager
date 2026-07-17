import { Dialog, DialogContent } from "@/components/ui/dialog";

import type { Worktree } from "../schemas";
import { DeleteWorktreeStep } from "./delete-worktree-step";

export function DeleteWorktreeDialog({
  projectId,
  worktree,
  open,
  onOpenChange,
}: {
  projectId: string;
  worktree: Worktree;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DeleteWorktreeStep
          projectId={projectId}
          worktree={worktree}
          onCancel={() => onOpenChange(false)}
          onDeleted={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
