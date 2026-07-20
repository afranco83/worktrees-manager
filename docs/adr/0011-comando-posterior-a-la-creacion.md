# 0011. Comando posterior a la creación (bootstrap automático por proyecto)

- **Estado**: Aceptada
- **Fecha**: 2026-07-18

## Contexto

Tras resolver la copia automática de `.env*` (ADR-0010), verificación manual con un worktree nuevo de `store_demo` seguía sin funcionar de extremo a extremo: `storefront` daba 500 al pedir productos porque `api` usa una base de datos SQLite local (Prisma, `DATABASE_URL="file:./dev.db"`) que no existe en un worktree recién creado — a diferencia de `.env` (config estática, copiar es siempre correcto), una base de datos con esquema versionado por migraciones no es segura de clonar a ciegas; lo correcto es recrearla con el comando del propio proyecto (`prisma migrate dev`).

El usuario planteó la pregunta de fondo: si cada worktree nuevo requiere un paso manual (migrar, seedear, generar un cliente...) para quedar realmente utilizable, la herramienta no cumple su promesa de automatizar el flujo.

## Decisión

Nuevo campo opcional `postCreateCommand` por **proyecto** (`projects.post_create_command`, `NULL` por defecto = no-op). Se ejecuta automáticamente **una sola vez**, justo tras crear cada worktree del proyecto (después de copiar sus `.env`, antes de devolver la respuesta de creación). Mismo principio que `devCommand`/su override por worktree (ADR-0009): texto libre que el usuario escribe con el comando de su propio proyecto — esta app no interpreta Prisma, Django, ni ningún ORM/framework, solo ejecuta el texto vía `execa` con `cwd` en el worktree nuevo.

**No fatal**: si el comando falla (código de salida ≠ 0), el worktree se crea igual — sigue siendo utilizable para editar código aunque el bootstrap no haya terminado. El resultado (stdout/stderr, y una línea final de éxito/fallo) se escribe como logs del propio worktree, visibles en "Ver logs" igual que el resto de su actividad — a diferencia de la copia de `.env` (que solo se loguea en el logger del servidor), aquí el fallo debe ser visible para el usuario sin que se pierda, porque indica que el entorno puede no estar realmente listo.

Configurable tanto al crear el proyecto como después, desde "Editar proyecto" — mismo campo, mismo sitio que `devCommand`.

## Alternativas consideradas

- **Copiar el fichero de base de datos tal cual** (como con `.env`): descartado — frágil (esquema desactualizado, ficheros bloqueados, datos a medio migrar) y no generalizable a bases de datos no basadas en fichero (Postgres/MySQL en un contenedor, por ejemplo). El comando del propio proyecto ya sabe resolver esto correctamente.
- **Detectar automáticamente el ORM/herramienta y ejecutar su comando de migración conocido**: descartado — reimplementaría, con matices por herramienta (Prisma, Drizzle, Django, Rails...), algo que varía demasiado como para automatizarlo sin que el usuario lo configure él mismo; mismo criterio ya aplicado en ADR-0009 para no construir detección de apps de un monorepo.

## Consecuencias

- `Project.postCreateCommand: string | null` es ahora un campo obligatorio del schema compartido; cualquier fixture de test que construya un `Project` a mano necesita incluirlo.
- Con `.env` (ADR-0010) + este comando configurados, un proyecto con bootstrap de base de datos puede quedar completamente automatizado de principio a fin al crear un worktree — sin pasos manuales, resolviendo la preocupación de fondo que motivó este ADR.

---

Un ADR es atómico e inmutable: registra una decisión, no se edita después. Si la decisión cambia, se crea un ADR nuevo que la sustituye (`Superseded by`) y se actualiza el `Estado` de este a `Superseded by [ADR-NNNN]`, dejando el razonamiento original intacto y consultable.
