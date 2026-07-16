import { useQuery } from "@tanstack/react-query";

import { fetchProjects } from "./projects-api";

export const PROJECTS_QUERY_KEY = ["projects"];

export function useProjects() {
  return useQuery({ queryKey: PROJECTS_QUERY_KEY, queryFn: fetchProjects });
}
