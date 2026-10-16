# SQL Server deployment

The backend targets SQL Server 2022 or newer and uses the `dbo` schema. Prisma supports SQL Server through `@prisma/adapter-mssql`; see [Prisma's SQL Server setup and connection-string reference](https://docs.prisma.io/docs/orm/v7/core-concepts/supported-databases/sql-server).

## Database and permissions

Create a dedicated database once through a DBA-approved SQL Server session. Confirm the target collation against the source MySQL database before creation; the repository does not record the source database collation. If the source uses case-insensitive and accent-insensitive comparisons, a SQL Server Windows collation with `_CI_AI` semantics is a candidate. For example:

```sql
CREATE DATABASE [NIBOL] COLLATE Latin1_General_100_CI_AI_SC;
```

SQL Server collation controls text comparison and ordering, so verify uniqueness and search behavior with real source data before choosing it. See [Microsoft's collation documentation](https://learn.microsoft.com/en-us/sql/relational-databases/collations/collation-and-unicode-support?view=sql-server-ver16).

Use a dedicated migration principal with permission to create/alter tables, indexes, constraints, and Prisma's `_prisma_migrations` table. Grant it `db_owner` only for migration operations if the organization does not use a narrower reviewed role. Use a separate application principal with data reader/writer access for normal runtime. Keep credentials outside Git.

Allow TCP traffic from the application host to the SQL Server listener (usually port 1433). Production connections must use a certificate trusted by the application host, `encrypt=true`, and no `trustServerCertificate=true`. SQL Server connection-string values containing `:`, `\\`, `=`, `;`, `/`, `[`, `]`, `{`, or `}` need the escaping documented by Prisma; do not paste unescaped secrets into shell history.

## Environment

Set `DATABASE_URL` to the target database and schema. For a local self-signed certificate only, `trustServerCertificate=true` is allowed when `NODE_ENV` is not `production`.

```sh
export DATABASE_URL='sqlserver://db-host:1433;database=NIBOL;schema=dbo;user=nibol_app;password={replace-me};encrypt=true'
export NODE_ENV=production
export SEED_ADMIN_EMAIL='platform-admin@example.com'
export SEED_ADMIN_PASSWORD='replace-with-a-secret-of-at-least-8-characters'
```

Production seeding requires explicit administrator email and password. Do not set the example password in production. For local setup, copy `.env.example` and replace its example values.

## Build and deploy

Run these commands from `backend/` after a backup and after the migration chain has passed on a disposable SQL Server 2022+ database:

```sh
npm ci
npm run db:validate
npm run db:generate
npm run build
npm run db:migrate:status
npm run db:migrate:deploy
npm run db:migrate:status
```

`db:migrate:deploy` applies the checked-in history and fails on migration errors. Production deployment must not use `db:migrate:dev`, `db:reset`, or `prisma db push`. This branch has no reset command in `package.json`.

For a new empty installation, install baseline reference/system data after migration:

```sh
npm run db:seed
```

Optional local/demo operations are separate:

```sh
npm run db:seed:demo
npm run db:seed:roles
npm run db:seed:admin
```

`db:seed:demo` and `db:seed:roles` are blocked in production. `db:seed:admin` reasserts the administrator role and credential and removes/recreates that role's permission links; run it only when that is intended. For an existing MySQL database, follow the ordering and seed-impact notes in [SQL_SERVER_DATA_TRANSFER.md](SQL_SERVER_DATA_TRANSFER.md) before running seeds.

## Backup and recovery

Take and verify a full backup before applying migrations or importing data. Prisma migrations are forward-only operational steps; there is no automatic SQL rollback. If a migration fails, stop the deployment, preserve the SQL Server error and `_prisma_migrations` state, and restore the pre-deployment backup or prepare a reviewed corrective migration. Do not drop or reset a database containing records as a recovery shortcut. Retain the MySQL source and its backup until application cutover, asset checks, and business reconciliation are signed off.

## Verification commands

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

The full migration chain, second deploy, live schema diff, and seed commands were verified on a disposable SQL Server 2022 instance. Production credentials, network policy, source collation, business-data reconciliation, and restore rehearsal still require environment-specific checks. See [SQL_SERVER_TEST_RESULTS.md](SQL_SERVER_TEST_RESULTS.md).
