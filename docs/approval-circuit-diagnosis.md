# Circuito de aprobaciones: diagnóstico y comprobación operativa

Revisión local: 19 de octubre de 2026. Backend `feat/sql-server-support`, base `82d3d77`; frontend `main`, base `5a341ec`. Ambos estaban limpios antes del cambio. No se cambiaron ramas. Estos commits identifican las bases locales, no los artefactos desplegados.

## Confirmado en código y regresiones

- Ampliación: crear y enviar eran dos llamadas. Si fallaba la segunda, persistía DRAFT y la regla única por plan impedía crear otra. El módulo listado no ofrecía envío. Ahora comparte el control de envío con el detalle, conserva el ID creado, refresca tras el error y lleva a esa misma solicitud para consultar su estado y reenviar. Si el servidor confirmó el envío pero se perdió la respuesta, el refresco muestra su estado real.
- Autorización: crear comprobaba permiso y alcance de lectura, pero no exigía ser el asignado al plan. Se exige `deadline_extensions.request` más asignación al plan al crear, editar y enviar. Se conserva la excepción `isAdmin` y la gestión de solicitudes históricas sin plan. No se exige el código de rol EXECUTOR. Un solicitante sin `deadline_extensions.view` puede navegar y recuperar sus solicitudes dentro del alcance existente; no obtiene acceso a solicitudes ajenas.
- Devolución: los adaptadores de cierre y ampliación borraban el vínculo al devolver, aunque el runtime puede volver a la revisión y crear una tarea activa. Ahora conservan el vínculo. Un reenvío reutiliza la tarea activa; una instancia terminal se reemplaza mediante actualización condicional del vínculo. Si falla el inicio, conserva el vínculo anterior y el estado editable.
- Integración: la comprobación temporal de publicación precedía a la búsqueda del vínculo. Una nueva publicación podía provocar que una solicitud ya integrada se tratara como histórica. Ahora la instancia vinculada prevalece. Un reemplazo requiere workflow publicado aunque el registro anteceda a esa publicación. Los registros históricos nunca integrados siguen en el circuito directo.
- Se exige tarea activa asignada e instancia ACTIVE/WAITING antes de dar por iniciado el envío de ampliación o finalización. Una integración fallida no cambia la solicitud a enviada. No se amplían los filtros de las bandejas.

No se modificaron clasificación, límites de fechas, porcentaje requerido para cierre, efecto de aprobación sobre la fecha vigente, ni se añadió revisión previa del responsable al cierre.

## Lo que aún no está confirmado del servidor

No se ha identificado una sesión autorizada del entorno afectado ni sus versiones desplegadas. La configuración local de DATABASE_URL no corresponde al formato SQL Server exigido por esta rama. No se abrió conexión ni se modificaron datos del servidor. Las pruebas usan una base simulada; el inicio del runtime y la transición entre nodos se simulan, mientras servicios, adaptadores, resolución de asignación y consultas de bandeja se ejecutan realmente.

La causa de que las finalizaciones ya enviadas del cliente no aparezcan debe confirmarse por registro. El frontend no excluye FINALIZATION y el backend exige tarea activa asignada. El seed canónico asigna el cierre al rol AUDITOR; eso funciona si la tarea apunta al rol correcto y el usuario pertenece a él. Un rol personalizado con permisos de evaluación no es automáticamente miembro de una tarea asignada a AUDITOR. No se alteró esa asignación ni el workflow publicado para hacer visibles los registros.

## Permisos revisados

| Operación                           | Permisos y alcance                                                                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Abrir el plan                       | Se conserva `action_plans.view` y el alcance del plan.                                                                                                                                      |
| Solicitar ampliación                | `deadline_extensions.request` y plan asignado; excepción administrativa explícita.                                                                                                          |
| Abrir ampliaciones / detalle / GET  | `deadline_extensions.view` o `deadline_extensions.request`; aprobar/rechazar también permite GET de revisión. El permiso de solicitar solo recupera solicitudes propias dentro del alcance. |
| Revisar ampliación desde pendientes | `deadline_extensions.approve` / `deadline_extensions.reject`, más tarea asignada; sin workflow, responsable del área o excepción administrativa existente.                                  |
| Enviar avance / finalización        | `action_plans.submit_to_audit`, autor y alcance existente.                                                                                                                                  |
| Abrir pendientes de auditoría       | `action_plans.evaluate`.                                                                                                                                                                    |
| Aprobar avance / finalización       | `action_plans.evaluate` y `action_plans.approve`; con workflow, tarea asignada y acción APPROVE disponible.                                                                                 |
| Devolver avance / finalización      | `action_plans.evaluate` y `action_plans.return`; tarea asignada y REQUEST_CORRECTION o REJECT disponible.                                                                                   |
| Acciones genéricas de workflow      | Sus permisos `workflow_tasks.*` existentes. Los servicios de dominio conservan su traducción de permisos a acciones y siempre comprueban asignación.                                        |

