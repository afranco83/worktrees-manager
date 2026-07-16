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
import {
  updateProjectFormSchema,
  type Project,
  type UpdateProjectFormInput,
  type UpdateProjectFormValues,
} from "../schemas";

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
  } = useForm<UpdateProjectFormInput, unknown, UpdateProjectFormValues>({
    resolver: standardSchemaResolver(updateProjectFormSchema),
    defaultValues: {
      name: project.name,
      devCommand: project.devCommand,
      portRangeStart: project.portRangeStart,
      portRangeEnd: project.portRangeEnd,
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: project.name,
        devCommand: project.devCommand,
        portRangeStart: project.portRangeStart,
        portRangeEnd: project.portRangeEnd,
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
              aria-describedby={errors.devCommand ? "edit-devCommand-error" : undefined}
              {...register("devCommand")}
            />
            {errors.devCommand && (
              <p id="edit-devCommand-error" className="text-sm text-destructive">
                {errors.devCommand.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="edit-portRangeStart">Puerto inicial</Label>
              <Input
                id="edit-portRangeStart"
                type="number"
                aria-invalid={errors.portRangeStart != null}
                aria-describedby={errors.portRangeStart ? "edit-portRangeStart-error" : undefined}
                {...register("portRangeStart")}
              />
              {errors.portRangeStart && (
                <p id="edit-portRangeStart-error" className="text-sm text-destructive">
                  {errors.portRangeStart.message}
                </p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="edit-portRangeEnd">Puerto final</Label>
              <Input
                id="edit-portRangeEnd"
                type="number"
                aria-invalid={errors.portRangeEnd != null}
                aria-describedby={errors.portRangeEnd ? "edit-portRangeEnd-error" : undefined}
                {...register("portRangeEnd")}
              />
              {errors.portRangeEnd && (
                <p id="edit-portRangeEnd-error" className="text-sm text-destructive">
                  {errors.portRangeEnd.message}
                </p>
              )}
            </div>
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
