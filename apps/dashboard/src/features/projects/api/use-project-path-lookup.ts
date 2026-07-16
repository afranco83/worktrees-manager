import { useMutation } from "@tanstack/react-query";

import { fetchProjectPathLookup } from "./projects-api";

export function useProjectPathLookup() {
  return useMutation({ mutationFn: fetchProjectPathLookup });
}
