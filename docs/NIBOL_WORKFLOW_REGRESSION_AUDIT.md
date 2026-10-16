# NIBOL Workflow Regression Audit

Audit date: 2026-10-16
Backend branch: `feat/sql-server-support`
Frontend branch: `main`

## Scope and evidence

This audit traced the progress/finalization and extension request paths through their service queries, workflow entity adapters, decision handling, and frontend status displays. The source-level regression mechanisms were identified and repaired. Pure unit tests cover the queue-scope builders, decision payloads, finalization threshold, and extension deadline calculation.

There is no safe SQL Server test database or seeded application session available in this workspace. The two reported production-like cases could not be replayed against persisted records, and browser acceptance flows could not be run. Results below distinguish verified unit behavior from blocked end-to-end acceptance.

## Regression A: finalization missing from Audit queue

### Root cause

The observation-closure workflow adapter marked a progress evaluation `APPROVED` on every intermediate `APPROVE` task action and wrote the history destination as `APPROVED`. The Audit review queue selects pending submissions with `reviewStatus: SENT_TO_AUDIT`, so an intermediate workflow approval removed a finalization submission from the queue before the workflow had reached its terminal result. The adapter also left the workflow instance linked after a correction return, which could prevent a clean retry.

### Repair

- Intermediate approval keeps the evaluation pending (`SENT_TO_AUDIT`) and records the intermediate history transition without prematurely updating the official action-plan values.
- Only successful workflow completion updates the action plan and observation, marks the evaluation approved, and changes the latest review-history destination to `APPROVED`.
- Correction/rejection returns the evaluation and clears its workflow instance link so a corrected submission can start a new workflow.
- Finalization still requires exactly 100% submitted progress.
- The queue scope includes exact active workflow task IDs for the assigned reviewer while retaining record-scope checks for ordinary queue entries.
- The review UI displays “Avance actual” and “Avance enviado” separately. A pending 80%/100% value can therefore differ from the official plan status without overwriting approved data.

### Paths affected

Executor submission → `progress.service` creates a `SENT_TO_AUDIT` evaluation → `OBSERVATION_CLOSURE` workflow task → scoped review queue → reviewer decision → workflow completion updates official plan/observation and history. A return sets `RETURNED`, unlinks the old instance, and permits correction/resubmission.

### Verification

| Check | Result | Evidence |
| --- | --- | --- |
| Finalization requires 100%; 80%, 99%, and null are rejected by the helper | PASS | `workflow-runtime.test.ts`: `finalization approvals remain in Audit until the workflow completes` |
| Intermediate approval payload stays pending; correction returns and unlinks | PASS | Same decision-payload test |
| Assigned workflow task ID is included in the progress queue scope | PASS | `progress.cleanup.test.ts`: `progress review scope adds only the assigned workflow evaluation` |
| Actual 80% submission, 100% submission, finalization approval, and return against SQL Server records | BLOCKED | No safe seeded SQL Server test database |
| Auditor browser walkthrough, counts, notifications, and persisted history | BLOCKED | No browser session/test users were available |

## Regression B: extension requests missing from Area Responsible queue

### Root cause

The extension list combined the normal request record scope and the reviewer queue conditions as conjunctive filters. As a result, a valid area reviewer or active workflow assignee could still be excluded when the request did not independently satisfy that user's normal record scope. The legacy responsibility predicate also needed to include observation multi-area assignments consistently for queue and detail lookup. Separately, request creation enforced `responsibleUserId === currentUser` even when another in-scope user had `deadline_extensions.request`, contradicting the permission contract.

The queue already filters legacy requests to `SENT_TO_MANAGER`; drafts are intentionally excluded. The repair does not expose drafts to approvers.

### Repair

- Extension queue visibility unions the user's normal record scope, legacy area-responsible scope (including observation area assignments), and exact active workflow task IDs. The task-ID path is tied to tasks assigned to that user and does not make unrelated records visible.
- Reviewer detail lookup uses the active assigned task or the same legacy responsibility scope before returning the request.
- Request creation now requires `deadline_extensions.request` and in-scope access to the plan, without a hardcoded executor-role/identity requirement.
- A workflow intermediate approval leaves the extension in `SENT_TO_MANAGER`, keeps `finalApprovedAt` null, and does not change the effective deadline. The proposal applies only when the workflow completes successfully.
- A correction sets the request back to `DRAFT` and clears the old workflow instance; rejection leaves the original deadline in force.

### Paths affected

Authorized in-scope requester → draft extension → submit to manager workflow → area-responsible/assigned task queue → configured subsequent approval stages → final completion applies the proposed deadline. Correction returns to draft; rejection does not change the deadline.

### Verification

| Check | Result | Evidence |
| --- | --- | --- |
| Queue includes exact assigned task IDs and area-assignment responsibility | PASS | `extension-requests.domain.test.ts`: `extension review scope includes only requests assigned to a workflow task` |
| Intermediate approval does not change the effective date | PASS | Same file: `intermediate manager approval does not change the effective deadline`; `workflow-runtime.test.ts`: `extension approvals stay pending until workflow completion` |
| Correction returns to draft and unlinks old workflow instance | PASS | Workflow decision-payload test |
| Area Responsible with multiple areas sees all and only matching persisted requests | BLOCKED | Query helper contract tested; no seeded SQL Server records to exercise Prisma integration |
| Custom requester submit, subsequent configured stages, rejection, notifications, and no duplicate tasks | BLOCKED | Requires safe database-backed workflow execution |

## Progress values and state

The submitted progress value belongs to a pending evaluation; the action plan's percentage/status represent the last approved value. The review UI labels the values separately (“Avance enviado” versus “Avance actual”), and the remediation detail shows the submitted value as “reportado.” Thus a pending 80% or 100% report alongside an official `No iniciado` state is a valid separation of proposed and approved values, provided no premature write occurs. The repaired workflow defers official writes until terminal approval.

## Remaining acceptance gaps

The source changes and unit contracts cover the identified regressions, but the task's database-backed scenarios are not fully accepted until run with isolated seeded SQL Server users and records. In particular, workflow task creation/assignment, API authorization under live custom roles, notification/audit uniqueness, all configured extension stages, and browser screen behavior remain unverified end to end.
