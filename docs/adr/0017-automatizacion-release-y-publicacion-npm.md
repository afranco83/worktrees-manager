# 0017. Automatización de release y publicación a npm con release-please

- **Estado**: Aceptada
- **Fecha**: 2026-08-24

## Contexto

ADR-0016 dejó la publicación de `worktrees-manager` en npm como manual de forma explícitamente temporal: _"publicación automatizada en CI... descartada por ahora — con una única versión inicial no compensa el riesgo... se reconsidera si hay más versiones que publicar con frecuencia"_. Ese mismo ADR advertía la consecuencia: _"no hay ninguna garantía automática de que lo que está en `main` coincide con lo último publicado en npm"_.

Desde entonces se creó el ruleset `protect-main` (tarea de endurecimiento de seguridad, 2026-08-17): `bypass_actors: []`, `current_user_can_bypass: "never"` — ni el propio owner puede saltárselo, por decisión explícita del usuario (en un repo de un único colaborador, un bypass permanente para el admin no protege nada de verdad). Cualquier automatización de release tiene que operar dentro de esa regla, sin pedir una excepción a ella.

## Decisión

**`release-please`** (`googleapis/release-please-action@v4`), en modo _manifest_ con un único componente `apps/server` (`release-please-config.json` + `.release-please-manifest.json`, versión inicial `0.1.0`, coincidiendo con la ya publicada). Al hacer _path-scoping_ sobre `apps/server`, los commits que solo tocan `apps/dashboard` o `docs/` no entran en el cálculo de versión del paquete publicado.

Su modelo — abrir/actualizar una "Release PR" con el version bump y el changelog calculados a partir de Conventional Commits, en vez de pushear directo a `main` — encaja con el ruleset sin bypass: la Release PR pasa por el mismo circuito de PR + check `ci` obligatorio que cualquier otro cambio.

`bump-minor-pre-major: true`: AGENTS.md §10 (canon compartido) fija `feat`→minor sin excepción de "major 0"; el comportamiento por defecto de release-please en versiones 0.x es tratar `feat` como patch mientras no se llegue a 1.0.0, así que hay que forzar esta opción para que el bump real cumpla lo ya documentado. `bump-patch-for-minor-pre-major` se deja en su valor por defecto (`false`), que ya mantiene `fix`→patch.

Changelog generado por defecto en `apps/server/CHANGELOG.md` (sin `skip-changelog`) y tag sin prefijo de componente (`include-component-in-tag: false`), para seguir el mismo formato que el tag `v0.1.0` ya existente en el repo.

El workflow (`release-please.yml`) tiene dos jobs encadenados por `needs`/`outputs` en el mismo fichero: `release-please` (abre/actualiza la Release PR) y `publish` (solo si `release_created`, hace checkout del tag recién creado, `pnpm install --frozen-lockfile`, `pnpm run build` de raíz — el build de `apps/server` no es aislado, depende de que `apps/dashboard/dist` ya exista —, `pnpm test`, y `npm publish --provenance`).

La action de `release-please` usa un **PAT dedicado** (`RELEASE_PLEASE_TOKEN`, secret del repo, fine-grained, scoped a este repo, permisos `Contents` + `Pull requests` en lectura/escritura, con expiración), nunca el `GITHUB_TOKEN` por defecto: los eventos generados con el `GITHUB_TOKEN` no disparan otros workflows (restricción anti-recursión de Actions), así que la Release PR nunca activaría el check `ci` — y sin bypass posible en el ruleset, quedaría bloqueada para siempre. La publicación real usa `NPM_TOKEN` (automation token de npmjs.com — el flujo de publish clásico exige 2FA interactivo por llave WebAuthn, incompatible con un entorno de CI, ya documentado en el cierre de la Fase 9). Ambos secretos los crea y rota el usuario manualmente; no los gestiona ni los ve Claude Code.

## Alternativas consideradas

- **`semantic-release`**: descartada — su plugin de git necesita hacer push directo del commit de version bump/changelog a `main`, incompatible con un ruleset sin bypass ni para el owner.
- **`GITHUB_TOKEN` por defecto en `release-please-action`**: descartada — no dispara `ci.yml` al abrir la Release PR, que quedaría bloqueada de forma permanente bajo el ruleset actual.
- **`skip-changelog`**: descartada — no generar nada es más simple que configurar activamente que no se genere, y no hay ningún changelog previo que preservar o migrar.
- **Auto-merge de la Release PR**: descartada/diferida — mergearla dispara un `npm publish` real e irreversible; se mantiene como paso deliberado del usuario, no automatizado.

## Consecuencias

- Publicar una nueva versión ya no requiere ninguna intervención manual del usuario en npm o en la terminal — solo revisar y mergear la Release PR cuando decida que toca release.
- A cambio, hay dos secretos nuevos con capacidad real de publicar en el registro público y de escribir en el repo, que hay que proteger y rotar: el PAT `RELEASE_PLEASE_TOKEN` caduca (a diferencia de un `GITHUB_TOKEN`) y requiere mantenimiento manual periódico sin alerta automática.
- El changelog automático en `apps/server/CHANGELOG.md` es una superficie más a revisar en cada Release PR antes de mergear.
- El bump de versión sigue dependiendo por completo de la disciplina de Conventional Commits ya exigida por commitlint — un commit mal tipado (`feat` etiquetado como `fix`, por ejemplo) se traduce directamente en un bump incorrecto sin ninguna revisión humana adicional salvo la propia lectura de la Release PR.

---

Un ADR es atómico e inmutable: registra una decisión, no se edita después. Si la decisión cambia, se crea un ADR nuevo que la sustituye (`Superseded by`) y se actualiza el `Estado` de este a `Superseded by [ADR-NNNN]`, dejando el razonamiento original intacto y consultable.
