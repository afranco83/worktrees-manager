import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { Project } from "../schemas";
import { deleteProject } from "./projects-api";
import { PROJECTS_QUERY_KEY } from "./use-projects";

export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteProject,
    onSuccess: (_data, deletedId) => {
      // Actualización síncrona de la caché (no invalidateQueries + refetch):
      // quien navega fuera de la página del proyecto borrado justo después del
      // éxito (ProjectDetailPage → "/") necesita que la lista ya no lo incluya
      // en ese mismo tick, o ProjectsIndexRoute puede leer la lista todavía
      // obsoleta y redirigir de vuelta al proyecto recién borrado.
      queryClient.setQueryData<Project[]>(
        PROJECTS_QUERY_KEY,
        (projects) => projects?.filter((project) => project.id !== deletedId) ?? projects,
      );
    },
  });
}
