# Auditoría de regresiones de flujos de trabajo de NIBOL

Fecha de auditoría: 2026-10-16
Rama del backend: `feat/sql-server-support`
Rama del frontend: `main`

## Alcance y evidencia

Esta auditoría siguió los flujos de avance/finalización y de solicitud de ampliación a través de las consultas de servicio, los adaptadores de entidades de flujo de trabajo, el manejo de decisiones y la visualización de estados en el frontend. Se identificaron y corrigieron los mecanismos de regresión en el código. Las pruebas unitarias puras cubren la construcción de alcances de cola, los datos de decisiones, el umbral de finalización y el cálculo del plazo de ampliación.

En este espacio de trabajo no hay una base SQL Server de prueba segura ni una sesión de aplicación con datos cargados. No se pudieron reproducir los dos casos similares a producción con registros persistidos, ni ejecutar los flujos de aceptación en navegador. Los resultados siguientes distinguen el comportamiento verificado con pruebas unitarias de la aceptación de extremo a extremo que quedó bloqueada.

## Regresión A: la finalización no aparece en la cola de Auditoría

### Causa raíz

El adaptador del flujo de cierre de observaciones marcaba como `APPROVED` una evaluación de avance después de cada acción intermedia `APPROVE` y registraba `APPROVED` como destino del historial. La cola de revisión de Auditoría selecciona envíos pendientes con `reviewStatus: SENT_TO_AUDIT`; por eso una aprobación intermedia quitaba el envío de finalización de la cola antes de que el flujo alcanzara su resultado terminal. El adaptador también mantenía vinculada la instancia del flujo después de una devolución para corrección, lo que podía impedir un nuevo intento limpio.

### Corrección

- La aprobación intermedia mantiene pendiente la evaluación (`SENT_TO_AUDIT`) y registra la transición intermedia en el historial sin actualizar antes de tiempo los valores oficiales del plan de acción.
- Solo la finalización exitosa del flujo actualiza el plan de acción y la observación, marca la evaluación como aprobada y cambia el destino más reciente del historial de revisión a `APPROVED`.
- Una corrección o un rechazo devuelve la evaluación y elimina el vínculo con la instancia del flujo para que el envío corregido pueda iniciar un flujo nuevo.
- La finalización sigue exigiendo un avance enviado de exactamente el 100 %.
- El alcance de la cola incluye los ID exactos de las tareas activas asignadas al revisor y mantiene las comprobaciones de alcance de registros para las entradas ordinarias.
- La interfaz de revisión muestra por separado «Avance actual» y «Avance enviado». Así, un valor pendiente del 80 % o 100 % puede diferir del estado oficial del plan sin sobrescribir datos aprobados.

### Flujos afectados

Envío del Ejecutor → `progress.service` crea una evaluación `SENT_TO_AUDIT` → tarea del flujo `OBSERVATION_CLOSURE` → cola de revisión con alcance → decisión del revisor → al finalizar el flujo se actualizan el plan/observación oficiales y el historial. Una devolución asigna `RETURNED`, desvincula la instancia anterior y permite corregir y volver a enviar.

### Verificación

| Verificación | Resultado | Evidencia |
| --- | --- | --- |
| La finalización exige 100 %; la función auxiliar rechaza 80 %, 99 % y valores nulos | Correcto | `workflow-runtime.test.ts`: `finalization approvals remain in Audit until the workflow completes` |
| Los datos de aprobación intermedia siguen pendientes; la corrección devuelve y desvincula el envío | Correcto | Same decision-payload test |
| El ID de la tarea de flujo asignada se incluye en el alcance de la cola de avances | Correcto | `progress.cleanup.test.ts`: `progress review scope adds only the assigned workflow evaluation` |
| Envíos reales de 80 % y 100 %, aprobación de finalización y devolución con registros SQL Server | Bloqueado | No hay una base SQL Server segura con datos de prueba |
| Recorrido del Auditor en navegador, conteos, notificaciones e historial persistido | Bloqueado | No había sesión de navegador ni usuarios de prueba disponibles |

## Regresión B: las solicitudes de ampliación no aparecen en la cola del Responsable de área

### Causa raíz

