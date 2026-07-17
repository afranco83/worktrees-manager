import { useQuery } from "@tanstack/react-query";

import { fetchTerminalPresets } from "./settings-api";

export function useTerminalPresets() {
  return useQuery({ queryKey: ["terminal-presets"], queryFn: fetchTerminalPresets });
}
