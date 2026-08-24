# worktrees-manager

Dashboard local para gestionar `git worktrees` de forma visual: crear/borrar worktrees con asignación automática de puerto, arrancar/parar sus entornos de dev con logs en tiempo real, ver su estado de cambios sin commitear y su PR asociada.

## Uso

```bash
npx worktrees-manager
```

o instalado de forma global:

```bash
npm install -g worktrees-manager
worktrees-manager
```

Arranca un servidor local que sirve el dashboard (por defecto en `http://localhost:4100`). Puerto configurable con `--port <n>` o la variable de entorno `PORT`.

Requiere Node.js ≥ 26 y `git`; la integración con Pull Requests necesita además [GitHub CLI](https://cli.github.com/) (`gh`) instalada y autenticada.

## Documentación

Repositorio y documentación completa (arquitectura, roadmap, decisiones de diseño): [github.com/afranco83/worktrees-manager](https://github.com/afranco83/worktrees-manager).

Este paquete es el servidor (`apps/server` del monorepo): Node.js + Fastify + Socket.io, sirve tanto la API como el build del dashboard (`apps/dashboard`) desde el mismo origen.

## Versionado

Sigue [Semantic Versioning](https://semver.org/). A partir de `1.0.0`, cualquier cambio incompatible en la interfaz pública del CLI (flags, variables de entorno, comportamiento del `bin`) se refleja en un cambio de versión mayor. Historial de cambios en [`CHANGELOG.md`](./CHANGELOG.md).

## Licencia

MIT © Aurelio Franco Fernández
