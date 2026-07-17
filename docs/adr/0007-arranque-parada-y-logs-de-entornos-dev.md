# 0007. Arranque/parada del entorno de dev de un worktree + logs en tiempo real

- **Estado**: Aceptada
- **Fecha**: 2026-07-17

## Contexto

Fase 5 del roadmap: arrancar/parar el comando de dev (`project.devCommand`) de cada worktree, con streaming de logs (stdout/stderr) en tiempo real y un estado visual parado/arrancando/corriendo/error. El terreno ya estaba parcialmente preparado desde fases anteriores pero sin usar: `worktrees.process_status`/`worktrees.pid` existían en el schema desde la Fase 2 (siempre `"stopped"`/`null`, ningún código los actualizaba) y la tabla `log_entries` existía sin ningún lector/escritor. `Socket.io` ya se instanciaba en `apps/server/src/index.ts` pero solo logueaba conexiones — ningún route handler podía emitir eventos porque `io` no estaba decorado en la instancia de Fastify.

Investigación previa a la implementación (agentes Explore + Plan, con verificación empírica de comportamiento real, no solo lectura de código — ver detalle en cada decisión de abajo).

## Decisiones

### Registro de procesos: factoría, no singleton de módulo

`apps/server/src/worktrees/process-manager.ts` exporta `createProcessManager({ db, io })`, instanciada una vez por `buildApp()` y decorada como `fastify.processManager` — no un módulo con un `Map` compartido a nivel de proceso (a diferencia de `project-lock.ts`, que sí es seguro como singleton porque solo guarda promesas autolimpiables). Aquí el `Map` guarda **procesos reales del SO** con PID: un test que se olvidara de pararlo dejaría el proceso vivo para el resto de la suite si fuera un singleton global.

### Máquina de estados basada en eventos nativos del proceso

`"starting"` se fija justo al invocar `execa`; el evento nativo `'spawn'` (confirmación real del SO de que el proceso arrancó) pasa a `"running"`; un fallo de spawn (comando/`cwd` inválidos) pasa a `"error"`; al `'exit'`, código 0 pasa a `"stopped"`, código≠0 pasa a `"error"` — salvo que la parada fuera solicitada explícitamente (`stop()`), en cuyo caso siempre es `"stopped"` con independencia del código/señal de salida real (un proceso al que se le manda `SIGTERM` no sale con código 0). Sin parseo de output del `devCommand` para detectar "listo" (heurística frágil, varía por proyecto).

**Bug real encontrado y corregido durante el desarrollo, con test de regresión**: la carrera inicial `Promise.race([once(child,'spawn'), once(child,'error')])` para saber si el arranque tuvo éxito fallaba porque `events.once()` trata `'error'` de forma especial — al esperar CUALQUIER otro evento (`'spawn'` en este caso), añade su propio listener interno de `'error'` y **rechaza** esa promesa si `'error'` llega antes, así que el error crudo de Node escapaba de la carrera en vez de convertirse en `DevCommandSpawnError`. Corregido añadiendo un manejador de rechazo a `once(child, 'spawn')` que lo convierte en el mismo valor `"error"` que la rama que sí espera `'error'` explícitamente.

### `tree-kill`, sin `detached`

Al parar un worktree se mata el árbol completo del proceso vía `tree-kill` (verificado en su código fuente: usa `pgrep`/`ps --ppid` recursivo en POSIX, `taskkill /pid <pid> /T /F` en Windows — necesario porque `execa` con `shell:true` expone el PID del shell, no el de los hijos reales que `pnpm dev`/`vite`/etc. puedan spawnear). El proceso se lanza **sin** `detached:true`: se prefiere que un crash/reinicio del propio backend mate también los entornos de dev que gestiona, en vez de perseguir la reconciliación de PIDs huérfanos que `detached` obligaría a resolver — mismo criterio de esfuerzo proporcional ya aplicado en ADR-0005/0006. Al cerrar el servidor de forma ordenada (`SIGINT`/`onClose`), se para explícitamente cada proceso trackeado con el mismo mecanismo, cubriendo el caso común (reinicio deliberado); un crash duro (`kill -9`) puede dejar algo huérfano, límite aceptado y documentado, no perseguido con una reconciliación activa de PIDs al arrancar.

### Reconciliación al arrancar: reset, no reconstrucción

Cualquier fila de `worktrees` con `process_status != 'stopped'` se resetea a `'stopped'`/`pid=null` al construir la app (`resetStaleProcessStates`) — no hay forma de recuperar un handle real de un proceso hijo de una ejecución anterior (vive solo en memoria). Se aprovecha el mismo momento para una poda de barrido de `log_entries` (`pruneAllWorktreeLogs`), cubriendo cualquier worktree que hubiera acumulado filas por encima del límite antes de un reinicio.

### Retención acotada de logs: tres disparadores, nunca por-línea

