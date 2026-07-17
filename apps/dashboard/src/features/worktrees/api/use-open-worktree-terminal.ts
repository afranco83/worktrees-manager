import { useMutation } from "@tanstack/react-query";

import { openWorktreeTerminal } from "./worktrees-api";

export function useOpenWorktreeTerminal() {
  return useMutation({ mutationFn: openWorktreeTerminal });
}
