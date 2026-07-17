import { Plus, Settings } from "lucide-react";
import { useState } from "react";
import { NavLink } from "react-router";

import { IconButton } from "@/components/ui/icon-button";
import { SettingsDialog } from "@/features/settings/components/settings-dialog";
import { cn } from "@/lib/utils";

import { useProjects } from "../api/use-projects";
import { CreateProjectDialog } from "./create-project-dialog";

export function ProjectsSidebar() {
  const { data: projects, isLoading, isError, error } = useProjects();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-4 border-r border-sidebar-border bg-sidebar p-4 text-sidebar-foreground">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Proyectos</h1>
        <div className="flex gap-1">
          <IconButton icon={Plus} label="Añadir proyecto" onClick={() => setIsCreateOpen(true)} />
          <IconButton icon={Settings} label="Ajustes" onClick={() => setIsSettingsOpen(true)} />
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {isError && (
        <p className="text-sm text-destructive" role="alert">
          {error.message}
        </p>
      )}
      {projects && projects.length === 0 && (
        <p className="text-sm text-muted-foreground">Todavía no hay proyectos registrados.</p>
      )}

      <nav className="flex flex-col gap-1 overflow-y-auto">
        {projects?.map((project) => (
          <NavLink
            key={project.id}
            to={`/projects/${project.id}`}
            className={({ isActive }) =>
              cn(
                "rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent",
                isActive && "bg-sidebar-accent font-medium",
              )
            }
          >
            <span className="block truncate">{project.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {project.localPath}
            </span>
          </NavLink>
        ))}
      </nav>

      <CreateProjectDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
      <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
    </aside>
  );
}