El listado de ampliaciones combinaba el alcance normal de registros y las condiciones de la cola de revisión como filtros conjuntos. Por ello, podía excluir a un revisor de área válido o a un asignado activo del flujo cuando la solicitud no cumplía por separado el alcance normal de registros del usuario. El predicado heredado de responsabilidad también debía incluir de forma coherente las asignaciones multiarea de observaciones al consultar la cola y el detalle. Además, al crear una solicitud se exigía `responsibleUserId === currentUser` incluso si otro usuario dentro del alcance tenía `deadline_extensions.request`, lo que contradecía el contrato de permisos.

La cola ya filtra las solicitudes heredadas por `SENT_TO_MANAGER`; los borradores se excluyen intencionalmente. La corrección no muestra borradores a los aprobadores.

### Corrección

- La visibilidad de la cola de ampliaciones combina el alcance normal de registros del usuario, el alcance heredado del Responsable de área (incluidas las asignaciones de área de las observaciones) y los ID exactos de tareas activas del flujo. La ruta basada en ID solo incluye tareas asignadas a ese usuario y no expone registros ajenos.
- La consulta del detalle para el revisor exige una tarea activa asignada o el mismo alcance heredado de responsabilidad antes de devolver la solicitud.
- Ahora, para crear una solicitud se exige `deadline_extensions.request` y acceso al plan dentro del alcance, sin imponer un rol o identidad de Ejecutor codificados.
- La aprobación intermedia de un flujo mantiene la ampliación en `SENT_TO_MANAGER`, deja `finalApprovedAt` en null y no cambia el plazo efectivo. La propuesta solo se aplica cuando el flujo finaliza correctamente.
- Una corrección devuelve la solicitud a `DRAFT` y elimina el vínculo con la instancia anterior; un rechazo mantiene el plazo original.

### Flujos afectados

Solicitante autorizado dentro del alcance → borrador de ampliación → envío al flujo del gerente → cola de tareas del Responsable de área/asignado → etapas de aprobación posteriores configuradas → al finalizar se aplica el plazo propuesto. La corrección devuelve el borrador; el rechazo no cambia el plazo.

### Verificación

| Verificación | Resultado | Evidencia |
| --- | --- | --- |
| La cola incluye los ID exactos de las tareas asignadas y la responsabilidad por asignación de área | Correcto | `extension-requests.domain.test.ts`: `extension review scope includes only requests assigned to a workflow task` |
| La aprobación intermedia no cambia la fecha efectiva | Correcto | Same file: `intermediate manager approval does not change the effective deadline`; `workflow-runtime.test.ts`: `extension approvals stay pending until workflow completion` |
| La corrección devuelve el borrador y desvincula la instancia anterior del flujo | Correcto | Workflow decision-payload test |
| El Responsable de área con varias áreas ve únicamente las solicitudes persistidas que coinciden | Bloqueado | Se probó el contrato de la función de consulta; no hay registros SQL Server de prueba para ejercitar la integración de Prisma |
| Envío de solicitante personalizado, etapas posteriores configuradas, rechazo, notificaciones y ausencia de tareas duplicadas | Bloqueado | Requiere ejecutar el flujo con una base de datos segura |

## Valores de avance y estado

El avance enviado pertenece a una evaluación pendiente; el porcentaje y estado del plan de acción representan el último valor aprobado. La interfaz de revisión separa los valores («Avance enviado» y «Avance actual»), y el detalle de remediación muestra el avance enviado como «reportado». Por tanto, un informe pendiente del 80 % o 100 % junto con un estado oficial `No iniciado` representa correctamente la separación entre valores propuestos y aprobados, siempre que no se escriban antes de tiempo. El flujo corregido aplaza las escrituras oficiales hasta la aprobación final.

## Casos de aceptación pendientes

Los cambios de código y los contratos de pruebas unitarias cubren las regresiones identificadas, pero los escenarios respaldados por una base de datos no se consideran plenamente aceptados hasta ejecutarse con usuarios y registros de prueba en un SQL Server aislado. En particular, aún no se verificaron de extremo a extremo la creación/asignación de tareas del flujo, la autorización de API con roles personalizados activos, la unicidad de notificaciones/auditoría, todas las etapas configuradas de ampliación ni el comportamiento de las pantallas en navegador.
