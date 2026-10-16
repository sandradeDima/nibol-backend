# NIBOL Permissions Audit

Audit date: 2026-10-16

## Scope and result

This source audit covers backend branch `feat/sql-server-support` and frontend branch `main`. The backend defines **178 unique permission codes**; the frontend role editor exposes **178**, with no missing or extra codes in the programmatic comparison. The backend catalog uniqueness and role assignment checks are covered by `authorization-scope.test.ts`.

The repository defines six built-in roles. These are source/seed defaults, not a live database inventory. Custom roles are database-configurable and their current names and grants could not be read without a safe SQL Server test database.

| Role code | Display name | Default grants |
| --- | --- | ---: |
| SYSTEM_ADMIN | Administrador del sistema | 178 |
| AUDITOR | Auditor | 37 |
| AUDIT_CHIEF | Jefe Auditor | 17 |
| PROCESS_OWNER | Dueño del proceso | 16 |
| AREA_RESPONSIBLE | Responsable de área | 22 |
| EXECUTOR | Ejecutor | 16 |

## Built-in role permission matrix

"✓" means the source-defined role grants the permission by default. Runtime custom grants can differ.

| Permission | Admin | Auditor | Jefe auditor | Dueño proceso | Resp. área | Ejecutor |
| --- | --- | --- | --- | --- | --- | --- |
| `users.view` | ✓ | — | ✓ | — | — | — |
| `users.create` | ✓ | — | — | — | — | — |
| `users.edit` | ✓ | — | — | — | — | — |
| `users.delete` | ✓ | — | — | — | — | — |
| `roles.view` | ✓ | — | — | — | — | — |
| `roles.create` | ✓ | — | — | — | — | — |
| `roles.edit` | ✓ | — | — | — | — | — |
| `roles.delete` | ✓ | — | — | — | — | — |
| `permissions.view` | ✓ | — | — | — | — | — |
| `permissions.create` | ✓ | — | — | — | — | — |
| `permissions.edit` | ✓ | — | — | — | — | — |
| `permissions.delete` | ✓ | — | — | — | — | — |
| `settings.view` | ✓ | — | — | — | — | — |
| `settings.create` | ✓ | — | — | — | — | — |
| `settings.edit` | ✓ | — | — | — | — | — |
| `settings.delete` | ✓ | — | — | — | — | — |
| `notifications.view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `notifications.create` | ✓ | — | — | — | — | — |
| `notifications.edit` | ✓ | — | — | — | — | — |
| `notifications.delete` | ✓ | — | — | — | — | — |
| `automatic_jobs.view` | ✓ | — | — | — | — | — |
| `automatic_jobs.create` | ✓ | — | — | — | — | — |
| `automatic_jobs.edit` | ✓ | — | — | — | — | — |
| `automatic_jobs.delete` | ✓ | — | — | — | — | — |
| `notification_rules.view` | ✓ | — | — | — | — | — |
| `notification_rules.create` | ✓ | — | — | — | — | — |
| `notification_rules.edit` | ✓ | — | — | — | — | — |
| `notification_rules.delete` | ✓ | — | — | — | — | — |
| `activity.view` | ✓ | — | — | — | — | — |
| `activity.create` | ✓ | — | — | — | — | — |
| `activity.edit` | ✓ | — | — | — | — | — |
| `activity.delete` | ✓ | — | — | — | — | — |
| `activity_logs.view` | ✓ | — | — | — | — | — |
| `activity_logs.create` | ✓ | — | — | — | — | — |
| `activity_logs.edit` | ✓ | — | — | — | — | — |
| `activity_logs.delete` | ✓ | — | — | — | — | — |
| `audit_logs.view` | ✓ | — | — | — | — | — |
| `audit_logs.create` | ✓ | — | — | — | — | — |
| `audit_logs.edit` | ✓ | — | — | — | — | — |
| `audit_logs.delete` | ✓ | — | — | — | — | — |
| `invitations.view` | ✓ | — | — | — | — | — |
| `invitations.create` | ✓ | — | — | — | — | — |
| `invitations.edit` | ✓ | — | — | — | — | — |
| `invitations.delete` | ✓ | — | — | — | — | — |
| `areas.view` | ✓ | — | ✓ | — | — | — |
| `areas.create` | ✓ | — | — | — | — | — |
| `areas.edit` | ✓ | — | — | — | — | — |
| `areas.delete` | ✓ | — | — | — | — | — |
| `risk_levels.view` | ✓ | — | — | — | — | — |
| `risk_levels.create` | ✓ | — | — | — | — | — |
| `risk_levels.edit` | ✓ | — | — | — | — | — |
| `risk_levels.delete` | ✓ | — | — | — | — | — |
| `observation_statuses.view` | ✓ | — | — | — | — | — |
| `observation_statuses.create` | ✓ | — | — | — | — | — |
| `observation_statuses.edit` | ✓ | — | — | — | — | — |
| `observation_statuses.delete` | ✓ | — | — | — | — | — |
| `system_parameters.view` | ✓ | — | — | — | — | — |
| `system_parameters.create` | ✓ | — | — | — | — | — |
| `system_parameters.edit` | ✓ | — | — | — | — | — |
| `system_parameters.delete` | ✓ | — | — | — | — | — |
| `catalogs.view` | ✓ | — | — | — | — | — |
| `catalogs.create` | ✓ | — | — | — | — | — |
| `catalogs.edit` | ✓ | — | — | — | — | — |
| `catalogs.delete` | ✓ | — | — | — | — | — |
| `products.view` | ✓ | — | — | — | — | — |
| `products.create` | ✓ | — | — | — | — | — |
| `products.edit` | ✓ | — | — | — | — | — |
| `products.delete` | ✓ | — | — | — | — | — |
| `observations.view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `observations.create` | ✓ | ✓ | — | — | — | — |
| `observations.edit` | ✓ | ✓ | — | — | — | — |
| `observations.delete` | ✓ | ✓ | — | — | — | — |
| `audit_reports.view` | ✓ | ✓ | — | — | — | — |
| `audit_reports.create` | ✓ | — | — | — | — | — |
| `audit_reports.edit` | ✓ | — | — | — | — | — |
| `audit_reports.delete` | ✓ | — | — | — | — | — |
| `observation_dictionary.view` | ✓ | — | — | — | — | — |
| `observation_dictionary.create` | ✓ | — | — | — | — | — |
| `observation_dictionary.edit` | ✓ | — | — | — | — | — |
| `observation_dictionary.delete` | ✓ | — | — | — | — | — |
| `risks.view` | ✓ | — | — | — | — | — |
| `risks.create` | ✓ | — | — | — | — | — |
| `risks.edit` | ✓ | — | — | — | — | — |
| `risks.delete` | ✓ | — | — | — | — | — |
| `observation_areas.view` | ✓ | — | — | — | — | — |
| `observation_areas.create` | ✓ | — | — | — | — | — |
| `observation_areas.edit` | ✓ | — | — | — | — | — |
| `observation_areas.delete` | ✓ | — | — | — | — | — |
| `action_plans.view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `action_plans.create` | ✓ | — | — | ✓ | ✓ | ✓ |
| `action_plans.edit` | ✓ | — | — | ✓ | ✓ | — |
| `action_plans.delete` | ✓ | ✓ | — | — | — | — |
| `progress_evaluations.view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `progress_evaluations.create` | ✓ | — | — | — | — | — |
| `progress_evaluations.edit` | ✓ | — | — | — | — | — |
| `progress_evaluations.delete` | ✓ | — | — | — | — | — |
| `users.view_module` | ✓ | — | — | — | — | — |
| `roles.view_module` | ✓ | — | — | — | — | — |
| `permissions.view_module` | ✓ | — | — | — | — | — |
| `settings.view_module` | ✓ | — | — | — | — | — |
| `notifications.view_module` | ✓ | — | ✓ | — | — | — |
| `automatic_jobs.view_module` | ✓ | — | — | — | — | — |
| `notification_rules.view_module` | ✓ | — | — | — | — | — |
| `activity.view_module` | ✓ | — | — | — | — | — |
| `activity_logs.view_module` | ✓ | — | — | — | — | — |
| `audit_logs.view_module` | ✓ | — | — | — | — | — |
| `invitations.view_module` | ✓ | — | — | — | — | — |
| `areas.view_module` | ✓ | — | — | — | — | — |
| `risk_levels.view_module` | ✓ | — | — | — | — | — |
| `observation_statuses.view_module` | ✓ | — | — | — | — | — |
| `system_parameters.view_module` | ✓ | — | — | — | — | — |
| `catalogs.view_module` | ✓ | — | — | — | — | — |
| `products.view_module` | ✓ | — | — | — | — | — |
| `observations.view_module` | ✓ | — | ✓ | — | — | — |
| `audit_reports.view_module` | ✓ | — | — | — | — | — |
| `observation_dictionary.view_module` | ✓ | — | — | — | — | — |
| `risks.view_module` | ✓ | — | — | — | — | — |
| `observation_areas.view_module` | ✓ | — | — | — | — | — |
| `action_plans.view_module` | ✓ | — | ✓ | — | — | — |
| `progress_evaluations.view_module` | ✓ | — | — | — | — | — |
| `reports.view_module` | ✓ | — | ✓ | — | — | — |
| `recommended_action_plans.view_module` | ✓ | — | — | — | — | — |
| `evidence.view_module` | ✓ | — | — | — | — | — |
| `deadline_extensions.view_module` | ✓ | — | — | — | — | — |
| `observations.history.view_module` | ✓ | — | — | — | — | — |
| `action_plans.history.view_module` | ✓ | — | — | — | — | — |
| `workflows.view` | ✓ | — | — | — | — | — |
| `workflows.create` | ✓ | — | — | — | — | — |
| `workflows.edit` | ✓ | — | — | — | — | — |
| `workflows.delete` | ✓ | — | — | — | — | — |
| `workflows.archive` | ✓ | — | — | — | — | — |
| `workflows.publish` | ✓ | — | — | — | — | — |
| `workflows.validate` | ✓ | — | — | — | — | — |
| `workflows.simulate` | ✓ | — | — | — | — | — |
| `workflows.view_versions` | ✓ | — | — | — | — | — |
| `workflows.view_instances` | ✓ | — | — | — | — | — |
| `workflow_tasks.view` | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `workflow_tasks.approve` | ✓ | ✓ | — | — | ✓ | — |
| `workflow_tasks.complete` | ✓ | — | — | — | — | ✓ |
| `workflow_tasks.reject` | ✓ | — | — | — | ✓ | — |
| `workflow_tasks.observe` | ✓ | — | — | — | — | — |
| `workflow_tasks.request_correction` | ✓ | ✓ | — | — | ✓ | — |
| `workflow_tasks.reassign` | ✓ | — | — | — | — | — |
| `workflow_instances.start` | ✓ | — | — | — | — | — |
| `workflow_instances.cancel` | ✓ | — | — | — | — | — |
| `workflow_instances.retry` | ✓ | — | — | — | — | — |
| `workflow_instances.view_audit` | ✓ | — | — | — | — | — |
| `workflow_timers.view` | ✓ | — | — | — | — | — |
| `workflow_timers.retry` | ✓ | — | — | — | — | — |
| `reports.view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `reports.export` | ✓ | ✓ | ✓ | — | — | — |
| `activity.export` | ✓ | — | — | — | — | — |
| `activity.technical` | ✓ | — | — | — | — | — |
| `audit_reports.export` | ✓ | ✓ | — | — | — | — |
| `observations.close` | ✓ | ✓ | — | — | — | — |
| `observations.send` | ✓ | ✓ | — | — | — | — |
| `observation_areas.manage` | ✓ | ✓ | — | — | — | — |
| `recommended_action_plans.view` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `recommended_action_plans.create` | ✓ | ✓ | — | — | — | — |
| `recommended_action_plans.edit` | ✓ | ✓ | — | — | — | — |
| `recommended_action_plans.delete` | ✓ | ✓ | — | — | — | — |
| `recommended_action_plans.submit_to_audit` | ✓ | ✓ | — | — | — | — |
| `action_plans.assign_executor` | ✓ | ✓ | — | ✓ | ✓ | — |
| `action_plans.submit_to_audit` | ✓ | ✓ | — | — | ✓ | ✓ |
| `action_plans.evaluate` | ✓ | ✓ | — | — | — | — |
| `action_plans.approve` | ✓ | ✓ | — | — | — | — |
| `action_plans.return` | ✓ | ✓ | — | — | — | — |
| `action_plans.complete` | ✓ | — | — | — | — | — |
| `evidence.view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `evidence.create` | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `evidence.review` | ✓ | ✓ | — | — | — | — |
| `evidence.delete` | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `observations.history.view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `action_plans.history.view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `deadline_extensions.view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `deadline_extensions.request` | ✓ | — | — | — | — | ✓ |
| `deadline_extensions.approve` | ✓ | ✓ | — | — | ✓ | — |
| `deadline_extensions.reject` | ✓ | ✓ | — | — | ✓ | — |

## Permission-to-screen and backend mapping

The permission matrix below is keyed by resource. Each permission code in the full matrix above inherits the listed UI surface, API boundary, and scope/workflow requirements for its resource. Actions listed in the permission code are enforced by their specific route/service checks; inactive codes are called out separately.

| Resource | Frontend screen/control | Backend endpoint/service | Scope and workflow conditions |
| --- | --- | --- | --- |
| `users` | /users, /users/[userId] | Users API (/users, /users/:id) | User administration; administrator safeguards protect the final system admin. |
| `roles` | /roles, /roles/[roleId] | Role API (/roles, /roles/:roleId) | Role definitions and permission assignment; permissions are applied after the auth summary refresh. |
| `permissions` | Role permission matrix; /permissions/me is the authenticated user summary | GET /permissions/me (authentication only); no permission CRUD API | The permissions.* CRUD codes have no matching user operation; role editing is guarded by roles.*. |
| `settings` | /settings | GET/PUT /settings, /settings/logo | Global settings; view/edit are active. Create/delete are not implemented. |
| `notifications` | /notifications and the notification bell | GET/POST/DELETE /notifications; read actions use notifications.view | Delete now requires notifications.delete in API and UI. notifications.edit has no separate operation. |
| `automatic_jobs` | /administracion/notificaciones | /automatic-jobs/** | View reads configuration/history; edit configures and manually runs jobs. Scheduled internal routes require CRON_SECRET. |
| `notification_rules` | Nested within /administracion/notificaciones | Rules are stored under /automatic-jobs/rules and use automatic_jobs.view/edit | notification_rules.* has no independent consumer; use automatic_jobs.* for the implemented screen. |
| `activity` | /actividad; observation history tab | GET /activity, /activity/export, /observations/:id/history, /entities/:type/:id/history | Read/export are active; timeline scope follows entity assignments. create/edit/delete are intentionally unsupported for append-only events. |
| `activity_logs` | /activity-logs and user activity details | GET /activity-logs and user activity-log routes | Read-only audit trail; create/edit/delete are system operations, not user capabilities. |
| `audit_logs` | /audit-logs | GET /audit-logs | Read-only audit trail; create/edit/delete are system operations. |
| `invitations` | /invitations | Invitation API (/invitations) | Create, inspect, update/resend, and revoke invitation operations. |
| `reports` | /reportes and /dashboard/reporteria | Reports API (/reports/**) | Report access is scoped by report definitions; export is separately permission-gated. |
| `audit_reports` | /reportes/auditoria and /administracion/informes-auditoria | Audit report module routes | CRUD/export permissions plus audit-report data scope. |
| `observations` | /observaciones and observation detail | Observation module routes (/observations/**) | Record scope and workflow state apply after permission checks; send/close are separate actions. |
| `recommended_action_plans` | Observation detail, recommended plan workspace | /observations/:id/remediation-plans and /remediation-plans/:id | Scope is the parent observation; submit-to-audit and assignment constraints apply. |
| `action_plans` | /planes-accion and observation detail | /action-plans/** and /action-plans/:id/evaluations | Scope is the assigned area/plan; progress approval also requires current workflow assignment and valid record state. |
| `progress_evaluations` | /avances-evidencias and plan progress panels | GET /progress-evaluations; create/update/delete routes use action_plans.submit_to_audit | progress_evaluations.view is active; create/edit/delete subcodes are currently not used by the API. |
| `evidence` | Observation and action-plan evidence panels | /observations/:id/evidence, /progress-evaluations/:id/evidence, /evidences/:id/** | evidence.view now gates listing/download and serialized file details; create/delete/review remain separate. Record scope and workflow assignment still apply. |
| `deadline_extensions` | /ampliaciones-plazo and /aprobaciones/pendientes | /extension-requests/** | Request permission, in-scope record, current status, and workflow/area assignment jointly govern decisions. |
| `observations.history` | Observation detail → Historial tab | /observations/:id/history | observations.history.view controls the UI tab and API; generic activity permissions retain access. |
| `action_plans.history` | Action-plan detail → Historial del plan; progress review history | /entities/ACTION_PLAN/:id/history and progress-evaluation serializer | action_plans.history.view controls the panel and review-history payload. |
| `workflows` | /configuracion/flujos | Workflow configuration API (/workflows/**) | Each action has a distinct workflow-management permission. Published workflow stage configuration governs runtime routing. |
| `workflow_tasks` | /aprobaciones/flujos and task detail | Workflow task API (/workflow-tasks/**) | Task assignment, task permission, action availability, and record state are all required. |
| `workflow_instances` | /configuracion/flujos/instancias | Workflow instance API (/workflow-instances/**) | Start/cancel/retry/audit permissions are separate; instance/entity authorization remains enforced. |
| `workflow_timers` | Workflow timer administration and job controls | Workflow timer service and automatic job routes | Timer viewing/retry is separate from automatic_jobs.view/edit where timer runs are manually triggered. |
| `areas` | /administracion/gerencias | Area catalog API | Catalog CRUD permissions; no operational observation scope is implied. |
| `risk_levels` | /administracion/niveles-riesgo | Risk-level catalog API | Catalog CRUD permissions. |
| `observation_statuses` | /administracion/estados | Observation status catalog API | Catalog CRUD permissions; final-state transitions remain workflow/state controlled. |
| `system_parameters` | /administracion/parametros | System parameter API | Parameter access/edit permissions; business validations still apply. |
| `catalogs` | /administracion/catalogos | Observation catalog module routes | Catalog CRUD permissions. |
| `products` | /products | Products module routes | Product CRUD permissions. |
| `observation_dictionary` | /administracion/diccionario-observaciones | Observation catalog module routes | Dictionary CRUD permissions. |
| `risks` | /administracion/riesgos | Risk catalog module routes | Risk CRUD permissions. |
| `observation_areas` | Observation form/detail area assignment controls | No standalone CRUD route; assignment changes use observations.edit plus observation_areas.manage | view/create/edit/delete codes have no independent consumer; manage is the active assignment capability. |

## Authorization rules verified

- Permission checks are separate from record scope and workflow assignment. A permission alone does not bypass data scope, record state, or task assignment.
- Authorization summaries now union permission grants from every assigned role. Built-in roles retain their configured data scopes; custom-role access also includes records where the user is directly assigned as process owner, area responsible, or plan executor.
- Progress and extension queues union normal in-scope records with exact active workflow task IDs. The exact-ID branch is tied to a current task for that user.
- Evidence list/download and response serialization now require `evidence.view`; observation visibility alone no longer reveals attachments. Extension-request serializers also omit attachments without `evidence.view`.
- Automatic job reads use `automatic_jobs.view`; updates and manual runs use `automatic_jobs.edit`, replacing the old `dataScope === ALL` restriction. Cron endpoints continue to require the configured secret.
- Notification deletion now requires `notifications.delete` in the API and is hidden in both notification UIs without that permission.
- Observation and action-plan history have dedicated UI and API gates for `observations.history.view` and `action_plans.history.view`.

## Authorization inconsistencies fixed

- Role summaries previously depended on one role and could drop permissions from other assigned roles. They now union grants across all assigned roles, preserve all role codes, and apply the broadest canonical data scope.
- Direct assignment scope now includes a user's process-owner, area-responsible, and executor assignments, including custom roles with `ASSIGNED` scope. This makes permission grants useful without granting access to unrelated records.
- Review queues previously intersected ordinary record scope with workflow assignment and could hide a task from its assigned reviewer. Progress and extension queue scopes now union ordinary in-scope records with exact active task IDs for that user. Extension queues also account for legacy multi-area responsibility.
- `evidence.view`, history permissions, notification deletion, and automatic-job view/edit permissions now guard their backend payloads/actions as well as the matching frontend controls.
- Evidence review decisions follow `evidence.review`, independent of canonical role name. Permission revocation is checked by the API even when a control is hidden client-side.

These repairs have source-level and unit-contract coverage; live custom-role sessions and API/browser flows were not available in this environment.

## Unused, redundant, or unsupported catalog entries

No duplicate permission codes were found. The following entries remain in the 178-code editor catalog but have no independent runtime consumer or operation in this source snapshot; granting them alone does not create a capability:

- `permissions.view/create/edit/delete`
- `settings.create/delete`
- `notifications.edit`
- `automatic_jobs.create/delete`
- `notification_rules.view/create/edit/delete`
- `activity.create/edit/delete`
- `activity_logs.create/edit/delete`
- `audit_logs.create/edit/delete`
- `observation_areas.view/create/edit/delete`
- `progress_evaluations.create/edit/delete`

There are 30 `*.view_module` marker codes. The role editor treats these as aliases for the resource's `.view` permission (checking a marker adds `.view`), and navigation is controlled by the effective view permission. They do not independently authorize a route.

These legacy/dormant codes should be reconciled with the live permission rows before any data cleanup. This audit did not remove them because no safe database inventory was available.

## Remaining limitations

- The six built-in role definitions and grants are known; runtime custom roles, extra database roles, and persisted permission rows are unknown without a safe SQL Server test database.
- Grant/revoke coverage is a parameterized authorization-contract test across all 178 codes. It is not a browser/API integration test of every permission endpoint.
- Operational dashboards and selected reporting views intentionally retain canonical role-based presentation/scope logic. The three operational dashboards for process owner, area responsible, and executor remain role-specific.
- The frontend/backend permission catalogs match exactly, but dormant catalog actions remain an administration clarity issue.
