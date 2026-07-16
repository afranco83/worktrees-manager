import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";

import { useDirectoryListing } from "../api/use-directory-listing";

export function DirectoryBrowser({
  path,
  onNavigate,
  onSelect,
  onCancel,
}: {
  path?: string;
  onNavigate: (path: string) => void;
  onSelect: (path: string) => void;
  onCancel: () => void;
}) {
  const { data, isLoading, isError, error } = useDirectoryListing({ path, enabled: true });
  const parentPath = data?.parentPath ?? null;

  return (
    <>
      <div className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-lg border p-2">
        {isLoading && <p className="p-2 text-sm text-muted-foreground">Cargando…</p>}
        {isError && (
          <p className="p-2 text-sm text-destructive" role="alert">
            {error.message}
          </p>
        )}
        {parentPath != null && (
          <Button variant="ghost" className="justify-start" onClick={() => onNavigate(parentPath)}>
            .. (subir un nivel)
          </Button>
        )}
        {data?.directories.map((directory) => (
          <Button
            key={directory.path}
            variant="ghost"
            className="justify-start"
            onClick={() => onNavigate(directory.path)}
          >
            {directory.name}
          </Button>
        ))}
        {data && data.directories.length === 0 && (
          <p className="p-2 text-sm text-muted-foreground">Sin subcarpetas.</p>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="button" disabled={data == null} onClick={() => data && onSelect(data.path)}>
          Seleccionar esta carpeta
        </Button>
      </DialogFooter>
    </>
  );
}
