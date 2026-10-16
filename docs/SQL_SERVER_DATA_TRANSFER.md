# MySQL to SQL Server data transfer

`scripts/transfer-mysql-to-sqlserver.ts` is an optional one-time import for databases with existing records. It is separate from Prisma migrations and seed execution. It only issues reads and a read-only InnoDB transaction against MySQL; it never updates or deletes source rows.

## Before the transfer

1. Take and verify backups of the MySQL source and the SQL Server target.
2. Pause application writes and schema changes on MySQL through cutover. The importer reads one repeatable-read snapshot; changes committed after that snapshot are not copied.
3. Confirm every source business table uses InnoDB. The script rejects other engines because they cannot share the required consistent snapshot.
4. Run all SQL Server migrations against a new, empty target first. The transfer requires exact source/target table and column compatibility.
5. Use a MySQL account with read-only `SELECT` access. URL-encode special characters in its username/password. For TLS, add `?ssl=true`; if the server uses a private CA, set `MYSQL_SOURCE_SSL_CA` to its PEM certificate path.
6. Copy external evidence/object-storage assets separately. Preserve file keys/paths referenced by `evidence_files`; the importer does not copy external files.

## Commands

Point `DATABASE_URL` at the migrated target and `MYSQL_SOURCE_URL` at the source. Do not put either credential in a report or commit it.

```sh
export DATABASE_URL='sqlserver://sql-host:1433;database=NIBOL;schema=dbo;user=nibol_migrator;password={replace-me};encrypt=true'
export MYSQL_SOURCE_URL='mysql://read_only_user:encoded-password@mysql-host:3306/nibol?ssl=true'
export MYSQL_SOURCE_SSL_CA='/path/to/mysql-ca.pem' # only when a private CA is needed
npm run db:transfer:mysql
```

If a transfer stops after some batches, rerun with `--resume`:

```sh
npm run db:transfer:mysql -- --resume
```

Without `--resume`, the utility refuses a target containing rows. With `--resume`, it inserts missing primary keys but never updates an existing target row; it compares each source row with its target counterpart and fails if a conflicting row exists. Resume restarts the scan from the first key and reconciles already-copied rows; it does not depend on a mutable checkpoint file. Run it before seeds, because system-seed upserts may update canonical records and change row counts.

## What it checks

- Source/target table names and source/target column compatibility.
- Source storage engine is InnoDB.
- Source and target orphan relationships for all discovered foreign keys.
- Source and target row counts for every application table.
- SHA-256 comparison of every copied row after canonicalizing JSON key ordering, SQL Server date formatting, decimals, and MySQL booleans stored as SQL Server `BIT`.
- Foreign-key insertion order, explicit preservation of single-column primary keys, `IDENTITY_INSERT`, and reseeding identity counters.

Rows are sent in batches of at most 100 and at most 2,000 parameters, below SQL Server's 2,100-parameter statement limit. The current Prisma schema uses one-column primary keys; the importer stops if a table violates that assumption. It defers `workflow_definitions.active_version_id` to resolve that nullable cycle and checks the relationship after restoring it.

The utility and its pure reconciliation helpers passed a live synthetic test against disposable MySQL 8.4 and SQL Server 2022 containers: 49 tables were checked, all 93 foreign keys passed on both sides, six representative rows were compared, and a second `--resume` pass reconciled cleanly. It has not been run with the production MySQL database or its actual data volume. Validate it on reviewed source/target copies before cutover. Since this importer has no change-data-capture phase, writes must remain paused through final reconciliation and cutover.
