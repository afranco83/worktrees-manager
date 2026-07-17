import { useQuery } from "@tanstack/react-query";

import { fetchSettings } from "./settings-api";

export const SETTINGS_QUERY_KEY = ["settings"];

export function useSettings() {
  return useQuery({ queryKey: SETTINGS_QUERY_KEY, queryFn: fetchSettings });
}
