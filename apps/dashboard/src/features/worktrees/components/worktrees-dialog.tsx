import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Project } from "@/features/projects/schemas";

import { useWorktrees } from "../api/use-worktrees";
import type { Worktree } from "../schemas";
import { CreateWorktreeForm } from "./create-worktree-form";
import { DeleteWorktreeStep } from "./delete-worktree-step";
import { WorktreesTable } from "./worktrees-table";

type Step = "list" | "create" | { type: "delete"; worktree: Worktree };

export function WorktreesDialog({
  project,
  open,
  onOpenChange,
}: {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [step, setStep] = useState<Step>("list");
  const { data: worktrees, isLoading, isError, error } = useWorktrees(project.id);

  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen) {
      setStep("list");
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        {step === "create" && (
          <>
            <DialogHeader>
              <DialogTitle>Crear worktree</DialogTitle>
              <DialogDescription>
                Se creará una rama nueva y un directorio de worktree para {project.name}.
              </DialogDescription>
            </DialogHeader>
            <CreateWorktreeForm projectId={project.id} onCreated={() => setStep("list")} />
          </>
        )}

        {typeof step === "object" && step.type === "delete" && (
          <DeleteWorktreeStep
            projectId={project.id}
            worktree={step.worktree}
            onCancel={() => setStep("list")}
            onDeleted={() => setStep("list")}
          />
        )}

        {step === "list" && (
          <>
            <DialogHeader>
              <DialogTitle>Worktrees: {project.name}</DialogTitle>
              <DialogDescription>{project.localPath}</DialogDescription>
            </DialogHeader>

            {isLoading && <p className="text-sm text-muted-foreground">Cargando worktrees…</p>}
            {isError && (
              <p className="text-sm text-destructive" role="alert">
                {error.message}
              </p>
            )}
            {worktrees && (
              <WorktreesTable
                worktrees={worktrees}
                onDelete={(worktree) => setStep({ type: "delete", worktree })}
              />
            )}

            <Button className="self-start" onClick={() => setStep("create")}>
              + Crear worktree
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
