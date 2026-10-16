# NIBOL QA Results

Audit date: 2026-10-16
Backend branch: `feat/sql-server-support`
Frontend branch: `main`

## Summary

Source-level and automated unit verification completed. SQL Server-backed integration and browser walkthroughs are **BLOCKED** because no safe isolated database, seeded users, or browser session was available. No production/live database was queried or modified. The full backend suite has one environment failure in Puppeteer's PDF browser launch.

All backend commands that may initialize Prisma used a process-only dummy `DATABASE_URL` pointing to localhost. No migration, seed, transfer, database reset, or DB mutation command was run.

## Backend checks

Working directory: `backend/` on `feat/sql-server-support`.

| Command | Result | Notes |
| --- | --- | --- |
| `DATABASE_URL='sqlserver://localhost:1433;databaseName=nibol_test;user=codex;password=codex_test_only;encrypt=false' npm run typecheck` | PASS | Prisma Client 7.8.0 generated, then TypeScript completed without errors. |
| `DATABASE_URL='sqlserver://localhost:1433;databaseName=nibol_test;user=codex;password=codex_test_only;encrypt=false' npm run lint` | PASS | Previously completed with no lint errors. |
| `DATABASE_URL='sqlserver://localhost:1433;databaseName=nibol_test;user=codex;password=codex_test_only;encrypt=false' npm run db:validate` | PASS | Prisma SQL Server schema validation completed. |
| `npm ls --depth=0` | PASS | Dependency tree resolved, including `@prisma/adapter-mssql@7.8.0` and Prisma 7.8.0. |
| `DATABASE_URL='sqlserver://localhost:1433;databaseName=nibol_test;user=codex;password=codex_test_only;encrypt=false' npm run build` | PASS | Prisma generation, TypeScript build, and report-font copy completed. Generated `dist/` output was cleaned after verification. |
| `DATABASE_URL='sqlserver://localhost:1433;databaseName=nibol_test;user=codex;password=codex_test_only;encrypt=false' node --import tsx --test src/services/authorization-scope.test.ts src/modules/extension-requests/*.test.ts src/modules/progress/*.test.ts src/modules/workflows/workflow-runtime.test.ts` | PASS | 23 regression-focused tests passed. |
| `DATABASE_URL='sqlserver://localhost:1433;databaseName=nibol_test;user=codex;password=codex_test_only;encrypt=false' npm test` | FAIL (environment) | 146 tests total; 145 passed, 1 failed. `reports.pdf.test.ts` could not launch Puppeteer (`Code: null`, empty stderr). The failure is unrelated to the tested permission/workflow contracts. |
| `git diff --check` | PASS | Run after the audit documents and source edits. |

Regression coverage includes the 178-permission grant/revoke contract, built-in role scopes and uniqueness, direct custom-role assignment scope, evidence/history permission boundaries, task-based queue scope, extension effective-date behavior, finalization's 100% threshold, pending approval state, and correction unlinking.

## Frontend checks

Working directory: `frontend/` on `main`.

| Command | Result | Notes |
| --- | --- | --- |
| `npm run typecheck` | PASS | Completed after UI permission gates and history panels were updated. |
| `npm run lint` | PASS with warnings | No errors; two existing warnings remain in `admin-shell.tsx` and `action-plan-detail.tsx`. |
| `npm run build` | PASS | A first attempt could not fetch Google Fonts in the restricted network environment. The retry compiled and statically generated 52 pages successfully. Next.js also noted that the workspace root was inferred from multiple lockfiles. |
| Browser UI walkthrough | BLOCKED | No browser tab/session or test login was available. |

Existing uncommitted frontend work was preserved. The frontend permission catalog comparison reported 178 backend permissions and 178 frontend editor permissions, with no missing or extra code.

## Roles and screens exercised

- Built-in role definitions and permission grants were inspected statically: `SYSTEM_ADMIN`, `AUDITOR`, `AUDIT_CHIEF`, `PROCESS_OWNER`, `AREA_RESPONSIBLE`, and `EXECUTOR`.
- Custom grant/revoke and scoped-assignment behavior was exercised through authorization unit fixtures, not live custom-role accounts.
- No role was logged into the application. No dashboard, editor, workflow queue, or detail screen was manually/browser tested.

## E2E and database scenarios

Status: **BLOCKED**, not passed. The workspace did not provide an isolated SQL Server database with seeded observations, action plans, extension classifications, workflow definitions, users, and roles. The following acceptance cases remain to be run in that environment: 80%/100% progress submissions; finalization approval/return; extension request, multi-area queue, later workflow stages and rejection; custom requester/reviewer roles; permission revocation via direct API; cross-area denial; duplicate task/notification checks; and persisted history/audit verification.

## Deployment notes and risks

- No schema or migration changes were made or required by these fixes.
- SQL Server adapter/dependency integrity, Prisma schema validation, backend build, and backend typecheck passed on `feat/sql-server-support`.
- Frontend changes are on `main`, as requested. Deploy the frontend `main` revision containing these UI gates alongside the backend branch if both sides are needed.
- Do not treat the one Puppeteer PDF test failure as a product regression; it needs a CI/runtime with a launchable Chromium browser to verify.
- Before deployment, run the blocked workflow acceptance cases against an isolated SQL Server environment. Live custom roles, persisted role rows, current workflow configuration, and notification idempotency were not inspected here.
