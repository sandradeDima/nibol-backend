# Resultados de control de calidad de NIBOL

Fecha de auditoría: 2026-10-16
Rama del backend: `feat/sql-server-support`
Rama del frontend: `main`

## Resumen

Se completaron las verificaciones del código fuente y las pruebas unitarias automatizadas. Las pruebas de integración con SQL Server y el recorrido en navegador están **BLOQUEADOS** porque no había una base de datos aislada y segura, usuarios de prueba cargados ni una sesión de navegador disponibles. No se consultó ni modificó ninguna base de datos de producción o en vivo. La suite completa del backend tiene un fallo del entorno al iniciar el navegador PDF de Puppeteer.

Todos los comandos del backend que podrían inicializar Prisma usaron una `DATABASE_URL` ficticia, limitada al proceso y apuntada a localhost. No se ejecutaron migraciones, semillas, transferencias, reinicios de bases de datos ni comandos que modificaran la base.

## Verificaciones del backend

Directorio de trabajo: `backend/` on `feat/sql-server-support`.

| Comando | Resultado | Notas |
| --- | --- | --- |
| `DATABASE_URL='sqlserver://localhost:1433;databaseName=nibol_test;user=codex;password=codex_test_only;encrypt=false' npm run typecheck` | Correcto | Se generó Prisma Client 7.8.0 y TypeScript finalizó sin errores. |
| `DATABASE_URL='sqlserver://localhost:1433;databaseName=nibol_test;user=codex;password=codex_test_only;encrypt=false' npm run lint` | Correcto | Ya se había completado sin errores de lint. |
| `DATABASE_URL='sqlserver://localhost:1433;databaseName=nibol_test;user=codex;password=codex_test_only;encrypt=false' npm run db:validate` | Correcto | Finalizó la validación del esquema Prisma para SQL Server. |
| `npm ls --depth=0` | Correcto | Se resolvió el árbol de dependencias, incluidos `@prisma/adapter-mssql@7.8.0` y Prisma 7.8.0. |
| `DATABASE_URL='sqlserver://localhost:1433;databaseName=nibol_test;user=codex;password=codex_test_only;encrypt=false' npm run build` | Correcto | Finalizaron la generación de Prisma, la compilación de TypeScript y la copia de las fuentes de informes. Se eliminó la salida generada en `dist/` después de verificarla. |
| `DATABASE_URL='sqlserver://localhost:1433;databaseName=nibol_test;user=codex;password=codex_test_only;encrypt=false' node --import tsx --test src/services/authorization-scope.test.ts src/modules/extension-requests/*.test.ts src/modules/progress/*.test.ts src/modules/workflows/workflow-runtime.test.ts` | Correcto | Pasaron 23 pruebas centradas en regresiones. |
| `DATABASE_URL='sqlserver://localhost:1433;databaseName=nibol_test;user=codex;password=codex_test_only;encrypt=false' npm test` | Falló (entorno) | 146 pruebas en total; 145 pasaron y 1 falló. `reports.pdf.test.ts` no pudo iniciar Puppeteer (`Code: null`, salida de error vacía). El fallo no está relacionado con los contratos de permisos y flujos de trabajo probados. |
| `git diff --check` | Correcto | Se ejecutó después de editar los documentos de auditoría y el código fuente. |

La cobertura de regresiones incluye el contrato de concesión/revocación de 178 permisos, los alcances y la unicidad de los roles integrados, el alcance de asignación directa de roles personalizados, los límites de permisos de evidencias e historial, el alcance de colas por tarea, el comportamiento de fechas efectivas de ampliaciones, el umbral de finalización del 100 %, el estado de aprobación pendiente y la desvinculación al solicitar correcciones.

## Verificaciones del frontend

Directorio de trabajo: `frontend/` on `main`.

| Comando | Resultado | Notas |
| --- | --- | --- |
| `npm run typecheck` | Correcto | Se completó después de actualizar las restricciones de permisos de la interfaz y los paneles de historial. |
| `npm run lint` | Correcto con advertencias | Sin errores; se mantienen dos advertencias existentes en `admin-shell.tsx` y `action-plan-detail.tsx`. |
| `npm run build` | Correcto | El primer intento no pudo descargar Google Fonts debido a las restricciones de red. El segundo compiló y generó estáticamente 52 páginas correctamente. Next.js también indicó que dedujo la raíz del espacio de trabajo a partir de varios archivos de bloqueo. |
| Browser UI walkthrough | Bloqueado | No había una pestaña o sesión de navegador ni un usuario de prueba disponibles. |

Se conservó el trabajo del frontend que ya estaba sin confirmar. La comparación del catálogo de permisos informó 178 permisos en el backend y 178 en el editor del frontend, sin códigos faltantes ni adicionales.

## Roles y pantallas revisados

- Las definiciones de roles integrados y sus permisos se revisaron de forma estática: `SYSTEM_ADMIN`, `AUDITOR`, `AUDIT_CHIEF`, `PROCESS_OWNER`, `AREA_RESPONSIBLE`, and `EXECUTOR`.
- El comportamiento de concesión/revocación y asignación con alcance de roles personalizados se probó con datos de prueba de autorización, no con cuentas activas de roles personalizados.
- No se inició sesión con ningún rol. No se probaron manualmente ni en navegador los paneles, editores, colas de flujos de trabajo ni pantallas de detalle.

## Escenarios de extremo a extremo y de base de datos

Estado: **BLOQUEADO**, no aprobado. El espacio de trabajo no proporcionó una base SQL Server aislada con observaciones, planes de acción, clasificaciones de ampliación, definiciones de flujo de trabajo, usuarios y roles de prueba. En ese entorno aún deben ejecutarse estos casos de aceptación: envíos de avance del 80 % y 100 %; aprobación/devolución de finalización; solicitud de ampliación, cola multiarea, etapas posteriores del flujo de trabajo y rechazo; roles personalizados de solicitante/revisor; revocación de permisos mediante API directa; denegación entre áreas; verificación de tareas/notificaciones duplicadas; y verificación del historial/auditoría persistidos.

## Notas de implementación y riesgos

- Estas correcciones no hicieron ni requirieron cambios en el esquema o las migraciones.
- La integridad del adaptador y las dependencias de SQL Server, la validación del esquema Prisma, la compilación del backend y su verificación de tipos pasaron en `feat/sql-server-support`.
- Los cambios del frontend están en `main`, como se solicitó. Si se requieren ambos lados, implemente junto con la rama del backend la revisión de `main` del frontend que contiene estas restricciones de interfaz.
- No considere el único fallo de la prueba PDF de Puppeteer como una regresión del producto; para verificarlo hace falta un entorno de CI/ejecución que pueda iniciar el navegador Chromium.
- Antes de implementar, ejecute los casos de aceptación bloqueados de flujos de trabajo en un entorno SQL Server aislado. Aquí no se revisaron roles personalizados activos, filas de roles persistidas, la configuración actual de flujos ni la idempotencia de notificaciones.
