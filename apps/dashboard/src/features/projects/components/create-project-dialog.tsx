import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";

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
import { DirectoryBrowser } from "@/features/filesystem/components/directory-browser";

import { useCreateProject } from "../api/use-create-project";
import { useProjectPathLookup } from "../api/use-project-path-lookup";
import {
  createProjectFormSchema,
  type CreateProjectFormValues,
  type ProjectPathLookup,
} from "../schemas";

function basenameOf(localPath: string): string {
  return (
    localPath
      .split("/")
      .filter((segment) => segment.length > 0)
      .at(-1) ?? localPath
  );
}

type DialogStep = "form" | "browse";

type PathIssue = "not-git-repo" | "no-commits" | "not-writable" | "lookup-failed";

const PATH_ISSUE_MESSAGES: Record<PathIssue, string> = {
  "not-git-repo":
    "Esta carpeta no es un repositorio git. Ejecuta git init en ella o elige la carpeta raíz de tu repo.",
  "no-commits":
    "Este repositorio no tiene ningún commit. Los worktrees necesitan al menos una rama con historial: haz un primer commit y vuelve a intentarlo.",
  "not-writable":
    "No tienes permisos de escritura sobre esta carpeta. Git necesita poder crear ahí los metadatos del worktree.",
  "lookup-failed": "No se ha podido comprobar la ruta. Vuelve a intentarlo.",
};

function classifyPathIssue(lookup: ProjectPathLookup): PathIssue | null {
  if (!lookup.exists || !lookup.isGitRepo) {
    return "not-git-repo";
  }

  if (!lookup.hasCommits) {
    return "no-commits";
  }

  if (!lookup.isWritable) {
    return "not-writable";
  }

  return null;
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
  const [step, setStep] = useState<DialogStep>("form");
  const [browsePath, setBrowsePath] = useState<string | undefined>(undefined);
  const [pathValidation, setPathValidation] = useState<{
    path: string;
    issue: PathIssue | null;
  } | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateProjectFormValues>({
    resolver: standardSchemaResolver(createProjectFormSchema),
    defaultValues: { localPath: "", name: "", devCommand: "", postCreateCommand: "" },
  });

  const watchedLocalPath = useWatch({ control, name: "localPath" });
  const currentPathIssue =
    pathValidation != null && pathValidation.path === watchedLocalPath
      ? pathValidation.issue
      : undefined;
  const isPathConfirmed = currentPathIssue === null;

  async function applyLocalPath(localPath: string): Promise<void> {
    if (localPath === "") {
      setPathValidation(null);
      return;
    }

    setValue("localPath", localPath);

    if (getValues("name") === "") {
      setValue("name", basenameOf(localPath));
    }

    let lookup: ProjectPathLookup;

    try {
      lookup = await pathLookup.mutateAsync(localPath);
    } catch {
      setPathValidation({ path: localPath, issue: "lookup-failed" });
      return;
    }

    setPathValidation({ path: localPath, issue: classifyPathIssue(lookup) });

    if (lookup.configFile) {
      setValue("devCommand", lookup.configFile.devCommand);
      setValue("postCreateCommand", lookup.configFile.postCreateCommand ?? "");
    }
  }

  async function handleLocalPathBlur(event: React.FocusEvent<HTMLInputElement>): Promise<void> {
    await applyLocalPath(event.target.value.trim());
  }

  function handleOpenExplorer(): void {
    setBrowsePath(getValues("localPath") || undefined);
    setStep("browse");
  }

  function handleBrowseSelect(path: string): void {
    void applyLocalPath(path);
    setStep("form");
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
          setStep("form");
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        {step === "form" ? (
          <>
            <DialogHeader>
              <DialogTitle>Añadir proyecto</DialogTitle>
              <DialogDescription>
                Indica la ruta local del repositorio. Si ya tiene un{" "}
                <code>.worktrees-manager.json</code>, se autorellenará el comando de arranque y el
                posterior a la creación.
              </DialogDescription>
            </DialogHeader>

            <form className="grid gap-4" onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
              <div className="grid gap-1.5">
                <Label htmlFor="localPath">Ruta local</Label>
                <div className="flex gap-2">
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
                  <Button type="button" variant="outline" onClick={handleOpenExplorer}>
                    Explorar…
                  </Button>
                </div>
                {errors.localPath && (
                  <p id="localPath-error" className="text-sm text-destructive">
                    {errors.localPath.message}
                  </p>
                )}
                {pathLookup.isPending && (
                  <p className="text-sm text-muted-foreground">Comprobando la ruta…</p>
                )}
                {currentPathIssue != null && (
                  <p className="text-sm text-destructive" role="alert">
                    {PATH_ISSUE_MESSAGES[currentPathIssue]}
                  </p>
                )}
              </div>

              <fieldset
                disabled={!isPathConfirmed}
                className="grid gap-4 disabled:pointer-events-none disabled:opacity-50"
              >
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
                    aria-describedby={errors.devCommand ? "devCommand-error" : "devCommand-hint"}
                    {...register("devCommand")}
                  />
                  {errors.devCommand ? (
                    <p id="devCommand-error" className="text-sm text-destructive">
                      {errors.devCommand.message}
                    </p>
                  ) : (
                    <p id="devCommand-hint" className="text-sm text-muted-foreground">
                      El comando debe leer el puerto asignado de la variable de entorno{" "}
                      <code>PORT</code>.
                    </p>
                  )}
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="postCreateCommand">Comando posterior a la creación</Label>
                  <Input
                    id="postCreateCommand"
                    placeholder="Opcional, p. ej. pnpm db:migrate"
                    aria-describedby="postCreateCommand-hint"
                    {...register("postCreateCommand")}
                  />
                  <p id="postCreateCommand-hint" className="text-sm text-muted-foreground">
                    Opcional. Se ejecuta una sola vez, automáticamente, justo tras crear cada
                    worktree de este proyecto (p. ej. migrar o poblar una base de datos local). Se
                    guarda en <code>.worktrees-manager.json</code>: comitéalo para que el resto del
                    equipo lo herede automáticamente.
                  </p>
                </div>
              </fieldset>

              {createProject.isError && (
                <p className="text-sm text-destructive" role="alert">
                  {createProject.error.message}
                </p>
              )}

              <DialogFooter>
                <Button type="submit" disabled={!isPathConfirmed || isSubmitting}>
                  Añadir proyecto
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Explorar carpetas</DialogTitle>
              <DialogDescription>Elige la carpeta del repositorio.</DialogDescription>
            </DialogHeader>

            <DirectoryBrowser
              path={browsePath}
              onNavigate={setBrowsePath}
              onSelect={handleBrowseSelect}
              onCancel={() => setStep("form")}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
