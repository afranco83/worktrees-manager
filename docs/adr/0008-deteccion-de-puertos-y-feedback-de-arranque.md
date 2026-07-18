# 0008. Detección de puertos reales y feedback de progreso al arrancar un entorno

- **Estado**: Aceptada
- **Fecha**: 2026-07-18

## Contexto

Tras cerrar la Fase 5 (ADR-0007), verificación manual con un proyecto real (`store_demo`, un monorepo `turbo` con varias apps Next.js/Storybook) sacó a la luz dos huecos:

1. **Puerto mostrado incorrecto en monorepos**: la card de un worktree muestra el único `port` asignado (la variable de entorno `PORT` que se pasa al `devCommand`). En un repositorio con una sola app, ese es el puerto real. En un monorepo con varias apps (`turbo run dev` arrancando varios servidores Next.js/Storybook a la vez), solo una de esas apps atiende realmente a `PORT`; el resto arranca en los puertos que cada framework decide por su cuenta (con fallback automático si el suyo está ocupado). La card mostraba información falsa para ese caso.
2. **Falta de feedback durante el arranque**: con instalación automática de dependencias (añadida tras el bug de `store_demo` sin `node_modules`), el estado "Arrancando…" podía cubrir tanto un `npm install` real (potencialmente varios minutos) como el arranque del propio `devCommand`, sin distinguir ambos ante el usuario.

## Decisiones

### Detección de puertos: heurística de regex sobre el output, no escaneo de proceso a nivel de SO

Cada línea de log (tanto de la fase de instalación como del `devCommand` real) se escanea con un patrón de regex (`PORT_PATTERNS` en `process-manager.ts`) buscando `localhost:PUERTO`/`127.0.0.1:PUERTO`/`0.0.0.0:PUERTO` y `port PUERTO`. Los puertos detectados se acumulan en un `Set<number>` por proceso trackeado (`TrackedProcess.detectedPorts`), expuestos vía `ProcessManager.getDetectedPorts(worktreeId)` y emitidos por el evento de socket `detected-ports` solo cuando el set crece (evita ruido de eventos repetidos).

Alternativa descartada: escanear el árbol de procesos a nivel de SO (`lsof -i -P -a -p <pid> -sTCP:LISTEN` o equivalente) para obtener los puertos reales en escucha. Se prefirió la heurística de regex por simplicidad multiplataforma (Windows no tiene `lsof`, requeriría una rama de código por SO con parseo de `netstat`/`Get-NetTCPConnection` — mismo tipo de coste ya evitado en ADR-0005/0006 al elegir listas curadas sobre detección) y porque el ecosistema JS converge de forma consistente en imprimir "Local: http://localhost:PUERTO" al arrancar (Vite, Next.js, Storybook lo hacen todos). Límite aceptado: un `devCommand` que no imprima esa línea (server custom sin ese log) no se detecta — se sigue mostrando el `port` asignado como fallback, nunca "sin información".

### `detectedPorts` no se persiste: se calcula en caliente

Añadido a `worktreeSchema` (backend y frontend, réplica deliberada como el resto de tipos compartidos en v1) como campo siempre presente pero **nunca guardado en SQLite** — se recalcula desde el estado en memoria del `ProcessManager` en cada respuesta (`withDetectedPorts()` en `plugin.ts`) y se resetea solo al reiniciar el backend, igual que `processStatus`/`pid` ya hacían antes de esta fase. Correcto: es información derivada de un proceso que solo existe mientras el backend vive, no un hecho persistente del worktree.

### Feedback de sub-paso: evento nuevo, no una re-interpretación del estado existente

`processStatus: "starting"` ya existía y se mantiene igual; se añade un evento **adicional** `process-step` (`"installing-dependencies" | "starting-dev-command" | null`) en vez de expandir `WORKTREE_PROCESS_STATUSES` con más valores. Motivo: `processStatus` es la máquina de estados persistida y ya consumida por toda la lógica de arranque/parada (ADR-0007); el sub-paso es información transitoria puramente informativa para la UI, sin efecto en la lógica de negocio — mezclarlo en el mismo enum habría acoplado un detalle de presentación a un contrato que otras partes del sistema ya dependen de mantener estable.

### `log-entry` necesita `worktreeId` en el payload — bug real encontrado y corregido

Al implementar la vista previa de la última línea de log en la card (para dar más contexto durante el arranque sin abrir el diálogo de logs), se detectó que el payload del evento de socket `log-entry` era el `LogEntry` a secas, sin `worktreeId`. Esto ya era un bug preexistente, no solo una limitación de la feature nueva: la lista de worktrees (`useWorktrees`) ya se unía a **todas** las salas de worktree a la vez (para trackear `process-status` de cada card), y un diálogo de logs abierto para un worktree concreto se une a **esa misma sala además** — un cliente puede estar en varias salas de worktree simultáneamente. Sin `worktreeId` en el payload, `use-worktree-logs.ts` no tenía forma de descartar una línea perteneciente a OTRO worktree si ambos estaban corriendo a la vez, así que un diálogo abierto podía mostrar líneas ajenas.

Corregido cambiando el payload a `{worktreeId, entry}` (`logEntryEventSchema`, réplica en ambos bordes) y añadiendo el filtro `result.data.worktreeId === worktreeId` en `use-worktree-logs.ts`. Test de regresión en `socket.test.ts` (verifica el `worktreeId` real en el payload recibido) y en `process-manager.test.ts` (verifica que todos los `log-entry` emitidos llevan el `worktreeId` del worktree que los generó).

## Alternativas consideradas

- **Escaneo de puertos a nivel de SO** (`lsof`/`netstat` sobre el árbol de PIDs): descartado por complejidad multiplataforma, ver arriba.
- **Expandir `processStatus` con sub-estados** (`"starting-installing"`, `"starting-devcommand"`): descartado — acopla un detalle de presentación transitorio a un enum que otras partes del sistema (lock, reconciliación de arranque) ya tratan como contrato estable.

## Consecuencias

- `Worktree.detectedPorts: number[]` es ahora un campo obligatorio del schema compartido; cualquier fixture/mock de test que construya un `Worktree` a mano necesita incluirlo (ya corregido en `apps/dashboard/src/test/msw/handlers.ts` y en los fixtures de test del backend).
- La card de un worktree en monorepo con varias apps muestra ahora "Puertos X, Y, Z" en vez de un único puerto potencialmente engañoso, en cuanto el `devCommand` los anuncia en su output.

---

Un ADR es atómico e inmutable: registra una decisión, no se edita después. Si la decisión cambia, se crea un ADR nuevo que la sustituye (`Superseded by`) y se actualiza el `Estado` de este a `Superseded by [ADR-NNNN]`, dejando el razonamiento original intacto y consultable.
