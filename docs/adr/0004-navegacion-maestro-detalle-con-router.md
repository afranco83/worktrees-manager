# 0004. Navegación maestro-detalle: introducción de `react-router`

- **Estado**: Aceptada
- **Fecha**: 2026-07-17

## Contexto

Tras cerrar la Fase 4, se propone una mejora de interfaz (fuera del roadmap de fases numeradas): sustituir la página única con tabla de proyectos + diálogos por un layout maestro-detalle — sidebar con la lista de proyectos y un panel de contenido con los datos generales y los worktrees del proyecto seleccionado. ADR-0002 (Fase 3) ya identificó este escenario exacto como el disparador para introducir `react-router`, difiriéndolo hasta que "una fase futura (worktrees por proyecto, Fase 4+) necesite de verdad una segunda vista o estado compartido entre componentes no relacionados" — y `ARCHITECTURE.md` §2 repitió la misma condición tras la Fase 4, sin activarla porque el detalle de worktrees siguió viviendo en un diálogo, no en una vista propia.

## Decisión

- **`react-router` (`^8.2.0`)**, con `createBrowserRouter`/`RouterProvider` — el proyecto seleccionado vive en la URL (`/projects/:projectId`), no en estado local, para que el botón atrás/adelante del navegador y las URLs con proyecto concreto funcionen.
- Rutas definidas explícitamente en código (`apps/dashboard/src/app-routes.tsx`, un array `RouteObject[]` exportado), no por convención de ficheros — coherente con `vite-react-ts/AGENTS.md` ("rutas por dominio, no por convención de ficheros"). `App.tsx` monta ese array con `createBrowserRouter`; los tests lo reutilizan con `createMemoryRouter` para no duplicar la configuración de rutas.
- Estructura: `AppLayout` (sidebar + `<Outlet/>`) como layout raíz, con dos rutas hijas — `index` (`ProjectsIndexRoute`, redirige al primer proyecto si existe alguno o muestra un estado vacío) y `projects/:projectId` (`ProjectDetailPage`, datos generales + tabla de worktrees + acciones).
- El paso "listado de worktrees" deja de ser un paso dentro de un `Dialog` con `create`/`delete` (patrón de la Fase 3/4) y pasa a ser contenido normal de la página. `Crear worktree` y `Borrar worktree` quedan como dos diálogos independientes y mutuamente excluyentes (mismo patrón que `CreateProjectDialog`/`EditProjectDialog`/`DeleteProjectDialog`), ya no necesitan compartir un único `Dialog` para evitar el doble backdrop — ese problema solo existía cuando "listado" también vivía en un diálogo.

## Alternativas consideradas

- **Seguir con estado local (`useState<string | null>` para el proyecto seleccionado)**: descartado — pierde la URL como fuente de verdad (recargar la página vuelve siempre a la lista), que es justo lo que el propio `ARCHITECTURE.md` marcaba como el punto en que ya no compensa diferir el router.
- **Mantener el detalle de worktrees en un `Dialog`, solo mover la lista de proyectos a sidebar**: descartado por el usuario explícitamente — el objetivo de la mejora es que el panel de contenido muestre los datos del proyecto seleccionado directamente, no detrás de un modal adicional.
- **`react-router` con rutas por convención de ficheros (tipo Next.js `app/`)**: no aplica — `vite-react-ts/AGENTS.md` ya fija que este stack no tiene ese mecanismo; las rutas se declaran a mano.

## Consecuencias

- `apps/dashboard` gana una dependencia de runtime nueva (`react-router`).
- `ProjectsTable` y el antiguo `WorktreesDialog` (con su paso `"list"`) quedan sin uso y se eliminan — ninguna otra vista los necesita.
- Borrar el único proyecto restante o crear el primero desde la página vacía depende de que la lista de proyectos en caché de TanStack Query se actualice de forma **síncrona** en el mismo tick de la mutación (`setQueryData`, no `invalidateQueries` + refetch asíncrono) — un `invalidateQueries` puro deja una ventana donde `ProjectsIndexRoute` puede leer todavía la lista obsoleta (con el proyecto recién borrado incluido) y redirigir de vuelta a esa misma URL. Bug real encontrado en verificación manual en navegador, corregido en `useDeleteProject` antes de cerrar esta iteración.
- Cualquier vista nueva que necesite navegación propia (candidato: logs persistentes por worktree) se añade como ruta hija de `AppLayout`, reutilizando el mismo router en vez de introducir un mecanismo paralelo.

---

Un ADR es atómico e inmutable: registra una decisión, no se edita después. Si la decisión cambia, se crea un ADR nuevo que la sustituye (`Superseded by`) y se actualiza el `Estado` de este a `Superseded by [ADR-NNNN]`, dejando el razonamiento original intacto y consultable.
