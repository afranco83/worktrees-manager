import { useMutation, useQueryClient } from "@tanstack/react-query";

import { updateProject } from "./projects-api";
import { PROJECTS_QUERY_KEY } from "./use-projects";

export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateProject,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
    },
  });
}
