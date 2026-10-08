# Historical import on staging

Run from the backend repository root after deploying this code and the workbook in `docs/`. The importer updates matching reports and replaces matching observations from Excel. It removes observations absent from a report that appears in the workbook. Replacing an observation also removes its existing child records and rebuilds the historical risks, assignments, plans, and comments from Excel. Reports outside the workbook and existing user roles remain in the database. Stop staging processes that write to the affected reports during import.

```sh
npm ci --include=dev
npm run db:generate
npm run test:historical-observations
node -r dotenv/config -e 'const u = new URL(process.env.DATABASE_URL); console.log({ host: u.hostname, database: u.pathname.slice(1) })'
npx prisma migrate status
npm run import:historical-observations -- --dry-run
node -e 'const r = require("./docs/historical-import/latest-dry-run.json"); const blocked = Object.values(r.records).flat().filter(x => ["BLOCKED", "CONFLICT"].includes(x.decision)); console.log({ database: r.database, observations: r.counts.Observation, blocked: blocked.length, error: r.error }); if (r.database !== "AVAILABLE" || r.error || blocked.length) process.exit(1)'
```

The importer reads the tracked historical workbook in `docs/` by default. It uses `DATABASE_URL` from the backend environment and writes `docs/historical-import/latest-dry-run.md` and `.json`. Confirm the URL targets staging and review the dry run before executing. The report shows creates, updates, and deletions; it must have no blocked or conflicting records. The importer aborts on blocked or conflicting records. Take a staging database backup before executing: replacement removes existing observation child records, including progress and evidence records, before rebuilding the historical data from Excel.

After reviewing the dry run:

```sh
npm run import:historical-observations -- --execute
npm run import:historical-observations -- --dry-run
node -e 'const r = require("./docs/historical-import/latest-dry-run.json"); const pending = Object.values(r.counts).reduce((n, c) => n + (c.CREATE || 0) + (c.UPDATE || 0) + (c.DELETE || 0), 0); console.log({ database: r.database, pending, error: r.error }); if (r.database !== "AVAILABLE" || r.error || pending) process.exit(1)'
```

Review `docs/historical-import/latest-execution.md` and `.json` for any error and the final counts. Rerun the dry run to confirm the remaining create, update, and delete counts are zero. Do not run `db:seed` for this import.
