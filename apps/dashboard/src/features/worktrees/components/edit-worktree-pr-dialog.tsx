import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useEffect, useRef } from "react";
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

import { useUpdateWorktreePrNumber } from "../api/use-update-worktree-pr-number";
import {
  updateWorktreePrNumberFormSchema,
  type UpdateWorktreePrNumberFormValues,
  type Worktree,
} from "../schemas";

export function EditWorktreePrDialog({
  worktree,
  open,
  onOpenChange,
}: {
  worktree: Worktree;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const updatePrNumber = useUpdateWorktreePrNumber();

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<UpdateWorktreePrNumberFormValues>({
    resolver: standardSchemaResolver(updateWorktreePrNumberFormSchema),
    defaultValues: { prNumber: worktree.prNumber?.toString() ?? "" },
  });

  // `worktree` cambia de referencia en cada refetch de `useWorktrees` (poll
  // de 5s), incluso cuando `prNumber` no ha cambiado — si el efecto se
  // disparara en cada cambio de `worktree`, reiniciaría el formulario en
  // cada poll mientras el diálogo está abierto, borrando lo que el usuario
  // esté escribiendo. Solo se reinicia en la transición cerrado→abierto.
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      reset({ prNumber: worktree.prNumber?.toString() ?? "" });
    }
    wasOpenRef.current = open;
  }, [open, worktree, reset]);

  async function onSubmit(values: UpdateWorktreePrNumberFormValues): Promise<void> {
    try {
      await updatePrNumber.mutateAsync({
        id: worktree.id,
        prNumber: values.prNumber.trim() === "" ? null : Number(values.prNumber),
      });
    } catch {
      return;
    }

    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>PR asociada a {worktree.branch}</DialogTitle>
          <DialogDescription>
            Vacío = se detecta automáticamente por el nombre de la rama. Indica un número solo si la
            detección automática no encuentra la PR correcta.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
          <div className="grid gap-1.5">
            <Label htmlFor="edit-worktree-prNumber">Número de PR</Label>
            <Input
              id="edit-worktree-prNumber"
              inputMode="numeric"
              placeholder="Vacío = detección automática por rama"
              aria-invalid={errors.prNumber != null}
              aria-describedby={
                errors.prNumber != null ? "edit-worktree-prNumber-error" : undefined
              }
              {...register("prNumber")}
            />
            {errors.prNumber != null && (
              <p
                id="edit-worktree-prNumber-error"
                className="text-sm text-destructive"
                role="alert"
              >
                {errors.prNumber.message}
              </p>
            )}
          </div>

          {updatePrNumber.isError && (
            <p className="text-sm text-destructive" role="alert">
              {updatePrNumber.error.message}
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
