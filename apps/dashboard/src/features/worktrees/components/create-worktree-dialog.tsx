import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { CreateWorktreeForm } from "./create-worktree-form";

export function CreateWorktreeDialog({
  projectId,
  projectName,
  open,
  onOpenChange,
}: {
  projectId: string;
  projectName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear worktree</DialogTitle>
          <DialogDescription>
            Se creará una rama nueva y un directorio de worktree para {projectName}.
          </DialogDescription>
        </DialogHeader>
        <CreateWorktreeForm projectId={projectId} onCreated={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
