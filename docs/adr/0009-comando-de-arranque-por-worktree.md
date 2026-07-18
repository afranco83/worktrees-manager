# 0009. Comando de arranque por worktree (elegir qué apps corren en un monorepo)

- **Estado**: Aceptada
- **Fecha**: 2026-07-18

## Contexto

Tras cerrar la Fase 5, verificación manual con el worktree real de `store_demo` (monorepo turbo de 5 apps) mostró dos problemas relacionados: (1) arrancar el `devCommand` del proyecto arranca siempre las 5 apps, cuando para probar una feature concreta a menudo solo hacen falta 2-3; (2) una de esas apps es Storybook, que abre una pestaña de navegador sola al arrancar (comportamiento propio de `storybook dev`, no de esta app — no controlamos qué hace el proceso que lanzamos).

## Decisión

Se añade un campo opcional `devCommandOverride` por worktree (`worktrees.dev_command_override`, `NULL` por defecto = hereda el `devCommand` del proyecto sin ningún cambio de comportamiento para quien no lo use). Editable en cualquier momento desde la card del worktree (`PATCH /worktrees/:id`), no en el flujo de creación. `process-manager.ts` usa `worktree.devCommandOverride ?? project.devCommand` como único punto de lectura real.

El propio texto del override es quien decide qué arranca, con las flags de la herramienta de monorepo que use cada proyecto (`turbo run dev --filter=<paquete>`, `pnpm --filter=<paquete> dev`, `nx run-many --projects=...`...) — esta app no interpreta ni construye esas flags, solo pasa el texto tal cual a `execa`, igual que ya hace con `devCommand` del proyecto.

### Alternativa descartada: checkboxes de apps + orquestación propia por app

Se consideró seriamente descubrir las apps del monorepo (vía workspace globs) y ofrecer una selección por checkboxes, arrancando un proceso independiente por cada app elegida (generalizando el `ProcessManager` de la Fase 5 de "1 proceso por worktree" a "N procesos por worktree").

Descartada por desproporcionada frente al problema real: reimplementaría — con matices de estado/logs/ciclo de vida por app — algo que las propias herramientas de monorepo (turbo, nx, pnpm workspaces) ya resuelven bien, yendo contra el mismo criterio que ya llevó a este proyecto a apoyarse en `execa`/`tree-kill` en vez de reimplementarlos (ADR-0005/0007). También perdería beneficios propios de esas herramientas (caché, grafo de dependencias entre paquetes) al no delegar en ellas. El coste de la alternativa elegida es mínimo en comparación: un campo de texto opcional, sin tocar el modelo de "1 proceso por worktree" ya construido.

Se deja constancia explícita: si la fricción de escribir las flags a mano resulta ser un problema real de verdad (no hipotético), la opción de checkboxes queda como mejora futura — no se construye ahora por YAGNI, pero tampoco se descarta para siempre.

### Generalidad de alcance

Esta decisión reafirma que el proyecto no asume ningún framework/orquestador de monorepo concreto (`docs/PROJECT_SPECIFICATION.md`: el alcance es "servidor de dev en Node", no React/Next en particular) — el mecanismo elegido no necesita saber si el usuario usa turbo, nx, pnpm workspaces o ninguno de los tres.

## Consecuencias

- `Worktree.devCommandOverride: string | null` es ahora un campo obligatorio del schema compartido; cualquier fixture/mock de test que construya un `Worktree` a mano necesita incluirlo.
- Efecto colateral positivo: el problema de Storybook abriendo pestaña sola se resuelve como consecuencia natural (basta con no incluir esa app en el override), sin necesidad de ningún código específico para ese caso.

---

Un ADR es atómico e inmutable: registra una decisión, no se edita después. Si la decisión cambia, se crea un ADR nuevo que la sustituye (`Superseded by`) y se actualiza el `Estado` de este a `Superseded by [ADR-NNNN]`, dejando el razonamiento original intacto y consultable.
