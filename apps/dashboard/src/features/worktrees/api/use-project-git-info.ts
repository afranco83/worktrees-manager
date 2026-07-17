import { useQuery } from "@tanstack/react-query";

import { fetchProjectGitInfo } from "./worktrees-api";

export function useProjectGitInfo(projectId: string) {
  return useQuery({
    queryKey: ["project-git-info", projectId],
    queryFn: () => fetchProjectGitInfo(projectId),
  });
}
