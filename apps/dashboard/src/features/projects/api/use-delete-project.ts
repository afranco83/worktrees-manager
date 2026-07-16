import { useMutation, useQueryClient } from "@tanstack/react-query";

import { deleteProject } from "./projects-api";
import { PROJECTS_QUERY_KEY } from "./use-projects";

export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
    },
  });
}