Última **2000** filas por worktree (`LOG_ENTRIES_KEEP_COUNT`), podadas en: (1) cada ~150 líneas nuevas en caliente durante la ejecución (contador en memoria por proceso — podar en cada línea sería trabajo desperdiciado en el camino más caliente del sistema), (2) puntualmente al `'exit'` (cierra el ciclo para ejecuciones cortas que nunca cruzan el umbral de 150), (3) el barrido de arranque de arriba.

### Socket.io decorado en Fastify, salas por worktree

`new Server(app.server, {...})` se movió de `index.ts` a dentro de `buildApp()`, decorado como `fastify.io` (mismo patrón `declare module "fastify"` que `db`) — `app.server` (el `http.Server` subyacente) existe desde que se llama `Fastify({...})`, no hace falta esperar a `.listen()`. Salas por worktree (`worktree:${id}`); el cliente emite `join-worktree`/`leave-worktree` (validado con Zod en el borde del lado servidor, mismo principio que el resto de la app).

**Bug real encontrado y corregido, con test de regresión** (`socket.test.ts`): cerrar el servidor con un cliente WebSocket conectado colgaba indefinidamente. Causa: `io.close()` cierra internamente `app.server` (el mismo `http.Server` que Fastify ya cierra por su cuenta), y las dos llamadas compitiendo por cerrar el mismo servidor se bloqueaban mutuamente. Corregido usando `io.disconnectSockets(true)` (solo desconecta los sockets, sin tocar el servidor HTTP) dentro del hook `preClose` de Fastify — no `onClose`, documentado explícitamente por Fastify para este caso exacto ("open WebSocket connections... must be explicitly terminated for `server.close()` to complete"): en `onClose` el servidor ya está cerrándose, así que desconectar ahí llega tarde.

### Unión histórico + tiempo real sin perder ni duplicar líneas: cursor por `id`

Tanto `GET /worktrees/:id/logs` como el payload del evento `log-entry` llevan el mismo `id` real de `log_entries` (mismo schema Zod en ambos bordes). El cliente se une a la sala del worktree (y empieza a bufferear eventos) **antes** de pedir el histórico; al resolver el histórico, descarta del buffer cualquier entrada con `id` ≤ el máximo recibido y añade el resto — así ninguna línea se pierde ni se duplica en el hueco entre petición y suscripción. El cliente re-emite el `join` en cada evento `connect` del socket (una reconexión es un socket nuevo, sin membership previa de sala). No hay parámetro `sinceId` en el histórico para resincronizar tras una desconexión larga — YAGNI, se resuelve si hace falta de verdad.

### Variable de entorno del puerto

El `devCommand` se ejecuta con `PORT=<puerto asignado>` en el entorno (convención ya asumida por Vite/Next/Express, y ya declarada en `docs/PROJECT_SPECIFICATION.md`). Se añadió un hint de una línea junto al campo "Comando de arranque" en alta/edición de proyecto explicándolo, ya que no se mencionaba en ningún sitio de la UI hasta ahora.

## Alternativas consideradas

- **`detached:true` + reconciliación activa de PIDs huérfanos tras un crash**: descartado — la complejidad de perseguir un PID que puede haber sido reutilizado por el SO tras un reinicio no compensa frente a aceptar que un crash duro del manager también termine los entornos que gestiona, en un tool local de un único usuario.
- **Actualizar la caché del frontend solo vía el evento de socket `process-status`**: descartado tras notar que `useStartWorktree`/`useStopWorktree` no tenían forma de reflejar el nuevo estado sin depender por completo del socket (no testeable con MSW, que no simula WebSockets) — se cambió `POST /stop` para devolver también el worktree actualizado (como ya hacía `POST /start`), y ambos hooks parchean la caché de TanStack Query directamente en `onSuccess` (patrón ya usado en `use-delete-project.ts`), con el socket sirviendo para que OTRAS pestañas/clientes vean el cambio en tiempo real.
- **Parsear el output del `devCommand` para detectar "arrancado y listo"**: descartado — varía radicalmente entre proyectos/frameworks, sería una heurística frágil por diseño.

## Consecuencias

- Añadir una terminal nueva a la lista curada de terminales (ADR-0006) es independiente de esto; añadir aquí una nueva librería (`tree-kill`) sigue el mismo criterio ya establecido en ADR-0005/0006 de no reimplementar un problema con matices por plataforma.
- El comportamiento de matar árboles de proceso en Windows no se verifica en CI (que solo corre en `ubuntu-latest`) — mismo límite ya aceptado para `terminal.ts`.
- Toda creación de worktree de la app ya pasaba por un lock global de puertos (ADR-0006); arrancar/parar un worktree añade un lock por `worktree.id` (reutilizando `withProjectLock`) para que dos peticiones concurrentes del mismo worktree no compitan.

---

Un ADR es atómico e inmutable: registra una decisión, no se edita después. Si la decisión cambia, se crea un ADR nuevo que la sustituye (`Superseded by`) y se actualiza el `Estado` de este a `Superseded by [ADR-NNNN]`, dejando el razonamiento original intacto y consultable.
