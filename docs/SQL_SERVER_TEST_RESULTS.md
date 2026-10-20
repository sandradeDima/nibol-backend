# Resultados de las pruebas de migración de SQL Server

Actualizado el 2026-10-15. No se contactó ninguna base de datos existente. Las verificaciones de integración usaron contenedores desechables de SQL Server 2022 y MySQL 8.4, sin volúmenes persistentes; los comandos de validación del esquema usaron una URL ficticia.

## Verificaciones locales

| Verificación                                                                                         | Resultado  | Notas                                                                                             |
| --------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------- |
| Validación del esquema Prisma                                                                      | Correcto    | `npm run db:validate`                                                                             |
| Generación del cliente Prisma                                                                      | Correcto    | `npm run db:generate`                                                                             |
| Verificación de tipos de TypeScript                                                                          | Correcto    | `npm run typecheck`                                                                               |
| ESLint                                                                                        | Correcto    | `npm run lint`                                                                                    |
| Compilación del backend                                                                                 | Correcto    | `npm run build`                                                                                   |
| Pruebas del importador de observaciones históricas                                                         | Correcto    | 23/23 aprobadas                                                                                  |
| Pruebas unitarias del backend                                                                            | Parcial | 135 de 136 pasaron; la prueba de PDF no pudo iniciar Chromium en el entorno aislado. No se omitieron pruebas.     |
| Pruebas de serialización/análisis JSON y límites de enum                                            | Correcto    | Incluidas en la suite de pruebas unitarias del backend.                                                               |
| Agrupación de lotes, hash de filas, normalización booleana y reanudación de solo inserción de la transferencia | Correcto    | Incluidas en la suite de pruebas unitarias del backend; no se conectó a ninguna base de datos.                                       |
| Protección de credenciales de semilla administrativa en producción                                                        | Correcto    | Verificado con pruebas unitarias; no se ejecutó la carga de semillas en producción.                                               |
| Comparación del archivo de migraciones                                                                  | Correcto    | Los 15 archivos SQL archivados coinciden byte por byte con la revisión de origen de Git.                                     |
| Búsqueda de sintaxis de MySQL en migraciones activas                                                            | Correcto    | No se encontraron las construcciones exclusivas de MySQL analizadas.                                               |
| Comparación de nombres de objetos entre el esquema Prisma y la migración final                                      | Correcto    | La comparación estática confirma coincidencias de nombre en 49 tablas, 532 columnas, 263 claves/índices y 93 claves foráneas. |
| `npm ls --depth=0`                                                                            | Correcto    | Las dependencias directas se resolvieron; `mysql2` es una dependencia de desarrollo para el script opcional de transferencia.       |
| Verificación general de Prettier del repositorio                                                                | Parcial | Los archivos modificados tienen el formato correcto; ocho archivos sin cambios ya fallaban esta verificación del repositorio.             |
| Aplicación de migraciones de SQL Server, verificación de pendientes y diferencias de esquema                               | Correcto    | 15/15 migraciones; la segunda implementación no dejó pendientes y Prisma no informó diferencias. |
| Semillas principal, de demostración, de roles/usuarios y de administrador                                                      | Correcto    | Se ejecutaron en datos desechables de SQL Server; las repeticiones finalizaron correctamente.                                              |
| Transferencia sintética de MySQL a SQL Server                                                        | Correcto    | 49 tablas, 93 verificaciones de claves foráneas, seis filas conciliadas; `--resume` finalizó correctamente. |
| Inicio de sesión de Better Auth con credenciales                                                                | Correcto    | La sesión temporal respaldada por SQL Server se eliminó después de la verificación.                                  |
| Operaciones CRUD de ida y vuelta de Prisma                                                                       | Correcto    | Unicode, SQL `DATE`, `BIT`, JSON `NVARCHAR(MAX)`, valores nulos anidados y campos anulables.              |

La prueba de PDF que falló es `src/modules/reports/reports.pdf.test.ts`: Puppeteer no pudo iniciar el proceso de Chromium incluido en este entorno. La suite se ejecutó con el ejecutor `--import tsx` de Node; el comando original `tsx --test` encontró inicialmente un error `EPERM` al crear la tubería IPC local de TSX, por lo que el script del paquete ahora usa el mismo patrón de importación de Node que ya utiliza el comando de prueba del importador histórico.

La comparación estática de nombres de objetos solo verifica los nombres; la comparación independiente del esquema Prisma en vivo no detectó diferencias en SQL Server. La verificación general de Prettier aún informa problemas en estos ocho archivos sin cambios:

- `src/emails/templates/email-verification-email.ts`
- `src/emails/templates/password-reset-email.ts`
- `src/jobs/deadline-monitor/deadline-reminder.policy.ts`
- `src/modules/configuration/configuration.service.ts`
- `src/modules/configuration/configuration.validators.ts`
- `src/modules/dashboard/dashboard.service.ts`
- `src/modules/dashboard/dashboard.types.ts`
- `src/modules/reports/reports.service.ts`

## Registro de integración de SQL Server

| Verificación requerida                                                               | Resultado                                                                                                         |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| SQL Server 2022+ disposable instance                                                | Correcto; el contenedor oficial se ejecutó mediante emulación amd64 y sin volumen persistente.                                  |
| Fresh database creation and 15-migration clean replay                               | Correcto; se aplicaron las 15 en una base de SQL Server vacía.                                                          |
| Second `migrate deploy` and no-pending status                                       | Correcto; la segunda implementación no dejó migraciones pendientes.                                                            |
| Final Prisma-to-database drift comparison                                           | Correcto; la comparación en vivo `migrate diff --exit-code` no detectó diferencias.                                                  |
| Main/demo/admin/role seed execution and rerun                                       | Correcto; los seeders se ejecutaron en bases de datos desechables de SQL Server.                                                     |
| Better Auth sign-in and representative Prisma CRUD                                  | Correcto; inicio de sesión directo con credenciales y verificaciones básicas de inserción, lectura y eliminación.                                          |
| MySQL-to-SQL Server transfer and resume reconciliation                              | Correcto con datos sintéticos; se compararon 49 tablas, 93 claves foráneas por lado y seis filas; luego `--resume` volvió a conciliarlas. |
| Full API, reporting, and background-job integration                                 | No se ejecutó de extremo a extremo; pasaron las pruebas unitarias, la autenticación directa, la carga de semillas y operaciones CRUD representativas en la base.                 |
| Concurrency, deadlock, rollback under load, and production backup/restore rehearsal | No ejecutado.                                                                                                       |
| Production MySQL data and external evidence/object-storage reconciliation           | No se ejecutó; la transferencia usó datos sintéticos y no validó el volumen de datos de negocio ni los archivos externos.            |

Las ejecuciones desechables confirman la aplicación de migraciones, la paridad del esquema, la carga de semillas, la autenticación, operaciones CRUD representativas y el comportamiento de una transferencia sintética. La transición a producción aún exige probar una copia del origen, conciliar los archivos externos y verificar un ensayo de copia de seguridad y restauración.
