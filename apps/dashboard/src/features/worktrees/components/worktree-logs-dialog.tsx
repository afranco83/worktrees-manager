import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useWorktreeLogsPanel } from "../hooks/use-worktree-logs-panel";
import type { Worktree } from "../schemas";
import { WorktreeLogEntries, WorktreeLogsToolbar } from "./worktree-logs-panel";

export function WorktreeLogsDialog({
  worktree,
  open,
  onOpenChange,
}: {
  worktree: Worktree;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const panel = useWorktreeLogsPanel(worktree.id, worktree.branch, open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Logs de {worktree.branch}</DialogTitle>
          <DialogDescription>Salida en vivo del proceso de dev de este worktree.</DialogDescription>
        </DialogHeader>

        <WorktreeLogEntries {...panel} className="h-[65vh]" />

        {panel.entries.length > 0 && (
          <DialogFooter>
            <WorktreeLogsToolbar {...panel} />
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
