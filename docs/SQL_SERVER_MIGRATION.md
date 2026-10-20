# Migración a SQL Server

Actualizado el 2026-10-15. Esta rama adapta el backend a Microsoft SQL Server 2022+ y conserva el historial original de migraciones de MySQL; también incluye un comando independiente para transferir datos. No se contactó ninguna base de datos existente; las verificaciones de integración se realizaron en contenedores desechables.

## Estado

**PARCIAL.** La cadena de 15 migraciones, la segunda implementación, la comparación del esquema en vivo, todas las rutas de siembra, el inicio de sesión de Better Auth, operaciones CRUD representativas de Prisma y una transferencia sintética de MySQL a SQL Server se completaron correctamente en bases de datos desechables. Aún no se verificaron todas las API de la aplicación, el volumen de datos de producción, los archivos externos de evidencia ni la transición con copia de seguridad y restauración.

El backend permanece en la rama `feat/sql-server-support`, basada en `1b211e0`. No se modificó el repositorio del frontend.

## Inventario

- Prisma 7.8.0, TypeScript, Node.js y el generador `prisma-client`.
- 49 modelos Prisma. El esquema original declaraba 25 enums usados por 28 campos de modelo; el esquema de SQL Server los almacena como cadenas y elimina las declaraciones enum de Prisma.
- Los 18 campos JSON originales de los modelos se representan como `NVARCHAR(MAX)`. `toDatabaseJson` serializa JSON y rechaza valores no serializables; `parseDatabaseJson` analiza el JSON almacenado y puede aplicar un validador proporcionado por quien llama. Los DTO siguen exponiendo los valores analizados. La configuración de flujos de trabajo continúa usando sus validadores existentes.
- La migración inicial crea 47 tablas. Las migraciones restantes agregan dos tablas de dominio y conservan las transiciones históricas de esquema y datos.
- Las 15 migraciones históricas están tanto en el directorio activo como en el archivo de MySQL. El archivo coincide byte por byte con la revisión de origen.
- La semilla original contenía 37 instrucciones MySQL `ON DUPLICATE KEY UPDATE`; ahora son operaciones T-SQL `MERGE` de inserción o actualización. Las dos instrucciones `FOR UPDATE` de observaciones ahora usan las sugerencias de bloqueo `UPDLOCK`, `HOLDLOCK` y `ROWLOCK` de SQL Server. El resto del acceso de la aplicación sigue usando Prisma Client.

## Decisiones de conversión

- La fuente de datos de Prisma declara `sqlserver`; Prisma 7 registra el proveedor normalizado como `mssql` en `migration_lock.toml`. El cliente generado se conecta mediante `PrismaMssql` y el esquema `dbo`.
- Los valores enum de MySQL se conservan como mapas de literales TypeScript en `src/types/database-enums.ts`. `parseDatabaseEnum` verifica los valores en los límites de ejecución. Prisma expone estas columnas almacenadas como cadenas.
- Los valores JSON de la base de datos son cadenas y se decodifican antes de salir de los límites del servicio. SQL `NULL` se mantiene diferenciado del literal JSON `null`.
- Los campos de texto, fecha/hora, booleanos, enteros y binarios de MySQL se asignan, según corresponda, a `NVARCHAR`, `DATETIME2`, `DATE`, `BIT`, `INT`/`BIGINT` y `VARBINARY` de SQL Server.
- Las restricciones únicas anulables usan índices filtrados de SQL Server cuando se requiere, por ejemplo en claves de deduplicación de notificaciones/entregas y actividad, catálogos con claves anulables, versiones activas de flujos de trabajo y ampliaciones de plazo con planes de acción opcionales.
- El esquema de Prisma usa `NoAction` en las claves foráneas donde las reglas de cascada de SQL Server exigen limpieza desde la aplicación. La eliminación de relaciones observación-área y de nodos de flujos de trabajo conserva explícitamente el comportamiento previo de asignar `NULL`. El importador de observaciones históricas realiza la limpieza correspondiente antes de las eliminaciones permanentes.
- En producción se rechaza `trustServerCertificate=true` y se exige `encrypt=true`. Los certificados locales autofirmados están documentados en `.env.example`.
- `mysql2` permanece como dependencia de desarrollo únicamente para la utilidad opcional de transferencia única. No lo usan el backend en ejecución ni el adaptador Prisma.

## Migraciones históricas

