import { Terminal, Trash2 } from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { IconButton } from "@/components/ui/icon-button";

import { useOpenWorktreeTerminal } from "../api/use-open-worktree-terminal";
import type { Worktree } from "../schemas";

function WorktreeCard({
  worktree,
  onDelete,
}: {
  worktree: Worktree;
  onDelete: (worktree: Worktree) => void;
}) {
  const openTerminal = useOpenWorktreeTerminal();

  return (
    <Card>
      <CardHeader>
        <CardTitle level={4}>{worktree.branch}</CardTitle>
        <CardDescription className="truncate">{worktree.path}</CardDescription>
        <CardAction className="flex gap-2">
          <IconButton
            icon={Terminal}
            label="Abrir terminal"
            onClick={() => openTerminal.mutate(worktree.id)}
          />
          <IconButton
            icon={Trash2}
            label="Borrar worktree"
            variant="destructive"
            onClick={() => onDelete(worktree)}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">Puerto {worktree.port}</p>
        {openTerminal.isError && (
          <p className="text-sm text-destructive" role="alert">
            {openTerminal.error.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function WorktreesCardList({
  worktrees,
  onDelete,
}: {
  worktrees: Worktree[];
  onDelete: (worktree: Worktree) => void;
}) {
  if (worktrees.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay worktrees creados.</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {worktrees.map((worktree) => (
        <WorktreeCard key={worktree.id} worktree={worktree} onDelete={onDelete} />
      ))}
    </div>
  );
}
