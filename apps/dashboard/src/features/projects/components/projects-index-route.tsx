import { Navigate } from "react-router";

import { useProjects } from "../api/use-projects";

export function ProjectsIndexRoute() {
  const { data: projects, isLoading } = useProjects();

  if (isLoading) {
    return null;
  }

  if (projects && projects.length > 0) {
    return <Navigate to={`/projects/${projects[0].id}`} replace />;
  }

  return (
    <div className="flex h-full items-center justify-center p-6">
      <p className="text-sm text-muted-foreground">
        Selecciona un proyecto o añade uno nuevo para empezar.
      </p>
    </div>
  );
}
