import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
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

import { useCreateProject } from "../api/use-create-project";
import { useProjectPathLookup } from "../api/use-project-path-lookup";
import {
  createProjectFormSchema,
  type CreateProjectFormInput,
  type CreateProjectFormValues,
} from "../schemas";

function basenameOf(localPath: string): string {
  return (
    localPath
      .split("/")
      .filter((segment) => segment.length > 0)
      .at(-1) ?? localPath
  );
}

export function CreateProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createProject = useCreateProject();
  const pathLookup = useProjectPathLookup();

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateProjectFormInput, unknown, CreateProjectFormValues>({
    resolver: standardSchemaResolver(createProjectFormSchema),
    defaultValues: {
      localPath: "",
      name: "",
      devCommand: "",
      portRangeStart: 3000,
      portRangeEnd: 3099,
    },
  });

  async function handleLocalPathBlur(event: React.FocusEvent<HTMLInputElement>): Promise<void> {
    const localPath = event.target.value.trim();

    if (localPath === "") {
      return;
    }

    if (getValues("name") === "") {
      setValue("name", basenameOf(localPath));
    }

    const lookup = await pathLookup.mutateAsync(localPath);

    if (lookup.configFile) {
      setValue("devCommand", lookup.configFile.devCommand);
      setValue("portRangeStart", lookup.configFile.portRangeStart);
      setValue("portRangeEnd", lookup.configFile.portRangeEnd);
    }
  }

  async function onSubmit(values: CreateProjectFormValues): Promise<void> {
    try {
      await createProject.mutateAsync(values);
    } catch {
      return;
    }

    reset();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          reset();
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Añadir proyecto</DialogTitle>
          <DialogDescription>
            Indica la ruta local del repositorio. Si ya tiene un{" "}
            <code>.worktrees-manager.json</code>, se autorellenará el comando de arranque y el rango
            de puertos.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
          <div className="grid gap-1.5">
            <Label htmlFor="localPath">Ruta local</Label>
            <Input
              id="localPath"
              placeholder="/Users/tú/proyectos/mi-repo"
              aria-invalid={errors.localPath != null}
              aria-describedby={errors.localPath ? "localPath-error" : undefined}
              {...register("localPath", {
                onBlur: (event: React.FocusEvent<HTMLInputElement>) =>
                  void handleLocalPathBlur(event),
              })}
            />
            {errors.localPath && (
              <p id="localPath-error" className="text-sm text-destructive">
                {errors.localPath.message}
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="name">Nombre</Label>
            <Input
              id="name"
              aria-invalid={errors.name != null}
              aria-describedby={errors.name ? "name-error" : undefined}
              {...register("name")}
            />
            {errors.name && (
              <p id="name-error" className="text-sm text-destructive">
                {errors.name.message}
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="devCommand">Comando de arranque</Label>
            <Input
              id="devCommand"
              placeholder="pnpm dev"
              aria-invalid={errors.devCommand != null}
              aria-describedby={errors.devCommand ? "devCommand-error" : undefined}
              {...register("devCommand")}
            />
            {errors.devCommand && (
              <p id="devCommand-error" className="text-sm text-destructive">
                {errors.devCommand.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="portRangeStart">Puerto inicial</Label>
              <Input
                id="portRangeStart"
                type="number"
                aria-invalid={errors.portRangeStart != null}
                {...register("portRangeStart")}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="portRangeEnd">Puerto final</Label>
              <Input
                id="portRangeEnd"
                type="number"
                aria-invalid={errors.portRangeEnd != null}
                aria-describedby={errors.portRangeEnd ? "portRangeEnd-error" : undefined}
                {...register("portRangeEnd")}
              />
              {errors.portRangeEnd && (
                <p id="portRangeEnd-error" className="text-sm text-destructive">
                  {errors.portRangeEnd.message}
                </p>
              )}
            </div>
          </div>

          {createProject.isError && (
            <p className="text-sm text-destructive" role="alert">
              {createProject.error.message}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              Añadir proyecto
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
