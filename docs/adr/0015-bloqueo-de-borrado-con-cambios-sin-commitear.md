# 0015. Borrar un worktree con cambios sin commitear pasa de "forzable" a bloqueado sin excepción

- **Estado**: Aceptada
- **Fecha**: 2026-07-28

## Contexto

Desde la Fase 4, `DELETE /worktrees/:id` ya rechazaba (409, `WorktreeHasUncommittedChangesError`) un worktree con working-tree sucio, pero con una vía de escape: un query param `force` que reintentaba con `git worktree remove --force`, descartando esos cambios sin más. ADR-0012 (Fase 6) construyó el aviso de seguridad sobre esa base — hacer visible el riesgo _antes_ del intento, pero sin tocar el bypass en sí. En la práctica, el flujo era "avisa, y si el usuario insiste, borra igualmente" (botón "Forzar borrado" en `delete-worktree-step.tsx`).

Petición explícita del usuario: para cambios sin commitear (no para commits sin subir, riesgo distinto — ver ADR-0012 §Contexto, la rama sobrevive al borrado del worktree, así que unos commits ya hechos no se pierden aunque no estén publicados) quiere que el borrado quede bloqueado sin excepción — el usuario debe limpiar el árbol por su cuenta (commitear, descartar o guardar en un stash, a su criterio) antes de poder borrar, no que la app le ofrezca un atajo para perder ese trabajo sin querer.

Aparte, sin protagonismo en la petición pero relacionado: borrar un worktree cuyo entorno de dev está corriendo no paraba el proceso — el registro del worktree desaparecía de la base de datos pero el proceso hijo seguía vivo, sin worktree ni fila a la que asociarlo y sin forma de pararlo desde la UI.

## Decisión

**Sin bypass.** El query param `force` desaparece de `DELETE /worktrees/:id` (y del schema, y de la llamada del frontend) — `removeWorktree` se invoca siempre con `force: false`. `git worktree remove` (sin `--force`) sigue siendo quien decide si hay cambios sin commitear, igual que antes; lo único que cambia es que ya no hay una segunda llamada que lo eluda. En el frontend, `delete-worktree-step.tsx` ya no espera a que el borrado falle para enterarse: lee `worktree.gitStatus.hasUncommittedChanges` (ya disponible en el propio worktree) y deshabilita el botón "Borrar" con un mensaje explicativo desde el primer render del diálogo — el rechazo del backend sigue ahí como red de seguridad si ese dato está desactualizado (poll de 5s), no como el único mecanismo.

**Worktree corriendo → se para antes de borrar.** El propio endpoint de borrado comprueba `processStatus` y, si está `running`/`starting`, llama a `processManager.stop()` (esperando a que el proceso termine de verdad, no solo a que se envíe la señal) antes de tocar el directorio — evita el proceso huérfano descrito en el contexto. Un `WorktreeProcessNotRunningError` en ese paso (proceso que terminó por su cuenta justo en el hueco entre leer `processStatus` y llamar a `stop()`) se trata como éxito, no como fallo del borrado.

## Alternativas consideradas

- **Mantener `force` pero quitar el botón solo del frontend**: descartada — dejaría el bypass accesible por API directa, y el propio ADR-0012 ya advertía que la protección real vivía en el backend, no en la UI. Si el bloqueo es la decisión, tiene que ser imposible de eludir, no solo menos visible.
- **Aplicar el mismo bloqueo sin excepción a `hasUnpushedCommits`**: descartada — no es lo que pidió el usuario, y a diferencia de los cambios sin commitear, unos commits sin subir no se pierden al borrar el worktree (la rama sigue existiendo en el repositorio, ver ADR-0012). Es un riesgo real pero distinto; sigue como aviso, no como bloqueo.
- **Parar el proceso en el frontend antes de llamar a borrar** (un `stopWorktree.mutateAsync()` previo desde `delete-worktree-step.tsx`): descartada — dos peticiones en vez de una, con una ventana entre ambas en la que el estado podría cambiar; más simple y más correcto que el propio endpoint de borrado se encargue de su propia consistencia.

## Consecuencias

- Un worktree con cambios sin commitear ya no tiene ninguna forma de borrarse desde la app — si el usuario quiere descartar esos cambios a propósito, tiene que hacerlo él mismo (`git checkout .`, `git clean`, etc.) fuera del dashboard antes de volver a intentar borrar. Coherente con la petición explícita, pero es una regresión de conveniencia frente al comportamiento anterior para quien sí quería tirar esos cambios sin más.
- El borrado de un worktree corriendo tarda ahora lo que tarde `processManager.stop()` (espera a la salida real del proceso, no es instantáneo) — mismo coste que ya asumía el botón "Parar" explícito, ahora también pagado de forma implícita al borrar.
- El query param `force` desaparece de la API pública; cualquier integración externa que lo usara (ninguna conocida — herramienta de un único usuario local) dejaría de poder forzar el borrado.

---

Un ADR es atómico e inmutable: registra una decisión, no se edita después. Si la decisión cambia, se crea un ADR nuevo que la sustituye (`Superseded by`) y se actualiza el `Estado` de este a `Superseded by [ADR-NNNN]`, dejando el razonamiento original intacto y consultable.
