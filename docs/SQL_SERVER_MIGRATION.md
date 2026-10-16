# SQL Server migration

Updated 2026-10-15. This branch converts the backend to Microsoft SQL Server 2022+ while retaining the original MySQL migration history and providing a separate data-transfer command. No existing database was contacted; all integration checks used disposable containers.

## Status

**PARTIAL.** The 15-migration chain, second deploy, live schema diff, all seed paths, Better Auth sign-in, representative Prisma CRUD, and a synthetic MySQL-to-SQL Server transfer pass on disposable databases. Full application API coverage, production data volume, external evidence assets, and backup/restore cutover remain unverified.

The backend remains on branch `feat/sql-server-support`, based on `1b211e0`. The frontend repository was not modified.

## Inventory

- Prisma 7.8.0, TypeScript, Node.js, and the `prisma-client` generator.
- 49 Prisma models. The original schema declared 25 enums used by 28 model fields; the SQL Server schema stores these as strings and removes Prisma enum declarations.
- 18 original JSON model fields are represented as `NVARCHAR(MAX)`. `toDatabaseJson` serializes JSON and rejects non-serializable values; `parseDatabaseJson` parses stored JSON and can apply a caller-supplied validator. DTOs continue to expose parsed values. Workflow configuration continues through its existing workflow validators.
- The initial migration creates 47 tables. The remaining migrations add two domain tables and retain the historical schema/data transitions.
- 15 historical migrations are present in both the active directory and the MySQL archive. The archive matches the source revision byte-for-byte.
- The original seed contained 37 MySQL `ON DUPLICATE KEY UPDATE` statements; these are now T-SQL `MERGE` upserts. The two observation `FOR UPDATE` statements now use SQL Server `UPDLOCK`, `HOLDLOCK`, and `ROWLOCK` hints. Other application access remains Prisma Client based.

## Conversion choices

- The Prisma datasource declares `sqlserver`; Prisma 7 records the normalized provider as `mssql` in `migration_lock.toml`. The generated client connects through `PrismaMssql` and the `dbo` schema.
- MySQL enum values are retained as TypeScript literal maps in `src/types/database-enums.ts`. `parseDatabaseEnum` checks values at runtime boundaries. Prisma itself exposes these stored columns as strings.
- JSON database values are strings, decoded before they leave service boundaries. SQL `NULL` remains distinct from the JSON literal `null`.
- MySQL text, date/time, boolean, integer, and binary fields use SQL Server `NVARCHAR`, `DATETIME2`, `DATE`, `BIT`, `INT`/`BIGINT`, and `VARBINARY` mappings as appropriate.
- Nullable unique constraints use filtered SQL Server indexes where required, including notification/delivery dedupe keys, activity dedupe keys, catalogs with nullable keys, workflow active versions, and deadline extensions with optional action plans.
- The Prisma schema uses `NoAction` for foreign keys where SQL Server cascade rules require application-side cleanup. Observation-area removal and workflow-node removal preserve prior set-null behavior explicitly. The historical-observation importer performs the corresponding cleanup before hard deletes.
- Production rejects `trustServerCertificate=true` and requires `encrypt=true`. Local self-signed certificates are documented in `.env.example`.
- `mysql2` remains a development dependency only for the optional one-time transfer utility. It is not used by the running backend or Prisma adapter.

## Historical migrations

The 15 source migration files are preserved in `prisma/migrations-mysql-archive/`. Each active migration keeps its original directory name and order. The baseline preserves the original initial schema, and subsequent SQL Server migrations retain their data transformations. The workflow-node enum expansion is a SQL no-op because the SQL Server baseline already stores the value as a string; the migration directory remains in place to preserve history order.

Static scanning found no MySQL migration constructs in the active chain. All 15 migrations also passed a clean SQL Server 2022 replay, a second deploy with no pending work, and a live Prisma schema diff with no difference. See [SQL_SERVER_MIGRATION_MATRIX.md](SQL_SERVER_MIGRATION_MATRIX.md) for each conversion.

## Seeds and transfer

- `npm run db:seed` installs required reference data, roles/permissions, settings, canonical workflows, and the configured bootstrap administrator. Demo users and observations are excluded by default.
- `npm run db:seed:demo` is optional and prohibited in production.
- `npm run db:seed:roles` is a local role/demo-account helper and is prohibited in production.
- Production bootstrap requires explicit `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`; the development fallback account is never created in production.
- `npm run db:transfer:mysql` is a separate, read-only, resumable MySQL-to-SQL Server import. It requires an empty target unless `--resume` is explicitly supplied, transfers IDs and relationships in bounded batches, checks source/target foreign keys and counts, and compares every transferred row. Run it before seeds because seed upserts may update canonical rows. See [SQL_SERVER_DATA_TRANSFER.md](SQL_SERVER_DATA_TRANSFER.md).
- The transfer utility does not move files stored outside the database; evidence/object-storage assets need a separate copy that preserves references.

## Verification completed

| Check                                                   | Result                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `prisma validate` with a dummy SQL Server URL           | PASS                                                                            |
| `prisma generate` with a dummy SQL Server URL           | PASS                                                                            |
| TypeScript typecheck                                    | PASS                                                                            |
| ESLint                                                  | PASS                                                                            |
| Backend build                                           | PASS                                                                            |
| Historical-observation importer tests                   | 23 passed                                                                       |
| Backend unit tests                                      | 135 passed, 1 failed because Puppeteer could not launch Chromium in the sandbox |
| Transfer/serialization/enum/admin-seed self-checks      | Passed as part of the unit suite                                                |
| Active migration MySQL-syntax scan                      | PASS; zero matches                                                              |
| MySQL migration archive comparison                      | PASS; all 15 files byte-identical to the source revision                        |
| SQL Server replay, second deploy, and live schema drift | PASS; 15 migrations replayed, second deploy had no pending work, zero diff      |
| Main/demo/admin/role seeds and reruns                   | PASS on disposable SQL Server databases                                         |
| Better Auth sign-in and representative Prisma CRUD      | PASS; temporary session cleaned up after sign-in                                |
| Synthetic MySQL transfer and `--resume`                 | PASS; 49 tables, 93 FK checks per side, six rows reconciled                     |

The checks do not cover all API routes, load/concurrency behavior, actual production data volume, external evidence assets, or backup/restore. Review [SQL_SERVER_TEST_RESULTS.md](SQL_SERVER_TEST_RESULTS.md) before planning a production cutover.

## Official references

- [Prisma ORM 7 SQL Server support and connection configuration](https://docs.prisma.io/docs/orm/v7/core-concepts/supported-databases/sql-server)
- [Prisma SQL Server schema reference](https://www.prisma.io/docs/orm/v7/reference/prisma-schema-reference)
- [Prisma partial-index support](https://docs.prisma.io/docs/orm/prisma-schema/data-model/indexes)
