# SQL Server migration test results

Updated 2026-10-15. No existing database was contacted. Integration checks used disposable SQL Server 2022 and MySQL 8.4 containers with no persistent volumes; schema-only commands used a dummy URL.

## Local checks

| Check                                                                                         | Result  | Notes                                                                                             |
| --------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------- |
| Prisma schema validation                                                                      | PASS    | `npm run db:validate`                                                                             |
| Prisma client generation                                                                      | PASS    | `npm run db:generate`                                                                             |
| TypeScript typecheck                                                                          | PASS    | `npm run typecheck`                                                                               |
| ESLint                                                                                        | PASS    | `npm run lint`                                                                                    |
| Backend build                                                                                 | PASS    | `npm run build`                                                                                   |
| Historical observation importer tests                                                         | PASS    | 23/23 passed                                                                                      |
| Backend unit tests                                                                            | PARTIAL | 135/136 passed; the PDF test could not launch Chromium in the sandbox. No tests were skipped.     |
| JSON serialization/parsing and enum boundary tests                                            | PASS    | Included in the backend unit suite.                                                               |
| Transfer helper batching, row hashing, Boolean normalization, and insert-only resume behavior | PASS    | Included in the backend unit suite; no database connection.                                       |
| Production admin-seed credential guard                                                        | PASS    | Unit-tested; production seed execution was not run.                                               |
| Migration archive comparison                                                                  | PASS    | All 15 archived SQL files byte-match the source Git revision.                                     |
| Active migration MySQL syntax scan                                                            | PASS    | Zero matches for the scanned MySQL-only constructs.                                               |
| Prisma schema vs. final migration object-name comparison                                      | PASS    | 49 tables, 532 columns, 263 keys/indexes, and 93 foreign keys match by name in static comparison. |
| `npm ls --depth=0`                                                                            | PASS    | Direct dependencies resolve; `mysql2` is a dev dependency for the optional transfer script.       |
| Repository-wide Prettier check                                                                | PARTIAL | Changed files are formatted; eight unchanged files already fail the repository check.             |
| SQL Server migration replay, no-pending check, and schema drift                               | PASS    | 15/15 migrations; second deploy had no pending work; Prisma diff reported no difference.          |
| Main, demo, role-user, and admin seeders                                                      | PASS    | Ran on disposable SQL Server data; reruns succeeded.                                              |
| Synthetic MySQL-to-SQL Server transfer                                                        | PASS    | 49 tables, 93 source/target FK checks, six rows reconciled; `--resume` passed.                    |
| Better Auth credential sign-in                                                                | PASS    | Temporary SQL Server-backed session was deleted after the check.                                  |
| Prisma CRUD round trips                                                                       | PASS    | Unicode, SQL `DATE`, `BIT`, `NVARCHAR(MAX)` JSON, nested nulls, and nullable fields.              |

The failing PDF test is `src/modules/reports/reports.pdf.test.ts`: Puppeteer could not launch its bundled Chromium process in this execution environment. The suite was run with Node's `--import tsx` runner; its original `tsx --test` command initially hit an `EPERM` while creating TSX's local IPC pipe, so the package test script now uses the same Node import pattern already used by the historical importer test command.

The static object-name comparison checks names only; the separate live Prisma diff reported no schema difference on SQL Server. The repository-wide Prettier check still reports these eight unchanged files:

- `src/emails/templates/email-verification-email.ts`
- `src/emails/templates/password-reset-email.ts`
- `src/jobs/deadline-monitor/deadline-reminder.policy.ts`
- `src/modules/configuration/configuration.service.ts`
- `src/modules/configuration/configuration.validators.ts`
- `src/modules/dashboard/dashboard.service.ts`
- `src/modules/dashboard/dashboard.types.ts`
- `src/modules/reports/reports.service.ts`

## SQL Server integration ledger

| Required verification                                                               | Result                                                                                                         |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| SQL Server 2022+ disposable instance                                                | PASS; official container ran under amd64 emulation with no persistent volume.                                  |
| Fresh database creation and 15-migration clean replay                               | PASS; all 15 applied to an empty SQL Server database.                                                          |
| Second `migrate deploy` and no-pending status                                       | PASS; second deploy reported no pending migrations.                                                            |
| Final Prisma-to-database drift comparison                                           | PASS; live `migrate diff --exit-code` reported no difference.                                                  |
| Main/demo/admin/role seed execution and rerun                                       | PASS; seeders ran against disposable SQL Server databases.                                                     |
| Better Auth sign-in and representative Prisma CRUD                                  | PASS; direct credential sign-in plus insert/read/delete smoke checks.                                          |
| MySQL-to-SQL Server transfer and resume reconciliation                              | PASS on synthetic data; 49 tables, 93 FK checks per side, six rows compared, then `--resume` reconciled again. |
| Full API, reporting, and background-job integration                                 | NOT RUN end-to-end; unit tests, direct auth, seeding, and representative database CRUD passed.                 |
| Concurrency, deadlock, rollback under load, and production backup/restore rehearsal | NOT RUN.                                                                                                       |
| Production MySQL data and external evidence/object-storage reconciliation           | NOT RUN; transfer used synthetic data and did not validate business data volume or external assets.            |

The disposable runs establish migration replay, schema parity, seeding, auth, representative CRUD, and synthetic transfer behavior. Production cutover still requires a tested source copy, external asset reconciliation, and a verified backup/restore rehearsal.
