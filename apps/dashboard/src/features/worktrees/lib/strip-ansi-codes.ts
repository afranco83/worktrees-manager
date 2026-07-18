// Muchos `devCommand` reales (turbo, next, storybook...) colorean su output
// para una terminal real con secuencias de escape ANSI (CSI): sin limpiarlas,
// el visor de logs y la vista previa en la card muestran los códigos crudos
// en vez de texto legible.
// eslint-disable-next-line no-control-regex -- el propio carácter de escape (0x1B) es lo que se busca eliminar, no un control character accidental.
const ANSI_ESCAPE_PATTERN = /\x1b\[[0-9;?]*[a-zA-Z]/g;

export function stripAnsiCodes(content: string): string {
  return content.replace(ANSI_ESCAPE_PATTERN, "");
}
