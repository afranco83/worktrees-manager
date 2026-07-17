import { Navigate } from "react-router";

import { useProjects } from "../api/use-projects";

export function ProjectsIndexRoute() {
  const { data: projects, isLoading, isError, error } = useProjects();

  if (isLoading) {
    return null;
  }

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-destructive" role="alert">
          {error.message}
        </p>
      </div>
    );
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