## Inspección de solo lectura en el entorno afectado

1. Obtener del operador el SHA o digest del backend desplegado y el build del frontend servido por el navegador/CDN. Compararlos con los commits locales y revisar las peticiones de creación/envío y su código de respuesta. No atribuir regresión a `main` local sin esta comparación.
2. Con una cuenta de lectura, sustituir los parámetros siguientes por IDs del caso. Guardar resultados junto con los logs de envío y decisión, sin tokens ni credenciales.

```sql
DECLARE @entityId char(36) = 'ID-DEL-REGISTRO';
DECLARE @reviewerId char(36) = 'ID-DEL-REVISOR';

SELECT id, action_plan_id, requested_by_user_id, status, workflow_instance_id,
       created_at, updated_at, proposed_due_date
FROM dbo.deadline_extension_requests WHERE id = @entityId;

SELECT id, action_plan_id, submitted_by_user_id, type, reported_progress_percent,
       review_status, workflow_instance_id, created_at, submitted_at
FROM dbo.progress_evaluations WHERE id = @entityId;

SELECT d.id, d.process_type, d.status, d.active_version_id,
       v.version_number, v.status AS version_status, v.published_at
FROM dbo.workflow_definitions d
LEFT JOIN dbo.workflow_versions v ON v.id = d.active_version_id
WHERE d.archived_at IS NULL
  AND d.process_type IN ('DEADLINE_EXTENSION', 'OBSERVATION_CLOSURE');

SELECT i.id, i.entity_type, i.entity_id, i.process_type, i.status,
       i.workflow_version_id, i.current_node_id, i.context_json,
       i.runtime_error_code, i.runtime_error_message,
       t.id AS task_id, t.status AS task_status, t.assigned_user_id,
       t.assigned_role_id, t.assigned_area_id, t.assignment_snapshot_json,
       n.node_key, n.configuration_json,
       CASE WHEN t.assigned_user_id = @reviewerId
         OR EXISTS (SELECT 1 FROM dbo.user_roles ur
                    WHERE ur.role_id = t.assigned_role_id AND ur.user_id = @reviewerId)
         OR EXISTS (SELECT 1 FROM dbo.areas a
                    WHERE a.id = t.assigned_area_id AND a.manager_user_id = @reviewerId)
       THEN 1 ELSE 0 END AS assigned_to_reviewer
FROM dbo.workflow_instances i
LEFT JOIN dbo.workflow_tasks t ON t.workflow_instance_id = i.id
LEFT JOIN dbo.workflow_nodes n ON n.id = t.node_id
WHERE i.entity_id = @entityId;

SELECT p.name AS permission_name
FROM dbo.user_roles ur
JOIN dbo.role_permissions rp ON rp.role_id = ur.role_id
JOIN dbo.permissions p ON p.id = rp.permission_id AND p.deleted_at IS NULL
JOIN dbo.roles r ON r.id = ur.role_id AND r.deleted_at IS NULL
WHERE ur.user_id = @reviewerId;
```

3. Contrastar el vínculo del registro con la instancia y su versión fijada, no solo con la definición actualmente publicada. Revisar historial de tareas y transiciones, estado ACTIVE/WAITING, tarea PENDING/IN_PROGRESS, asignación y acciones de `configuration_json`. En ampliación, comprobar `custom.areaResponsibleUserId` contra el responsable del área asignada al plan; en cierre, comprobar ROLE y membresía del rol asignado. Revisar `runtime_error_code` y logs si falta tarea. Comparar finalmente los GET con `reviewQueue=true` autenticados como revisor y como otro usuario.

