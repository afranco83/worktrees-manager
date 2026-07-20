import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useEffect } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useUpdateWorktree } from "../api/use-update-worktree";
import { updateWorktreeFormSchema, type UpdateWorktreeFormValues, type Worktree } from "../schemas";

export function EditWorktreeDevCommandDialog({
  worktree,
  open,
  onOpenChange,
}: {
  worktree: Worktree;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const updateWorktree = useUpdateWorktree();

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<UpdateWorktreeFormValues>({
    resolver: standardSchemaResolver(updateWorktreeFormSchema),
    defaultValues: { devCommandOverride: worktree.devCommandOverride ?? "" },
  });

  useEffect(() => {
    if (open) {
      reset({ devCommandOverride: worktree.devCommandOverride ?? "" });
    }
  }, [open, worktree, reset]);

  async function onSubmit(values: UpdateWorktreeFormValues): Promise<void> {
    try {
      await updateWorktree.mutateAsync({ id: worktree.id, ...values });
    } catch {
      return;
    }

    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Comando de arranque para {worktree.branch}</DialogTitle>
          <DialogDescription>
            Sobrescribe el comando del proyecto solo para este worktree.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
          <div className="grid gap-1.5">
            <Label htmlFor="edit-worktree-devCommandOverride">Comando de arranque</Label>
            <Input
              id="edit-worktree-devCommandOverride"
              placeholder="Vacío = usa el comando del proyecto"
              aria-describedby="edit-worktree-devCommandOverride-hint"
              {...register("devCommandOverride")}
            />
            <p id="edit-worktree-devCommandOverride-hint" className="text-sm text-muted-foreground">
              Vacío = usa el comando del proyecto. En un monorepo puedes restringir qué apps
              arrancan con las flags de tu propia herramienta (p. ej.{" "}
              <code>--filter=&lt;paquete&gt;</code>, repetible en turbo).
            </p>
          </div>

          {updateWorktree.isError && (
            <p className="text-sm text-destructive" role="alert">
              {updateWorktree.error.message}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              Guardar cambios
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
