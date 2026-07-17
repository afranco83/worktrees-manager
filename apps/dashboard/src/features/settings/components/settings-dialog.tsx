import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useTerminalPresets } from "../api/use-terminal-presets";
import { useSettings } from "../api/use-settings";
import { useUpdateSettings } from "../api/use-update-settings";
import type { TerminalOption } from "../schemas";

// Mismo patrón de sentinel-strings que `create-worktree-form.tsx` (`baseOption`
// / `decodeBaseOption` / `baseOptionLabel`): el <Select> de shadcn solo admite
// un valor string plano, así que el comando preferido (string | null, más el
// caso "personalizado") se codifica como uno de estos sentinels y se decodifica
// en el submit. Segunda aparición de esta forma en el código — si aparece una
// tercera, es el momento de extraer un helper común (AHA, no antes).
const AUTOMATIC_OPTION = "__automatic__";
const CUSTOM_OPTION = "__custom__";
const PORT_RANGE_MESSAGE = "El puerto inicial debe ser menor que el puerto final";

const settingsFormLocalSchema = z
  .object({
    portRangeStart: z.coerce.number().int().positive(),
    portRangeEnd: z.coerce.number().int().positive(),
    terminalOption: z.string().min(1, "Elige una terminal"),
    customCommand: z.string(),
  })
  .refine((value) => value.portRangeStart < value.portRangeEnd, {
    message: PORT_RANGE_MESSAGE,
    path: ["portRangeEnd"],
  })
  .refine((value) => value.terminalOption !== CUSTOM_OPTION || value.customCommand.trim() !== "", {
    message: "Indica el comando personalizado",
    path: ["customCommand"],
  });

type SettingsFormLocalInput = z.input<typeof settingsFormLocalSchema>;
type SettingsFormLocalValues = z.output<typeof settingsFormLocalSchema>;

function terminalOptionLabel(value: string | null, presets: TerminalOption[]): string {
  if (value === AUTOMATIC_OPTION) {
    return "Automático (por defecto del sistema)";
  }

  if (value === CUSTOM_OPTION) {
    return "Personalizado…";
  }

  return presets.find((preset) => preset.command === value)?.name ?? value ?? "";
}

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const settingsQuery = useSettings();
  const presetsQuery = useTerminalPresets();
  const updateSettings = useUpdateSettings();

  const {
    register,
    handleSubmit,
    setValue,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SettingsFormLocalInput, unknown, SettingsFormLocalValues>({
    resolver: standardSchemaResolver(settingsFormLocalSchema),
    defaultValues: {
      portRangeStart: 3000,
      portRangeEnd: 3999,
      terminalOption: "",
      customCommand: "",
    },
  });

  const terminalOption = useWatch({ control, name: "terminalOption" });

  // Se resincroniza cada vez que el diálogo se abre (mismo patrón que
  // EditProjectDialog), no solo la primera vez: el diálogo nunca se desmonta
  // (el padre solo alterna `open`), así que sin esto un borrador sin guardar
  // quedaría mostrado como si fuera el valor persistido la próxima vez que se
  // abra.
  useEffect(() => {
    if (open && settingsQuery.data && presetsQuery.data) {
      const { preferredTerminalCommand, portRangeStart, portRangeEnd } = settingsQuery.data;

      if (preferredTerminalCommand == null) {
        reset({
          portRangeStart,
          portRangeEnd,
          terminalOption: AUTOMATIC_OPTION,
          customCommand: "",
        });
      } else if (
        presetsQuery.data.presets.some((preset) => preset.command === preferredTerminalCommand)
      ) {
        reset({
          portRangeStart,
          portRangeEnd,
          terminalOption: preferredTerminalCommand,
          customCommand: "",
        });
      } else {
        reset({
          portRangeStart,
          portRangeEnd,
          terminalOption: CUSTOM_OPTION,
          customCommand: preferredTerminalCommand,
        });
      }
    }
  }, [open, settingsQuery.data, presetsQuery.data, reset]);

  if (settingsQuery.isLoading || presetsQuery.isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <p className="text-sm text-muted-foreground">Cargando ajustes…</p>
        </DialogContent>
      </Dialog>
    );
  }

  if (settingsQuery.isError || presetsQuery.isError || !settingsQuery.data || !presetsQuery.data) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <p className="text-sm text-destructive" role="alert">
            No se han podido cargar los ajustes.
          </p>
        </DialogContent>
      </Dialog>
    );
  }

  const presets = presetsQuery.data.presets;

  async function onSubmit(values: SettingsFormLocalValues): Promise<void> {
    const preferredTerminalCommand =
      values.terminalOption === AUTOMATIC_OPTION
        ? null
        : values.terminalOption === CUSTOM_OPTION
          ? values.customCommand.trim()
          : values.terminalOption;

    try {
      await updateSettings.mutateAsync({
        preferredTerminalCommand,
        portRangeStart: values.portRangeStart,
        portRangeEnd: values.portRangeEnd,
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
          <DialogTitle>Ajustes</DialogTitle>
          <DialogDescription>Preferencias globales de la aplicación.</DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
          <div className="grid gap-1.5">
            <Label htmlFor="terminalOption">Terminal preferida</Label>
            <Select
              value={terminalOption}
              onValueChange={(value) => setValue("terminalOption", value ?? "")}
            >
              <SelectTrigger id="terminalOption" className="w-full">
                <SelectValue placeholder="Elige una terminal">
                  {(value: string | null) => terminalOptionLabel(value, presets)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTOMATIC_OPTION}>
                  Automático (por defecto del sistema)
                </SelectItem>
                {presets.map((preset) => (
                  <SelectItem key={preset.command} value={preset.command}>
                    {preset.name}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM_OPTION}>Personalizado…</SelectItem>
              </SelectContent>
            </Select>
            {errors.terminalOption && (
              <p className="text-sm text-destructive">{errors.terminalOption.message}</p>
            )}
          </div>

          {terminalOption === CUSTOM_OPTION && (
            <div className="grid gap-1.5">
              <Label htmlFor="customCommand">Comando personalizado</Label>
              <Input
                id="customCommand"
                placeholder="open -a MiTerminal {path}"
                aria-invalid={errors.customCommand != null}
                aria-describedby={errors.customCommand ? "customCommand-error" : undefined}
                {...register("customCommand")}
              />
              {errors.customCommand && (
                <p id="customCommand-error" className="text-sm text-destructive">
                  {errors.customCommand.message}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="portRangeStart">Puerto inicial</Label>
              <Input
                id="portRangeStart"
                type="number"
                aria-invalid={errors.portRangeStart != null}
                aria-describedby={errors.portRangeStart ? "portRangeStart-error" : undefined}
                {...register("portRangeStart")}
              />
              {errors.portRangeStart && (
                <p id="portRangeStart-error" className="text-sm text-destructive">
                  {errors.portRangeStart.message}
                </p>
              )}
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

          {updateSettings.isError && (
            <p className="text-sm text-destructive" role="alert">
              {updateSettings.error.message}
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
