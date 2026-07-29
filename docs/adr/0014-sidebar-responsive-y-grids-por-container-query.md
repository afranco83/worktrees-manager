# 0014. Sidebar responsive vía panel deslizante + grids por container query, no breakpoints de viewport

- **Estado**: Aceptada
- **Fecha**: 2026-07-28

## Contexto

El dashboard se diseñó sobre la base de un sidebar persistente de 288px (`w-72`) junto al contenido (`AppLayout`, Fase 3), sin ningún ajuste para pantallas estrechas — a petición explícita del usuario ("repasa todas las vistas y componentes y haz las adaptaciones oportunas para que funcione bien a nivel visual en móvil/tablet; desktop ya está bien"). En un viewport de 375px ese sidebar fijo se comía casi toda la pantalla, dejando el contenido inutilizable.

Al resolver eso apareció un segundo problema, más sutil: el grid de la lista de worktrees (`md:grid-cols-2 lg:grid-cols-3`) y el propio `has-data-[slot=card-action]:grid-cols-[1fr_auto]` de `CardHeader` usan breakpoints de **viewport**, pero el hueco real disponible es `viewport − 288px` cuando el sidebar persistente está presente. A 768px de viewport (el propio breakpoint `md`), el contenido real solo tiene 480px — el grid intentaba 2 columnas en ese hueco y las cards se recortaban. El mismo desajuste reaparecía justo en el límite `lg` (1024px) al reactivarse el sidebar persistente.

## Decisión

**Sidebar → barra superior + panel deslizante (`Sheet`) por debajo de `lg` (1024px), persistente a partir de ahí.** Se extrajo el contenido del sidebar (`ProjectsSidebarContent`) para reutilizarlo en ambos contenedores; `AppLayout` pasa de `flex` a `flex flex-col lg:flex-row` para apilar la barra móvil sobre el contenido en vez de ponerla al lado. `lg` (no `md`) porque a 768px con sidebar persistente el hueco real ya no alcanza para una experiencia cómoda — se prefirió dar tablet en portrait el mismo trato que móvil antes que dejarlo a medias.

**Nuevo primitivo `Sheet`** (`components/ui/sheet.tsx`): mismo `Dialog` de `@base-ui/react/dialog` ya usado en toda la app, reposicionado como panel lateral (`fixed inset-y-0 left-0`, animación `slide-in-from-left`/`slide-out-to-left` de `tw-animate-css`) en vez de modal centrado. Hereda gratis el manejo de foco, `Escape`, click-fuera y portal ya validado en el resto de diálogos de la app.

**Grids de listado → container queries, no breakpoints de viewport.** `worktrees-card-list.tsx` pasa de `md:grid-cols-2 lg:grid-cols-3` a `@container/worktree-grid` + `@[768px]/worktree-grid:grid-cols-2 @[1024px]/worktree-grid:grid-cols-3` (mismos umbrales en px, medidos contra el contenedor real en vez del viewport) — mismo criterio que `@container/card-footer` (`card.tsx`, Fase 8 anterior). `CardHeader`+`CardAction` en las cabeceras con botones pesados (vista de detalle de worktree, card de Logs) pasan de su grid `[1fr_auto]` fijo a `flex flex-wrap items-start justify-between gap-2`, que reduce a un layout apilado en vez de desbordar horizontalmente cuando no cabe.

## Alternativas consideradas

- **Colapsar el sidebar a solo iconos en vez de ocultarlo** (patrón común en dashboards de escritorio): descartada — con nombres de proyecto de longitud variable un sidebar de solo iconos no aporta nada útil, y seguía sin resolver el caso de 375px.
- **`md` (768px) como umbral del panel deslizante**, igual que el resto de breakpoints ya usados en el código (`md:grid-cols-2`): descartada tras comprobar visualmente que a 768px con sidebar persistente el contenido queda en 480px reales, insuficiente.
- **Drawer nativo de `@base-ui/react/drawer`** (ya presente como dependencia transitiva) en vez de reposicionar `Dialog`: descartada — ese primitivo está pensado para bottom sheets con gestos de swipe y snap points (una interacción bastante distinta a un panel de navegación lateral), y habría introducido un segundo modelo de overlay en la app sin necesidad — reposicionar el `Dialog` ya usado en el resto del proyecto es la solución más simple que resuelve el problema actual.
- **Mantener los breakpoints de viewport en los grids y en su lugar ajustar manualmente los números de columna a mano por breakpoint** para compensar los 288px del sidebar: descartada — frágil (cualquier cambio futuro al ancho del sidebar rompería el cálculo de nuevo en silencio) frente a una solución que mide el hueco real sin necesidad de sincronizar dos números a mano.

## Consecuencias

- El sidebar persistente y el contenido de navegación del panel móvil son dos instancias del mismo `ProjectsSidebarContent` en el DOM (una oculta por CSS vía `hidden lg:flex`, la otra desmontada por defecto dentro del `Sheet` hasta que se abre) — coherente con cómo ya se comportan el resto de diálogos de la app, pero cualquier test futuro que abra el panel móvil deberá acotar sus queries (p. ej. `within(screen.getByRole("dialog"))`) si en algún momento coincide con el sidebar persistente en el mismo árbol de test.
- Cualquier grid o cabecera nueva que conviva con el sidebar persistente debe usar container queries (`@container`/`@[px]`), no `md:`/`lg:`, para no reintroducir el mismo desajuste — precedente ya extendido a dos sitios (`card-footer` en la fase anterior, `worktree-grid` aquí).
- `DialogHeader` gana `pr-8` de forma incondicional (reserva de hueco para el botón de cerrar) — aplica a todos los diálogos de la app, no solo a los tocados en esta revisión; corrige un solapamiento con títulos largos que ya existía antes de esta ronda de responsive, solo visible en pantallas estrechas.

---

Un ADR es atómico e inmutable: registra una decisión, no se edita después. Si la decisión cambia, se crea un ADR nuevo que la sustituye (`Superseded by`) y se actualiza el `Estado` de este a `Superseded by [ADR-NNNN]`, dejando el razonamiento original intacto y consultable.
