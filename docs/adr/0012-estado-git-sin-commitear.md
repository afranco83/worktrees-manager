# 0012. Aviso de seguridad ante el borrado: cambios sin commitear y commits sin subir

- **Estado**: Aceptada
- **Fecha**: 2026-07-21

## Contexto

El DoD de Fase 6 pedía visibilidad del estado git de cada worktree. Una primera iteración calculaba un resumen numérico de `git status --porcelain` (ficheros modificados/nuevos/borrados) — verificado manualmente en navegador, pero descartado tras revisarlo: un número de cambios no dice nada accionable por sí solo. El objetivo real, reformulado por el usuario, es más concreto: **avisar antes de que se borre un worktree con trabajo pendiente**.

Esto separa dos riesgos distintos:

1. **Cambios sin commitear**: ya bloqueados desde la Fase 4 — `DELETE /worktrees/:id` rechaza (409, `WorktreeHasUncommittedChangesError`) un worktree con working-tree sucio salvo `force`. Lo que faltaba no era la protección, era hacerla visible **antes** de intentar borrar, no solo al fallar el intento.
2. **Commits sin subir a ningún remoto**: sin ninguna protección hoy. `git worktree remove` no lo comprueba — solo bloquea working-tree sucio. Un worktree con commits reales pero nunca publicados puede borrarse sin aviso.

## Decisión

`Worktree.gitStatus` pasa de un resumen categorizado a dos señales booleanas, calculadas en caliente (no persistidas) igual que antes:

```ts
{ hasUncommittedChanges: boolean, hasUnpushedCommits: boolean } | null
```

`hasUncommittedChanges` sigue siendo `git status --porcelain` no vacío. `hasUnpushedCommits` (`git-status.ts`):

- Si existe `refs/remotes/origin/<rama>` conocida localmente: hay commits sin subir si `HEAD` va por delante de esa referencia (`git rev-list --count origin/<rama>..HEAD`).
- Si no existe ninguna copia remota de la rama: cualquier commit propio desde la creación del worktree cuenta como "sin subir" — decisión explícita del usuario, porque ese es el caso de mayor riesgo real (el trabajo no existe en ningún otro sitio). Para poder calcularlo con precisión se **persiste el commit base** del que partió cada worktree (`worktrees.base_commit_sha`, migración `0007`, capturado con `resolveHeadCommitSha()` justo tras `git worktree add`, cuando `HEAD` del worktree nuevo es exactamente ese commit) y se compara contra él (`git rev-list --count <base>..HEAD`).

"origin" queda fijo, sin concepto de remoto configurable — mismo supuesto que ya hace `resolveDefaultBranch` con `refs/remotes/origin/HEAD`. No hay `fetch` implícito en ningún punto de la app, así que la comprobación refleja el último fetch conocido localmente, no el estado real del remoto en este instante.

`withGitStatus()` (`plugin.ts`) sigue el mismo patrón que `withDetectedPorts` (ADR-0008): se aplica en los mismos 4 endpoints (listado, `PATCH`, `start`, `stop`), no en la creación — un worktree recién creado está por construcción sin cambios y sin commits propios (`HEAD` == commit base), así que el placeholder del repositorio (`{ hasUncommittedChanges: false, hasUnpushedCommits: false }`) ya es correcto sin necesitar procesos git adicionales en el camino de creación.

En el frontend, `GitStatusBadge` deja de mostrar un badge positivo de "sin cambios": ahora solo aparece cuando hay algo que avisar (`Cambios sin commitear` / `Commits sin subir`, independientes entre sí), coherente con que esto es un aviso, no un resumen de estado. El mismo aviso de "commits sin subir" se repite en el diálogo de confirmación de borrado (`delete-worktree-step.tsx`) — el punto de máximo riesgo, justo antes de la acción destructiva. El caso de cambios sin commitear no se duplica ahí: ya es imposible borrar sin verlo, por el bloqueo 409 existente.

**Corrección incidental encontrada en el mismo cambio**: el texto de `delete-worktree-step.tsx` afirmaba que se borraba "la rama … del disco" junto con el worktree — falso, `DELETE /worktrees/:id` nunca llama a `deleteLocalBranch`, la rama sobrevive. Se corrige aquí porque un texto que ya afirma incorrectamente que el trabajo desaparece mina la credibilidad del aviso nuevo sobre seguridad del trabajo.

## Alternativas consideradas

- **Mantener el resumen numérico** (categorías modificado/nuevo/borrado): descartado por el propio usuario — no ayuda a decidir si es seguro borrar, solo cuenta ficheros.
- **Aproximar "sin subir" comparando contra la rama por defecto** en vez de persistir el commit base: descartado por menos preciso y con riesgo de falso positivo si el worktree se creó desde una rama distinta a la por defecto (`base: { type: "branch" | "current" }`) — la rama por defecto no tiene por qué compartir historia reciente con esa base.
- **Push por socket con timer server-side**: sigue descartado por el mismo motivo que en la iteración anterior de este ADR — la causa del cambio es siempre externa a la app, un timer de servidor no tiene ninguna fuente real de la que colgarse, solo estaría reconsultando git periódicamente igual que el polling del frontend, con el coste añadido de gestionar el lifecycle de esos timers.

## Consecuencias

- Columna nueva `worktrees.base_commit_sha` (nullable, migración `0007`): las filas ya existentes en un registro real (creadas antes de esta fase) quedan con `NULL` — `hasUnpushedCommits` se degrada a `false` para esas filas cuando no hay copia remota de la rama, en vez de arriesgar un falso positivo con una aproximación menos fiable.
- `gitStatus` cambia de forma en el schema compartido (backend y frontend): cualquier fixture que construya un `Worktree` a mano necesita el nuevo shape (ya corregido en `apps/dashboard/src/test/msw/handlers.ts` y en los fixtures de test del backend).
- `insertWorktree()` pasa a requerir `baseCommitSha` — cualquier código que inserte un worktree (aparte del endpoint de creación real) necesita resolverlo o, en tests que no ejercitan git-status, pasar un valor de relleno.
- Un worktree con cambios reales fuera del dashboard tarda hasta el siguiente refetch (`refetchInterval: 5000` en `useWorktrees`, sin cambios respecto a la iteración anterior) en reflejarse en la UI.

---

Un ADR es atómico e inmutable: registra una decisión, no se edita después. Si la decisión cambia, se crea un ADR nuevo que la sustituye (`Superseded by`) y se actualiza el `Estado` de este a `Superseded by [ADR-NNNN]`, dejando el razonamiento original intacto y consultable.
