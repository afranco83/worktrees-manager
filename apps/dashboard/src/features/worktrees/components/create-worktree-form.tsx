import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useCreateWorktree } from "../api/use-create-worktree";
import { useProjectGitInfo } from "../api/use-project-git-info";
import { createWorktreeFormSchema, type ProjectGitInfo, type WorktreeBase } from "../schemas";

const DEFAULT_BASE_OPTION = "__default__";
const CURRENT_BASE_OPTION = "__current__";

// `baseOption` es un string plano (no el discriminated union WorktreeBase de
// createWorktreeFormSchema) porque el <Select> de shadcn solo admite un único
// valor string — decodeBaseOption lo traduce de vuelta antes de enviarlo.
// `newBranch` sí reutiliza la validación del schema de dominio.
const createWorktreeFormLocalSchema = z.object({
  newBranch: createWorktreeFormSchema.shape.newBranch,
  baseOption: z.string().min(1, "Elige la rama base"),
});

type CreateWorktreeFormLocalValues = z.infer<typeof createWorktreeFormLocalSchema>;

function decodeBaseOption(baseOption: string): WorktreeBase {
  if (baseOption === DEFAULT_BASE_OPTION) {
    return { type: "default" };
  }

  if (baseOption === CURRENT_BASE_OPTION) {
    return { type: "current" };
  }

  return { type: "branch", branch: baseOption };
}

function baseOptionLabel(value: string | null, gitInfo: ProjectGitInfo): string {
  if (value === DEFAULT_BASE_OPTION) {
    return gitInfo.defaultBranch != null
      ? `Rama por defecto (${gitInfo.defaultBranch})`
      : "Rama por defecto";
  }

  if (value === CURRENT_BASE_OPTION) {
    return gitInfo.currentBranch != null ? `Rama actual (${gitInfo.currentBranch})` : "Rama actual";
  }

  return value ?? "";
}

function firstSelectableOption(gitInfo: ProjectGitInfo): string {
  if (gitInfo.defaultBranch != null) {
    return DEFAULT_BASE_OPTION;
  }

  if (gitInfo.currentBranch != null) {
    return CURRENT_BASE_OPTION;
  }

  return gitInfo.branches[0] ?? "";
}

export function CreateWorktreeForm({
  projectId,
  onCreated,
}: {
  projectId: string;
  onCreated: () => void;
}) {
  const gitInfo = useProjectGitInfo(projectId);
  const createWorktree = useCreateWorktree(projectId);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CreateWorktreeFormLocalValues>({
    resolver: standardSchemaResolver(createWorktreeFormLocalSchema),
    defaultValues: { newBranch: "", baseOption: "" },
  });

  const baseOption = useWatch({ control, name: "baseOption" });

  useEffect(() => {
    if (gitInfo.data && baseOption === "") {
      setValue("baseOption", firstSelectableOption(gitInfo.data));
    }
  }, [gitInfo.data, baseOption, setValue]);

  if (gitInfo.isLoading) {
    return <p className="text-sm text-muted-foreground">Cargando información del repositorio…</p>;
  }

  if (gitInfo.isError || !gitInfo.data) {
    return (
      <p className="text-sm text-destructive" role="alert">
        No se ha podido cargar la información git del proyecto.
      </p>
    );
  }

  const gitInfoData = gitInfo.data;

  async function onSubmit(values: CreateWorktreeFormLocalValues): Promise<void> {
    try {
      await createWorktree.mutateAsync({
        newBranch: values.newBranch,
        base: decodeBaseOption(values.baseOption),
      });
    } catch {
      return;
    }

    onCreated();
  }

  return (
    <form className="grid gap-4" onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
      <div className="grid gap-1.5">
        <Label htmlFor="newBranch">Nueva rama</Label>
        <Input
          id="newBranch"
          placeholder="feature/mi-cambio"
          aria-invalid={errors.newBranch != null}
          aria-describedby={errors.newBranch ? "newBranch-error" : undefined}
          {...register("newBranch")}
        />
        {errors.newBranch && (
          <p id="newBranch-error" className="text-sm text-destructive">
            {errors.newBranch.message}
          </p>
        )}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="baseOption">Partir de</Label>
        <Select value={baseOption} onValueChange={(value) => setValue("baseOption", value ?? "")}>
          <SelectTrigger id="baseOption" className="w-full">
            <SelectValue placeholder="Elige una rama base">
              {(value: string | null) => baseOptionLabel(value, gitInfoData)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT_BASE_OPTION} disabled={gitInfoData.defaultBranch == null}>
              Rama por defecto
              {gitInfoData.defaultBranch != null ? ` (${gitInfoData.defaultBranch})` : ""}
            </SelectItem>
            <SelectItem value={CURRENT_BASE_OPTION} disabled={gitInfoData.currentBranch == null}>
              Rama actual
              {gitInfoData.currentBranch != null ? ` (${gitInfoData.currentBranch})` : ""}
            </SelectItem>
            {gitInfoData.branches.map((branch) => (
              <SelectItem key={branch} value={branch}>
                {branch}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.baseOption && (
          <p className="text-sm text-destructive">{errors.baseOption.message}</p>
        )}
      </div>

      {createWorktree.isError && (
        <p className="text-sm text-destructive" role="alert">
          {createWorktree.error.message}
        </p>
      )}

      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          Crear worktree
        </Button>
      </DialogFooter>
    </form>
  );
}
