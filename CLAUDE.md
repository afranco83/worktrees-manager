# CLAUDE.md

Este archivo da a Claude Code el contexto operativo de este repositorio. Las convenciones de código detalladas viven en documentos externos, compartidos con otros repos propios sobre stacks afines vía el marketplace [`afai-conventions-tools`](https://github.com/afranco83/afai-conventions-tools) — léelos antes de escribir o modificar código; son la fuente de verdad y aplican también a otras herramientas de codificación, no solo a Claude Code:

@~/Projects/afai-conventions-tools/AGENTS.md

@~/Projects/afai-conventions-tools/plugins/vite-react-ts/AGENTS.md

@~/Projects/afai-conventions-tools/plugins/node-fastify/AGENTS.md

## Qué es este proyecto

Dashboard local para gestionar `git worktrees` de forma visual: crear/borrar worktrees con asignación automática de puerto, arrancar/parar sus entornos de dev con logs en tiempo real, ver su estado de cambios sin commitear y su PR asociada — sustituyendo el ir y venir por terminal. Contexto completo en `docs/PROJECT_SPECIFICATION.md`, `docs/ARCHITECTURE.md` y `docs/ROADMAP.md`.

**Estado actual: Fase 1 — Scaffolding, en curso** (`docs/ROADMAP.md`). Fase 0 (documentación) cerrada el 2026-07-16: migración de `SPEC.md` v0.1 al modelo de varios ficheros (`docs/PROJECT_SPECIFICATION.md` + `ARCHITECTURE.md` + `ROADMAP.md` + `docs/adr/`), igual que otros repos propios sobre el mismo modelo documental.

Stack: Vite + React + TypeScript (SPA, `apps/dashboard`) + Node.js + Fastify + Socket.io (`apps/server`), monorepo `pnpm` sin Turborepo (solo 2 apps, sin packages compartidos previstos en el alcance de v1). Detalle completo en `docs/ARCHITECTURE.md`.

## Cómo trabajar en este repo

- Antes de implementar algo, comprueba en `docs/ROADMAP.md` en qué fase estamos y qué tareas de esa fase siguen pendientes.
- Sigue el canon + las dos capas de stack importadas arriba al pie de la letra. `node-fastify` es la primera capa de backend del marketplace: si una convención no encaja con este proyecto en concreto, se corrige ahí (o en `docs/ARCHITECTURE.md` si es una decisión propia de este repo, no general del stack).
- No adelantes trabajo de fases futuras (p. ej. no montes el esquema SQLite real de la Fase 2 mientras la Fase 1 no esté cerrada) salvo que el usuario lo pida explícitamente.
- Comandos esperados (se confirman/ajustan al cerrar la Fase 1): `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm --filter dashboard dev`, `pnpm --filter server dev`.
- Cualquier decisión de arquitectura nueva y significativa se documenta con un ADR en `docs/adr/` en el momento en que se toma (ver `docs/adr/README.md`).
- **Mejora continua activa**: siempre que una decisión tomada durante el trabajo pueda derivar en una actualización del canon/capas de `afai-conventions-tools` o del propio roadmap/arquitectura, se propone reflejarla en el documento correspondiente en el momento, no se deja pendiente.

## Multitasking con git worktrees

El trabajo en paralelo sobre distintos frentes (fases, features, spikes) se hace en worktrees separados, no cambiando de rama sobre un único directorio con cambios a medio commitear — coherente con el propio propósito de esta herramienta (`docs/ARCHITECTURE.md` §7).

- Usa `EnterWorktree`/`ExitWorktree` (o `isolation: "worktree"` al lanzar un subagente con `Agent`) cuando el trabajo sea razonablemente independiente y se beneficie de aislamiento del resto del repo.
- No asumas que el working directory activo es el único estado relevante del repo — puede haber otros worktrees con trabajo en curso.

## Repo remoto

[github.com/afranco83/worktrees-manager](https://github.com/afranco83/worktrees-manager). Misma cautela que en cualquier otro repositorio para operaciones de `git` de alcance amplio o difícil de revertir (`push --force`, `reset --hard`, reescritura de historial): confirmación explícita del usuario antes de ejecutarla.
