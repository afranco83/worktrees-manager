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

import { useUpdateProject } from "../api/use-update-project";
import { updateProjectFormSchema, type Project, type UpdateProjectFormValues } from "../schemas";

export function EditProjectDialog({
  project,
  open,
  onOpenChange,
}: {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const updateProject = useUpdateProject();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpdateProjectFormValues>({
    resolver: standardSchemaResolver(updateProjectFormSchema),
    defaultValues: {
      name: project.name,
      devCommand: project.devCommand,
      postCreateCommand: project.postCreateCommand ?? "",
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: project.name,
        devCommand: project.devCommand,
        postCreateCommand: project.postCreateCommand ?? "",
      });
    }
  }, [open, project, reset]);

  async function onSubmit(values: UpdateProjectFormValues): Promise<void> {
    try {
      await updateProject.mutateAsync({ id: project.id, patch: values });
    } catch {
      return;
    }

    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar proyecto</DialogTitle>
          <DialogDescription>{project.localPath}</DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
          <div className="grid gap-1.5">
            <Label htmlFor="edit-name">Nombre</Label>
            <Input
              id="edit-name"
              aria-invalid={errors.name != null}
              aria-describedby={errors.name ? "edit-name-error" : undefined}
              {...register("name")}
            />
            {errors.name && (
              <p id="edit-name-error" className="text-sm text-destructive">
                {errors.name.message}
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="edit-devCommand">Comando de arranque</Label>
            <Input
              id="edit-devCommand"
              aria-invalid={errors.devCommand != null}
              aria-describedby={
                errors.devCommand ? "edit-devCommand-error" : "edit-devCommand-hint"
              }
              {...register("devCommand")}
            />
            {errors.devCommand ? (
              <p id="edit-devCommand-error" className="text-sm text-destructive">
                {errors.devCommand.message}
              </p>
            ) : (
              <p id="edit-devCommand-hint" className="text-sm text-muted-foreground">
                El comando debe leer el puerto asignado de la variable de entorno <code>PORT</code>.
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="edit-postCreateCommand">Comando posterior a la creación</Label>
            <Input
              id="edit-postCreateCommand"
              placeholder="Opcional, p. ej. pnpm db:migrate"
              aria-describedby="edit-postCreateCommand-hint"
              {...register("postCreateCommand")}
            />
            <p id="edit-postCreateCommand-hint" className="text-sm text-muted-foreground">
              Opcional. Se ejecuta una sola vez, automáticamente, justo tras crear cada worktree de
              este proyecto (p. ej. migrar o poblar una base de datos local). Se guarda en{" "}
              <code>.worktrees-manager.json</code>: comitéalo para que el resto del equipo lo herede
              automáticamente.
            </p>
          </div>

          {updateProject.isError && (
            <p className="text-sm text-destructive" role="alert">
              {updateProject.error.message}
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