Los 15 archivos de migración de origen se conservan en `prisma/migrations-mysql-archive/`. Cada migración activa mantiene el nombre y el orden de su directorio original. La base conserva el esquema inicial y las migraciones posteriores de SQL Server mantienen sus transformaciones de datos. La ampliación del enum de nodos de flujo de trabajo no requiere cambios SQL porque la base de SQL Server ya almacena el valor como cadena; el directorio de migración se conserva para mantener el orden histórico.

El análisis estático no encontró construcciones de migración de MySQL en la cadena activa. Las 15 migraciones también se aplicaron correctamente desde cero en SQL Server 2022; una segunda implementación no dejó trabajo pendiente y la comparación en vivo del esquema Prisma no detectó diferencias. Consulte [SQL_SERVER_MIGRATION_MATRIX.md](SQL_SERVER_MIGRATION_MATRIX.md) para ver cada conversión.

## Semillas y transferencia

- `npm run db:seed` instala los datos de referencia requeridos, los roles y permisos, la configuración, los flujos de trabajo canónicos y el administrador de inicio configurado. De forma predeterminada, excluye usuarios y observaciones de demostración.
- `npm run db:seed:demo` es opcional y está prohibido en producción.
- `npm run db:seed:roles` es una utilidad local para roles y cuentas de demostración; está prohibida en producción.
- La inicialización en producción exige definir explícitamente `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD`; nunca se crea allí la cuenta alternativa de desarrollo.
- `npm run db:transfer:mysql` realiza una importación independiente, de solo lectura y reanudable, de MySQL a SQL Server. Exige un destino vacío, salvo que se indique explícitamente `--resume`; transfiere ID y relaciones en lotes limitados, verifica las claves foráneas y los conteos de ambos lados, y compara cada fila transferida. Ejecútelo antes de las semillas porque sus operaciones de inserción o actualización pueden modificar filas canónicas. Consulte [SQL_SERVER_DATA_TRANSFER.md](SQL_SERVER_DATA_TRANSFER.md).
- La utilidad de transferencia no mueve archivos almacenados fuera de la base de datos; los archivos de evidencia y almacenamiento de objetos deben copiarse por separado, conservando sus referencias.

## Verificaciones completadas

| Verificación                                            | Resultado                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `prisma validate` con una URL ficticia de SQL Server   | Correcto                                                                         |
| `prisma generate` con una URL ficticia de SQL Server   | Correcto                                                                         |
| Verificación de tipos de TypeScript                    | Correcto                                                                         |
| ESLint                                                  | Correcto                                                                         |
| Compilación del backend                                 | Correcto                                                                         |
| Pruebas del importador de observaciones históricas     | 23 aprobadas                                                                     |
| Pruebas unitarias del backend                          | 135 aprobadas; 1 falló porque Puppeteer no pudo iniciar Chromium en el entorno aislado |
| Autocomprobaciones de transferencia/serialización/enum/semilla | Aprobadas como parte de la suite unitaria                                  |
| Búsqueda de sintaxis MySQL en migraciones activas        | Correcta; sin coincidencias                                                      |
| Comparación del archivo de migraciones MySQL            | Correcta; los 15 archivos coinciden byte por byte con la revisión de origen      |
| Reproducción SQL Server, segunda implementación y diferencias de esquema | Correcta; se reprodujeron 15 migraciones, la segunda implementación no tenía pendientes y no hubo diferencias |
| Semillas y repeticiones para datos principal/demo/admin/roles | Correctas en bases de datos desechables de SQL Server                      |
| Inicio de sesión de Better Auth y operaciones CRUD de Prisma | Correctos; la sesión temporal se eliminó después del inicio de sesión        |
| Transferencia sintética de MySQL y `--resume`           | Correcta; 49 tablas, 93 verificaciones de claves foráneas por lado y seis filas conciliadas |

Las verificaciones no cubren todas las rutas de API, el comportamiento con carga o concurrencia, el volumen real de datos de producción, los archivos externos de evidencia ni los procesos de copia de seguridad y restauración. Antes de planificar la transición a producción, revise [SQL_SERVER_TEST_RESULTS.md](SQL_SERVER_TEST_RESULTS.md).

## Referencias oficiales

- [Prisma ORM 7 SQL Server support and connection configuration](https://docs.prisma.io/docs/orm/v7/core-concepts/supported-databases/sql-server)
- [Prisma SQL Server schema reference](https://www.prisma.io/docs/orm/v7/reference/prisma-schema-reference)
- [Prisma partial-index support](https://docs.prisma.io/docs/orm/prisma-schema/data-model/indexes)
