# Historical import on staging

Run from the backend repository root after deploying this code and the workbook in `docs/`:

```sh
npm ci --include=dev
npm run db:generate
npm run test:historical-observations
node -r dotenv/config -e 'const u = new URL(process.env.DATABASE_URL); console.log({ host: u.hostname, database: u.pathname.slice(1) })'
npx prisma migrate status
npm run import:historical-observations -- --dry-run
node -e 'const r = require("./docs/historical-import/latest-dry-run.json"); const blocked = Object.values(r.records).flat().filter(x => ["BLOCKED", "CONFLICT"].includes(x.decision)); console.log({ database: r.database, observations: r.counts.Observation, blocked: blocked.length, error: r.error }); if (r.database !== "AVAILABLE" || r.error || blocked.length) process.exit(1)'
```

The importer reads `docs/Detalle de observaciones históricas - BD Observaciones - informes - riesgos asociados.xlsx` by default. It uses `DATABASE_URL` from the backend environment and writes `docs/historical-import/latest-dry-run.md` and `.json`. Confirm the URL targets staging and review the dry run before executing. A previous execution stopped partway through, so a repeat run must reuse the rows already present and plan only missing rows. The importer aborts on blocked or conflicting records.

After reviewing the dry run and taking a staging database backup:

```sh
npm run import:historical-observations -- --execute
npm run import:historical-observations -- --dry-run
node -e 'const r = require("./docs/historical-import/latest-dry-run.json"); const pending = Object.values(r.counts).reduce((n, c) => n + (c.CREATE || 0), 0); console.log({ database: r.database, pending, error: r.error }); if (r.database !== "AVAILABLE" || r.error || pending) process.exit(1)'
```

Review `docs/historical-import/latest-execution.md` and `.json` for any error and the final counts. Rerun the dry run to confirm the remaining create counts are zero. Do not run `db:seed` for this import.
