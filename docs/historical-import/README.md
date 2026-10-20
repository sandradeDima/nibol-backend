# Importación histórica en el entorno de pruebas

Ejecute desde la raíz del repositorio del backend después de implementar este código y colocar el libro en `docs/`. El importador actualiza los informes coincidentes y reemplaza las observaciones correspondientes del archivo de Excel. Elimina las observaciones que no aparecen en un informe incluido en el libro. Al reemplazar una observación, también elimina sus registros secundarios existentes y reconstruye a partir de Excel los riesgos, asignaciones, planes y comentarios históricos. Los informes que no están en el libro y los roles de usuario existentes permanecen en la base. Durante la importación, detenga los procesos del entorno de pruebas que escriban en los informes afectados.

```sh
npm ci --include=dev
npm run db:generate
npm run test:historical-observations
node -r dotenv/config -e 'const u = new URL(process.env.DATABASE_URL); console.log({ host: u.hostname, database: u.pathname.slice(1) })'
npx prisma migrate status
npm run import:historical-observations -- --dry-run
node -e 'const r = require("./docs/historical-import/latest-dry-run.json"); const blocked = Object.values(r.records).flat().filter(x => ["BLOCKED", "CONFLICT"].includes(x.decision)); console.log({ database: r.database, observations: r.counts.Observation, blocked: blocked.length, error: r.error }); if (r.database !== "AVAILABLE" || r.error || blocked.length) process.exit(1)'
```

De forma predeterminada, el importador lee el libro histórico incluido en `docs/`. Usa `DATABASE_URL` del entorno del backend y escribe `docs/historical-import/latest-dry-run.md` y `.json`. Confirme que la URL apunta al entorno de pruebas y revise la simulación antes de ejecutarlo. El informe muestra creaciones, actualizaciones y eliminaciones; no debe haber registros bloqueados ni en conflicto. El importador se detiene si los encuentra. Antes de ejecutarlo, cree una copia de seguridad de la base del entorno de pruebas: al reemplazar, se eliminan los registros secundarios existentes de las observaciones, incluidos los de avance y evidencia, antes de reconstruir los datos históricos de Excel.

Después de revisar la simulación:

```sh
npm run import:historical-observations -- --execute
npm run import:historical-observations -- --dry-run
node -e 'const r = require("./docs/historical-import/latest-dry-run.json"); const pending = Object.values(r.counts).reduce((n, c) => n + (c.CREATE || 0) + (c.UPDATE || 0) + (c.DELETE || 0), 0); console.log({ database: r.database, pending, error: r.error }); if (r.database !== "AVAILABLE" || r.error || pending) process.exit(1)'
```

Revise `docs/historical-import/latest-execution.md` y `.json` para detectar errores y comprobar los conteos finales. Vuelva a ejecutar la simulación para confirmar que los conteos restantes de creación, actualización y eliminación sean cero. No ejecute `db:seed` para esta importación.
