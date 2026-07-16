import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { Worktree } from "../schemas";

export function WorktreesTable({
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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Rama</TableHead>
          <TableHead>Ruta</TableHead>
          <TableHead>Puerto</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {worktrees.map((worktree) => (
          <TableRow key={worktree.id}>
            <TableCell>{worktree.branch}</TableCell>
            <TableCell className="max-w-xs truncate">{worktree.path}</TableCell>
            <TableCell>{worktree.port}</TableCell>
            <TableCell className="text-right">
              <Button variant="destructive" size="sm" onClick={() => onDelete(worktree)}>
                Borrar
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
