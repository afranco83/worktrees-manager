import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createProject } from "./projects-api";
import { PROJECTS_QUERY_KEY } from "./use-projects";

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
    },
  });
}
