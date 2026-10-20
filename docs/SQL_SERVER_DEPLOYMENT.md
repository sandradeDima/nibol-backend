# Implementación de SQL Server

El backend funciona con SQL Server 2022 o posterior y usa el esquema `dbo`. Prisma admite SQL Server mediante `@prisma/adapter-mssql`; consulte la [configuración y referencia de cadenas de conexión de SQL Server de Prisma](https://docs.prisma.io/docs/orm/v7/core-concepts/supported-databases/sql-server).

## Base de datos y permisos

Cree una base de datos dedicada mediante una sesión de SQL Server aprobada por el DBA. Antes de crearla, compare la intercalación de destino con la base MySQL de origen; el repositorio no registra la intercalación de esa base. Si el origen compara sin distinguir mayúsculas ni acentos, puede considerar una intercalación de Windows de SQL Server con semántica `_CI_AI`. Por ejemplo:

```sql
CREATE DATABASE [NIBOL] COLLATE Latin1_General_100_CI_AI_SC;
```

La intercalación de SQL Server controla la comparación y el orden del texto; antes de elegirla, verifique la unicidad y las búsquedas con datos reales del origen. Consulte la [documentación de intercalaciones de Microsoft](https://learn.microsoft.com/en-us/sql/relational-databases/collations/collation-and-unicode-support?view=sql-server-ver16).

Use una cuenta dedicada para migraciones con permisos para crear y modificar tablas, índices, restricciones y la tabla `_prisma_migrations` de Prisma. Asígnele `db_owner` únicamente para las operaciones de migración si la organización no cuenta con un rol revisado más limitado. Para la ejecución normal, use otra cuenta de aplicación con permisos de lectura y escritura de datos. Mantenga las credenciales fuera de Git.

Permita tráfico TCP desde el host de la aplicación hasta el puerto de escucha de SQL Server (normalmente 1433). En producción, las conexiones deben usar un certificado confiable para el host de la aplicación y `encrypt=true`, sin `trustServerCertificate=true`. Los valores de la cadena de conexión que contengan `:`, `\\`, `=`, `;`, `/`, `[`, `]`, `{` o `}` requieren el escape documentado por Prisma; no pegue secretos sin escapar en el historial del shell.

## Entorno

Configure `DATABASE_URL` con la base de datos y el esquema de destino. `trustServerCertificate=true` se permite solo para certificados autofirmados locales cuando `NODE_ENV` no es `production`.

```sh
export DATABASE_URL='sqlserver://db-host:1433;database=NIBOL;schema=dbo;user=nibol_app;password={replace-me};encrypt=true'
export NODE_ENV=production
export SEED_ADMIN_EMAIL='platform-admin@example.com'
export SEED_ADMIN_PASSWORD='replace-with-a-secret-of-at-least-8-characters'
```

La carga de semillas en producción exige definir explícitamente el correo y la contraseña del administrador. No use la contraseña de ejemplo en producción. Para la configuración local, copie `.env.example` y reemplace sus valores de ejemplo.

## Compilación e implementación

Ejecute estos comandos desde `backend/` después de crear una copia de seguridad y de que la cadena de migraciones haya pasado en una base desechable de SQL Server 2022 o posterior:

```sh
npm ci
npm run db:validate
npm run db:generate
npm run build
npm run db:migrate:status
npm run db:migrate:deploy
npm run db:migrate:status
```

`db:migrate:deploy` aplica el historial incluido en el repositorio y falla si hay errores de migración. En producción no use `db:migrate:dev`, `db:reset` ni `prisma db push`. Esta rama no define un comando de reinicio en `package.json`.

En una instalación nueva y vacía, cargue los datos base del sistema y de referencia después de la migración:

```sh
npm run db:seed
```

Las operaciones locales y de demostración son independientes y opcionales:

```sh
npm run db:seed:demo
npm run db:seed:roles
npm run db:seed:admin
```

`db:seed:demo` y `db:seed:roles` están bloqueados en producción. `db:seed:admin` vuelve a aplicar el rol y las credenciales del administrador, y elimina y recrea los vínculos de permisos de ese rol; ejecútelo solo si eso es lo previsto. Para una base MySQL existente, antes de cargar semillas siga el orden y las notas sobre su impacto en [SQL_SERVER_DATA_TRANSFER.md](SQL_SERVER_DATA_TRANSFER.md).

## Copia de seguridad y recuperación

Cree y verifique una copia de seguridad completa antes de aplicar migraciones o importar datos. Las migraciones Prisma son operaciones que avanzan en una sola dirección; no existe una reversión SQL automática. Si una migración falla, detenga la implementación, conserve el error de SQL Server y el estado de `_prisma_migrations`, y restaure la copia previa a la implementación o prepare una migración correctiva revisada. No elimine ni reinicie una base con registros como atajo de recuperación. Conserve el origen MySQL y su copia de seguridad hasta aprobar la transición de la aplicación, las verificaciones de archivos y la conciliación del negocio.

## Comandos de verificación

```sh
npm run db:validate
npm run db:generate
npm run typecheck
npm run lint
npm run build
npm test
npm run test:historical-observations
npm run db:migrate:status
```

La cadena completa de migraciones, la segunda implementación, la comparación del esquema en vivo y los comandos de semillas se verificaron en una instancia desechable de SQL Server 2022. Aún se deben verificar las credenciales de producción, la política de red, la intercalación de origen, la conciliación de datos de negocio y el ensayo de restauración en cada entorno. Consulte [SQL_SERVER_TEST_RESULTS.md](SQL_SERVER_TEST_RESULTS.md).