## Reparación propuesta, no ejecutada

- DRAFT propio: después de desplegar, usar Enviar a revisión en Ampliaciones o `POST /extension-requests/{id}/submit` con el solicitante autorizado. No recrear la solicitud. Si el plan cambió de asignado, resolver la asignación mediante el proceso operativo antes de reenviar.
- Tarea activa con asignación equivocada: confirmar el destinatario con el dueño del proceso y usar la reasignación existente (`POST /workflow-tasks/{taskId}/reassign`, permiso `workflow_tasks.reassign`). Conservar el historial de reasignación. No otorgar un rol global al auditor solo para hacer visible un registro.
- Instancia FAILED en nodo automático: investigar primero el error. Si su versión fijada sigue siendo correcta, usar el reintento existente (`POST /workflow-instances/{id}/retry`, permiso `workflow_instances.retry`). Ese endpoint no admite fallos de nodos humanos; no cambiar el estado manualmente para eludirlo.
- RETURNED / DRAFT vinculado a instancia terminal: después de validar la definición publicada, el envío corregido puede reemplazarla conservando la trazabilidad. No hace falta borrar el vínculo.
- SENT_TO_AUDIT vinculado a instancia terminal sin tarea: requiere intervención por ID revisada por el operador. Capturar registro, instancia, tareas, versiones e historial; verificar que no exista aprobación efectiva, que el plan no esté concluido y que no haya tarea activa. Preparar una transacción que cambie solo ese registro de SENT_TO_AUDIT a RETURNED, mantenga `workflow_instance_id`, agregue una fila de `progress_review_history` (SENT_TO_AUDIT → RETURNED, actor autorizado y motivo de reparación) y registro de actividad. Usar predicados sobre ID, estado, vínculo y ausencia de tareas activas; exigir exactamente una fila afectada y ensayar con ROLLBACK. Tras revisión y autorización operativa, confirmar esa única transacción y reenviar como el autor; comprobar bandeja y tarea nueva antes de cerrar el caso. Conservar las instancias anteriores. No ejecutar actualizaciones masivas ni desvincular para forzar revisión directa.
- Si la definición publicada es incorrecta, preparar un borrador corregido y probarlo fuera de producción. Publicación y reparación de instancias existentes requieren un cambio operativo separado; este trabajo no cambió workflows publicados.

## Validación ejecutada

- Backend, módulos afectados: 70/70 pruebas (`authorization-scope`, `extension-requests`, `progress`, `workflows`). Incluyen 9 regresiones de envío, bandeja, decisión, asignación, fechas, devolución/reenvío y republicación.
- Backend, suite completa: 154/155. La única falla es `reports.pdf.test.ts`: Puppeteer no logra iniciar el navegador (`Failed to launch the browser process`). No es una aserción del circuito de aprobaciones.
- Frontend: 2/2 pruebas nuevas del control compartido de envío y del endpoint de reintento sobre el mismo ID. Cubren disponibilidad por permiso, autor, asignación, estado y excepción administrativa. No sustituyen una prueba de clic en navegador autenticado.
- `npm run typecheck` en backend y frontend: correctos. Prisma se generó correctamente, sin cambios en esquema ni migraciones.
- ESLint de los archivos modificados: sin errores. Frontend conserva un aviso preexistente de importación no usada (`getActionPlanStatusClasses` en `action-plan-detail.tsx`).
- `git diff --check` de ambos repositorios: correcto.

Comandos reproducibles desde cada proyecto:

```sh
# backend: URL sintácticamente válida, las pruebas no usan una conexión real.
DATABASE_URL='sqlserver://localhost:1433;database=approval_tests;user=sa;password=unused;trustServerCertificate=true' \
  node --import tsx --test src/services/authorization-scope.test.ts \
  src/modules/extension-requests/*.test.ts src/modules/progress/*.test.ts \
  src/modules/workflows/*.test.ts
npm run typecheck

# frontend: utiliza el tsx ya instalado en el backend de este workspace.
node --import ../backend/node_modules/tsx/dist/loader.mjs --test \
  src/modules/extension-requests/extension-request-submit.test.tsx
npm run typecheck
```
