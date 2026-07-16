import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { Project } from "../schemas";

export function ProjectsTable({
  projects,
  onEdit,
  onDelete,
  onWorktrees,
}: {
  projects: Project[];
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
  onWorktrees: (project: Project) => void;
}) {
  if (projects.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay proyectos registrados.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nombre</TableHead>
          <TableHead>Ruta local</TableHead>
          <TableHead>Comando</TableHead>
          <TableHead>Puertos</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {projects.map((project) => (
          <TableRow key={project.id}>
            <TableCell>{project.name}</TableCell>
            <TableCell className="max-w-xs truncate">{project.localPath}</TableCell>
            <TableCell>{project.devCommand}</TableCell>
            <TableCell>
              {project.portRangeStart}–{project.portRangeEnd}
            </TableCell>
            <TableCell className="flex justify-end gap-2 text-right">
              <Button variant="outline" size="sm" onClick={() => onWorktrees(project)}>
                Worktrees
              </Button>
              <Button variant="outline" size="sm" onClick={() => onEdit(project)}>
                Editar
              </Button>
              <Button variant="destructive" size="sm" onClick={() => onDelete(project)}>
                Borrar
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
