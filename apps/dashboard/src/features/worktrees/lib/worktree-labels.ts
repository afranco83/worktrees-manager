import type { ComponentProps } from "react";

import type { Badge } from "@/components/ui/badge";

import type { PullRequestState, WorktreeProcessStep } from "../schemas";

export const PROCESS_STEP_LABELS: Record<WorktreeProcessStep, string> = {
  "installing-dependencies": "Instalando dependencias…",
  "starting-dev-command": "Arrancando comando de dev…",
};

export const PULL_REQUEST_STATE_LABELS: Record<PullRequestState, string> = {
  open: "Abierta",
  closed: "Cerrada",
  merged: "Mergeada",
};

export const PULL_REQUEST_STATE_BADGE_VARIANTS: Record<
  PullRequestState,
  ComponentProps<typeof Badge>["variant"]
> = {
  open: "default",
  closed: "destructive",
  merged: "secondary",
};
