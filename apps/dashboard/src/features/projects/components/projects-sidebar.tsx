import { Menu, Plus, Settings } from "lucide-react";
import { useState } from "react";
import { NavLink } from "react-router";

import { ThemeToggle } from "@/components/theme-toggle";
import { IconButton } from "@/components/ui/icon-button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SettingsDialog } from "@/features/settings/components/settings-dialog";
import { cn } from "@/lib/utils";

import { useProjects } from "../api/use-projects";
import { CreateProjectDialog } from "./create-project-dialog";

// Cabecera de acciones + navegación en sí, sin el contenedor (`<aside>`
// persistente en pantallas grandes, `SheetContent` deslizante en
// móvil/tablet — ver `ProjectsSidebar`). `onNavigate` cierra el panel
// deslizante al elegir un proyecto; en el sidebar persistente es un no-op.
function ProjectsSidebarContent({ onNavigate }: { onNavigate: () => void }) {
  const { data: projects, isLoading, isError, error } = useProjects();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Proyectos</h1>
        <div className="flex gap-1">
          <IconButton icon={Plus} label="Añadir proyecto" onClick={() => setIsCreateOpen(true)} />
          <IconButton icon={Settings} label="Ajustes" onClick={() => setIsSettingsOpen(true)} />
          <ThemeToggle />
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
          <Tooltip key={project.id}>
            <TooltipTrigger
              render={
                <NavLink
                  to={`/projects/${project.id}`}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      "block truncate rounded-md px-3 py-2 text-sm transition-colors",
                      isActive
                        ? "bg-sidebar-primary/15 font-medium text-sidebar-primary hover:bg-sidebar-primary/20"
                        : "hover:bg-sidebar-primary/10",
                    )
                  }
                >
                  {project.name}
                </NavLink>
              }
            />
            <TooltipContent side="right">{project.localPath}</TooltipContent>
          </Tooltip>
        ))}
      </nav>

      <CreateProjectDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
      <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
    </>
  );
}

// Por debajo de `lg` el sidebar persistente (288px) no deja sitio para el
// contenido — se sustituye por una barra superior con un botón que abre la
// misma navegación en un panel deslizante (`Sheet`), en vez de un layout
// paralelo distinto para móvil.
export function ProjectsSidebar() {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between border-b border-sidebar-border bg-sidebar p-3 text-sidebar-foreground lg:hidden">
        <IconButton icon={Menu} label="Abrir navegación" onClick={() => setIsMobileNavOpen(true)} />
        <h1 className="text-base font-semibold">Proyectos</h1>
        <div className="size-9" aria-hidden="true" />
      </div>

      <aside className="hidden w-72 shrink-0 flex-col gap-4 border-r border-sidebar-border bg-sidebar p-4 text-sidebar-foreground lg:flex">
        <ProjectsSidebarContent onNavigate={() => {}} />
      </aside>

      <Sheet open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
        <SheetContent aria-label="Navegación de proyectos" className="gap-4">
          <ProjectsSidebarContent onNavigate={() => setIsMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
