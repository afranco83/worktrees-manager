# 0002. Stack de UI real: preset de shadcn/ui, resolver de formularios para Zod v4, alcance de router/estado global

- **Estado**: Aceptada
- **Fecha**: 2026-07-16

## Contexto

La Fase 3 introduce la primera funcionalidad real del dashboard (CRUD de proyectos) y, con ella, el primer código de UI del proyecto: Tailwind/shadcn, TanStack Query, React Hook Form. `ARCHITECTURE.md` §2 ya fijaba ese stack en abstracto desde la Fase 1; esta fase obliga a concretar tres puntos que el documento original no cubría al nivel de detalle necesario para implementar: qué preset de shadcn/ui usar, cómo conectar Zod (ya en v4 en este repo) con React Hook Form, y si `react-router`/Zustand entran ya o se difieren.

## Decisión

- **shadcn/ui, preset `base-nova`** (`npx shadcn@latest init -y -t vite -b base -p nova --no-monorepo`): primitivos headless `@base-ui/react` (no Radix) + un paquete `shadcn` con el reset/tokens CSS base como dependencia de runtime. Los componentes de interacción (`button`, `dialog`, `table`...) se copian a `src/components/ui/` y se adaptan igual que en cualquier instalación de shadcn — la única diferencia frente al principio de "cero dependencias de runtime" de `ARCHITECTURE.md` §2 es ese paquete `shadcn` de estilos base, que impone el propio CLI oficial en este preset.
- **`standardSchemaResolver`** (`@hookform/resolvers/standard-schema`), no `zodResolver` (`@hookform/resolvers/zod`): en la versión instalada de `@hookform/resolvers` (5.4.0), `zodResolver` espera la forma interna de Zod v3 y falla en tipado contra Zod v4 (`zod@4.4.3`, ya instalado en el repo). Zod v4 implementa el estándar [Standard Schema](https://github.com/standard-schema/standard-schema), que `@hookform/resolvers` sí soporta de forma genérica. Con schemas que usan `z.coerce` (rango de puertos), `useForm` se tipa con los tres genéricos (`<InputSchema, unknown, OutputSchema>`, vía `z.input`/`z.output` del propio schema) en vez de uno solo, para que el formulario trackee el shape crudo (string antes de coercionar) y el `onSubmit` reciba el shape ya parseado.
- **`react-router` y Zustand se difieren**: la Fase 3 tiene una única vista (`ProjectsPage`) y un único estado de UI local ("qué diálogo está abierto"), cubierto con `useState`. Ninguna librería adicional se justifica todavía (YAGNI); se añaden cuando una fase futura (worktrees por proyecto, Fase 4+) necesite de verdad una segunda vista o estado compartido entre componentes no relacionados.

## Alternativas consideradas

- **shadcn preset `radix`** en vez de `base`: mantiene los componentes 100% sin dependencia de runtime adicional (Radix se instala por-componente, sin paquete de estilos base compartido), pero es el preset que el propio CLI marca como legacy frente a `base` (Base UI), la opción recomendada por defecto en la versión actual de la herramienta. Se descarta por alinearse con la dirección oficial del proyecto, no por una razón técnica de este repo.
- **Copiar a mano los componentes de shadcn/ui** (sin usar el CLI, para evitar la dependencia `shadcn`): más control, pero renuncia a que el CLI mantenga los componentes al día y complica añadir nuevos primitivos en fases futuras; el coste de la única dependencia extra (`shadcn`, solo CSS base) es bajo.
- **Usar `zodResolver` forzando un cast de tipos**: descartado directamente — el canon prohíbe aserciones (`as`/`!`) para silenciar el compilador; `standardSchemaResolver` resuelve el problema de raíz, no lo enmascara.
- **Introducir `react-router`/Zustand ya, previendo la Fase 4**: descartado por YAGNI/KISS; envolver `ProjectsPage` en un router cuando haga falta es un cambio mecánico, no un refactor doloroso, así que no hay coste real en diferirlo.

## Consecuencias

- `apps/dashboard` gana una dependencia de runtime nueva (`shadcn`, solo CSS/tokens) no prevista literalmente en `ARCHITECTURE.md` §2; el documento se actualiza en esta misma fase para reflejarlo.
- Cualquier componente de shadcn nuevo que se añada en fases futuras debe usar `standardSchemaResolver` si integra RHF+Zod, no `zodResolver` — de lo contrario reaparecen los errores de tipado que motivaron esta decisión.
- La introducción de `react-router`/Zustand queda pendiente; quien retome el trabajo en Fase 4 debe evaluar en ese momento si la vista de detalle de worktrees justifica ya su entrada.

---

Un ADR es atómico e inmutable: registra una decisión, no se edita después. Si la decisión cambia, se crea un ADR nuevo que la sustituye (`Superseded by`) y se actualiza el `Estado` de este a `Superseded by [ADR-NNNN]`, dejando el razonamiento original intacto y consultable.
