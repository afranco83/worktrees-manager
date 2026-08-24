# 0018. Salto deliberado a la versión 1.0.0 vía `Release-As`

- **Estado**: Aceptada
- **Fecha**: 2026-08-24

## Contexto

`worktrees-manager` lleva publicado en npm desde la Fase 9 ([ADR-0016](./0016-distribucion-como-paquete-npm.md)) y todas las fases de v1 del propio roadmap del producto están cerradas — el proyecto funciona de forma estable en uso real, no es ya "desarrollo inicial". Aun así, sigue en versión `0.1.x`.

Con la automatización recién montada ([ADR-0017](./0017-automatizacion-release-y-publicacion-npm.md), `bump-minor-pre-major: true`), el proyecto **nunca saldría de 0.x por sí solo**: por convención de semver, mientras el major sea `0`, hasta un commit con `BREAKING CHANGE` sube el minor, no el major — cruzar a `1.0.0` es siempre una decisión manual, nunca un cálculo automático. `release-please` soporta justo ese caso: un footer `Release-As: <versión>` en un commit fuerza la versión de la siguiente Release PR, ignorando el bump que le tocaría por los tipos de commit acumulados.

Detalle de mecanismo verificado antes de aplicarlo: el _path-scoping_ del modo manifest de `release-please` (componente `apps/server`) filtra qué commits cuentan para el cálculo de versión de ese paquete según si tocan ficheros bajo su `path`. Para evitar cualquier ambigüedad sobre si un `Release-As` en un commit que no toca `apps/server/**` se tendría en cuenta, el commit que lleva el footer incluye también un cambio real dentro de `apps/server` (ver Decisión).

## Decisión

Un único commit (`docs: prepara el salto a la versión 1.0.0`) que:

1. Añade este ADR y la entrada correspondiente en `docs/ROADMAP.md`.
2. Añade una sección "Versionado" a `apps/server/README.md` (Semantic Versioning a partir de `1.0.0`, enlace a `apps/server/CHANGELOG.md`) — cambio real dentro de `apps/server/`, no solo de relleno, que además garantiza que el commit cuenta para el path-scoping del componente.
3. Lleva el footer `Release-As: 1.0.0` — la próxima vez que corra el job `release-please`, la Release PR abierta (o la que se genere) propondrá `1.0.0` en vez del bump incremental que le tocaría por los `fix`/`feat` acumulados.

No se toca `release-please-config.json` ni `.release-please-manifest.json`: `Release-As` es un mecanismo de override puntual, no un cambio de configuración permanente. `bump-minor-pre-major`/`bump-patch-for-minor-pre-major` dejan de tener efecto práctico en cuanto el major deja de ser `0` (son opciones específicas de comportamiento _pre-major_), así que no hace falta limpiarlas.

**Esto prepara el salto, no lo publica.** Mergear este commit solo actualiza la Release PR de `release-please` para que proponga `1.0.0` — la publicación real a npm sigue siendo un paso deliberado y posterior: mergear esa Release PR cuando el usuario decida.

## Alternativas consideradas

- **Editar `.release-please-manifest.json` a mano a `1.0.0`**: descartada — es el mismo resultado que ofrece `Release-As` de forma nativa y soportada, pero sin dejar rastro en el historial de commits de que fue una decisión deliberada (el footer queda documentado en el propio log de git, el fichero de manifest no dice por qué cambió).
- **Esperar a que un cambio con `BREAKING CHANGE` real lo justifique**: descartada — con `bump-minor-pre-major: true` eso seguiría sin cruzar a `1.0.0` (sigue siendo pre-major), así que no resuelve nada por sí solo; el salto a `1.0.0` es una decisión de comunicación semántica ("esto ya es estable"), no una consecuencia automática de romper compatibilidad.
- **Footer `Release-As` en un commit que no toca `apps/server/**`** (p. ej. solo el ADR y el ROADMAP): descartada — riesgo real de que el path-scoping del modo manifest lo excluya del cálculo de versión del componente; se prefiere no depender de un comportamiento no verificado explícitamente en la documentación de la herramienta.

## Consecuencias

- A partir de `1.0.0`, cualquier cambio que rompa la interfaz pública del CLI (flags, variables de entorno, comportamiento del `bin`) requiere un commit con `BREAKING CHANGE` para subir a `2.0.0` — ya no vale "es pre-1.0, cualquier cosa puede cambiar" como colchón implícito.
- El changelog (`apps/server/CHANGELOG.md`) empieza a acumular desde `0.1.0`/`0.1.1` hacia `1.0.0` en la misma Release PR — la entrada de `1.0.0` no tendrá una lista de "breaking changes" real que la justifique, porque el salto es deliberado, no forzado por incompatibilidad.
