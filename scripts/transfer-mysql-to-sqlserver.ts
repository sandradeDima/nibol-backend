import "dotenv/config";

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createConnection, type RowDataPacket } from "mysql2/promise";

import { prisma } from "../src/utils/prisma.js";
import {
  batchSizeFor,
  buildMergeStatement,
  sqlServerIdentifier,
  tableRowHash,
  transformValue,
  type SourceColumn,
  type TargetColumn,
} from "./sqlserver-transfer-utils.js";

const MIGRATION_TABLE = "_prisma_migrations";
const DEFERRED_FK = {
  column: "active_version_id",
  table: "workflow_definitions",
} as const;

type MySqlRow = RowDataPacket & Record<string, unknown>;
type ForeignKeyColumn = {
  childColumn: string;
  childTable: string;
  constraintName: string;
  parentColumn: string;
  parentTable: string;
  position: number;
};
type PrimaryKeyColumn = {
  columnName: string;
  keyOrdinal: number;
  tableName: string;
};
type DeferredUpdate = { id: unknown; value: unknown };

const mysqlIdentifier = (value: string): string =>
  `\`${value.replaceAll("`", "``")}\``;

const sqlServerTable = (table: string): string =>
  `[dbo].${sqlServerIdentifier(table)}`;

const mysqlRows = async <T extends RowDataPacket>(
  connection: Awaited<ReturnType<typeof createConnection>>,
  query: string,
  parameters: unknown[] = [],
): Promise<T[]> => {
  const [rows] = await connection.query<T[]>(query, parameters);
  return rows;
};

const countMySql = async (
  connection: Awaited<ReturnType<typeof createConnection>>,
  query: string,
  parameters: unknown[] = [],
): Promise<bigint> => {
  const rows = await mysqlRows<RowDataPacket & { total: string }>(
    connection,
    query,
    parameters,
  );
  if (!rows[0]) throw new Error("MySQL count query returned no row.");
  return BigInt(rows[0].total);
};

const querySqlServer = async <T>(
  query: string,
  parameters: unknown[] = [],
): Promise<T[]> => prisma.$queryRawUnsafe<T[]>(query, ...parameters);

const readTargetRows = async (
  table: string,
  columns: string[],
  primaryKey: string,
  ids: unknown[],
  targetColumns: Map<string, TargetColumn>,
): Promise<Record<string, unknown>[]> => {
  const projection = columns
    .map((column) => {
      const identifier = sqlServerIdentifier(column);
      const dataType = targetColumns.get(column)?.dataType.toLowerCase();
      const expression =
        dataType === "date"
          ? `CONVERT(nvarchar(10), ${identifier}, 23)`
          : ["datetime", "datetime2", "smalldatetime"].includes(dataType ?? "")
            ? `CONVERT(nvarchar(23), ${identifier}, 121)`
            : dataType === "datetimeoffset"
              ? `CONVERT(nvarchar(40), ${identifier}, 127)`
              : identifier;
      return `${expression} AS ${identifier}`;
    })
    .join(", ");
  const parameters = ids.map((_, index) => `@P${index + 1}`).join(", ");
  return querySqlServer(
    `SELECT ${projection} FROM ${sqlServerTable(table)} WHERE ${sqlServerIdentifier(primaryKey)} IN (${parameters})`,
    ids,
  );
};

const executeSqlServer = async (
  query: string,
  parameters: unknown[] = [],
): Promise<void> => {
  await prisma.$executeRawUnsafe(query, ...parameters);
};

const countSqlServer = async (query: string): Promise<bigint> => {
  const rows = await querySqlServer<{ total: bigint }>(query);
  if (!rows[0]) throw new Error("SQL Server count query returned no row.");
  return BigInt(String(rows[0].total));
};

const getSourceColumns = async (
  connection: Awaited<ReturnType<typeof createConnection>>,
  table: string,
): Promise<SourceColumn[]> =>
  mysqlRows<SourceColumn & RowDataPacket>(
    connection,
    `SELECT COLUMN_NAME AS columnName, DATA_TYPE AS dataType FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ORDINAL_POSITION`,
    [table],
  );

const getSourceForeignKeys = async (
  connection: Awaited<ReturnType<typeof createConnection>>,
): Promise<ForeignKeyColumn[]> =>
  mysqlRows<ForeignKeyColumn & RowDataPacket>(
    connection,
    `SELECT TABLE_NAME AS childTable, COLUMN_NAME AS childColumn, CONSTRAINT_NAME AS constraintName, REFERENCED_TABLE_NAME AS parentTable, REFERENCED_COLUMN_NAME AS parentColumn, ORDINAL_POSITION AS position FROM information_schema.KEY_COLUMN_USAGE WHERE table_schema = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION`,
  );

const assertNoSourceOrphans = async (
  connection: Awaited<ReturnType<typeof createConnection>>,
): Promise<number> => {
  const keys = await getSourceForeignKeys(connection);
  const groups = new Map<string, ForeignKeyColumn[]>();
  for (const key of keys) {
    const groupKey = `${key.childTable}:${key.constraintName}`;
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), key]);
  }

  let checked = 0;
  for (const relation of groups.values()) {
    const child = relation[0]!.childTable;
    const parent = relation[0]!.parentTable;
    const join = relation
      .map(
        ({ childColumn, parentColumn }) =>
          `c.${mysqlIdentifier(childColumn)} = p.${mysqlIdentifier(parentColumn)}`,
      )
      .join(" AND ");
    const present = relation
      .map(({ childColumn }) => `c.${mysqlIdentifier(childColumn)} IS NOT NULL`)
      .join(" AND ");
    const total = await countMySql(
      connection,
      `SELECT COUNT(*) AS total FROM ${mysqlIdentifier(child)} AS c LEFT JOIN ${mysqlIdentifier(parent)} AS p ON ${join} WHERE ${present} AND p.${mysqlIdentifier(relation[0]!.parentColumn)} IS NULL`,
    );
    if (total > 0n) {
      throw new Error(
        `MySQL source contains ${total} orphan row(s) in ${child}.${relation[0]!.childColumn}.`,
      );
    }
    checked += 1;
  }
  return checked;
};

const getTargetMetadata = async (): Promise<{
  columnsByTable: Map<string, TargetColumn[]>;
  foreignKeys: ForeignKeyColumn[];
  primaryKeys: Map<string, string[]>;
  tables: string[];
}> => {
  const [tables, columns, primaryKeys, foreignKeys] = await Promise.all([
    querySqlServer<{ tableName: string }>(
      `SELECT t.[name] AS [tableName] FROM [sys].[tables] AS t INNER JOIN [sys].[schemas] AS s ON s.[schema_id] = t.[schema_id] WHERE s.[name] = N'dbo' AND t.[is_ms_shipped] = 0 AND t.[name] <> N'${MIGRATION_TABLE}' ORDER BY t.[name]`,
    ),
    querySqlServer<TargetColumn & { tableName: string }>(
      `SELECT t.[name] AS [tableName], c.[name] AS [columnName], ty.[name] AS [dataType], c.[is_nullable] AS [isNullable], c.[is_identity] AS [isIdentity], c.[is_computed] AS [isComputed], CONVERT(bit, CASE WHEN c.[default_object_id] = 0 THEN 0 ELSE 1 END) AS [hasDefault] FROM [sys].[tables] AS t INNER JOIN [sys].[schemas] AS s ON s.[schema_id] = t.[schema_id] INNER JOIN [sys].[columns] AS c ON c.[object_id] = t.[object_id] INNER JOIN [sys].[types] AS ty ON ty.[user_type_id] = c.[user_type_id] WHERE s.[name] = N'dbo' AND t.[is_ms_shipped] = 0 AND t.[name] <> N'${MIGRATION_TABLE}' ORDER BY t.[name], c.[column_id]`,
    ),
    querySqlServer<PrimaryKeyColumn>(
      `SELECT t.[name] AS [tableName], c.[name] AS [columnName], ic.[key_ordinal] AS [keyOrdinal] FROM [sys].[tables] AS t INNER JOIN [sys].[schemas] AS s ON s.[schema_id] = t.[schema_id] INNER JOIN [sys].[indexes] AS i ON i.[object_id] = t.[object_id] AND i.[is_primary_key] = 1 INNER JOIN [sys].[index_columns] AS ic ON ic.[object_id] = i.[object_id] AND ic.[index_id] = i.[index_id] INNER JOIN [sys].[columns] AS c ON c.[object_id] = ic.[object_id] AND c.[column_id] = ic.[column_id] WHERE s.[name] = N'dbo' AND t.[name] <> N'${MIGRATION_TABLE}' ORDER BY t.[name], ic.[key_ordinal]`,
    ),
    querySqlServer<ForeignKeyColumn>(
      `SELECT child.[name] AS [childTable], childColumn.[name] AS [childColumn], fk.[name] AS [constraintName], parent.[name] AS [parentTable], parentColumn.[name] AS [parentColumn], fkc.[constraint_column_id] AS [position] FROM [sys].[foreign_key_columns] AS fkc INNER JOIN [sys].[foreign_keys] AS fk ON fk.[object_id] = fkc.[constraint_object_id] INNER JOIN [sys].[tables] AS child ON child.[object_id] = fkc.[parent_object_id] INNER JOIN [sys].[schemas] AS childSchema ON childSchema.[schema_id] = child.[schema_id] INNER JOIN [sys].[columns] AS childColumn ON childColumn.[object_id] = fkc.[parent_object_id] AND childColumn.[column_id] = fkc.[parent_column_id] INNER JOIN [sys].[tables] AS parent ON parent.[object_id] = fkc.[referenced_object_id] INNER JOIN [sys].[schemas] AS parentSchema ON parentSchema.[schema_id] = parent.[schema_id] INNER JOIN [sys].[columns] AS parentColumn ON parentColumn.[object_id] = fkc.[referenced_object_id] AND parentColumn.[column_id] = fkc.[referenced_column_id] WHERE childSchema.[name] = N'dbo' AND parentSchema.[name] = N'dbo' ORDER BY child.[name], fk.[name], fkc.[constraint_column_id]`,
    ),
  ]);

  const columnsByTable = new Map<string, TargetColumn[]>();
  for (const column of columns) {
    const { tableName, ...metadata } = column;
    columnsByTable.set(tableName, [
      ...(columnsByTable.get(tableName) ?? []),
      metadata,
    ]);
  }
  const keysByTable = new Map<string, PrimaryKeyColumn[]>();
  for (const key of primaryKeys) {
    keysByTable.set(key.tableName, [
      ...(keysByTable.get(key.tableName) ?? []),
      key,
    ]);
  }

  return {
    columnsByTable,
    foreignKeys,
    primaryKeys: new Map(
      [...keysByTable].map(([table, values]) => [
        table,
        values
          .sort((left, right) => left.keyOrdinal - right.keyOrdinal)
          .map((key) => key.columnName),
      ]),
    ),
    tables: tables.map(({ tableName }) => tableName),
  };
};

const transferOrder = (
  tables: string[],
  foreignKeys: ForeignKeyColumn[],
): string[] => {
  const dependencies = new Map(
    tables.map((table) => [table, new Set<string>()]),
  );
  for (const key of foreignKeys) {
    if (
      key.childTable === DEFERRED_FK.table &&
      key.childColumn === DEFERRED_FK.column
    ) {
      continue;
    }
    if (key.childTable !== key.parentTable) {
      dependencies.get(key.childTable)?.add(key.parentTable);
    }
  }

  const ordered: string[] = [];
  const pending = new Set(tables);
  while (pending.size > 0) {
    const ready = [...pending].filter((table) =>
      [...(dependencies.get(table) ?? [])].every(
        (parent) => !pending.has(parent),
      ),
    );
    if (ready.length === 0) {
      throw new Error(
        `SQL Server foreign-key cycle needs an explicit nullable deferred column: ${[...pending].join(", ")}.`,
      );
    }
    for (const table of ready) {
      ordered.push(table);
      pending.delete(table);
    }
  }
  return ordered;
};

const transfer = async (
  connection: Awaited<ReturnType<typeof createConnection>>,
  resume: boolean,
): Promise<void> => {
  const sourceTables = await mysqlRows<
    RowDataPacket & { engine: string | null; tableName: string }
  >(
    connection,
    `SELECT TABLE_NAME AS tableName, ENGINE AS engine FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' AND TABLE_NAME <> ? ORDER BY TABLE_NAME`,
    [MIGRATION_TABLE],
  );
  const nonTransactionalTables = sourceTables
    .filter(({ engine }) => engine?.toLowerCase() !== "innodb")
    .map(({ tableName }) => tableName);
  if (nonTransactionalTables.length > 0) {
    throw new Error(
      `MySQL snapshot transfer requires InnoDB tables: ${nonTransactionalTables.join(", ")}.`,
    );
  }
  const target = await getTargetMetadata();
  const sourceNames = sourceTables.map(({ tableName }) => tableName);
  const sourceSet = new Set(sourceNames);
  const targetSet = new Set(target.tables);
  const tableMismatches = [
    ...sourceNames
      .filter((table) => !targetSet.has(table))
      .map((table) => `source-only: ${table}`),
    ...target.tables
      .filter((table) => !sourceSet.has(table))
      .map((table) => `target-only: ${table}`),
  ];
  if (tableMismatches.length > 0) {
    throw new Error(
      `Source and target tables differ: ${tableMismatches.join(", ")}.`,
    );
  }

  const sourceOrphanChecks = await assertNoSourceOrphans(connection);
  const sourceCounts = new Map<string, bigint>();
  const targetCounts = new Map<string, bigint>();
  for (const table of sourceNames) {
    const sourceTotal = await countMySql(
      connection,
      `SELECT COUNT(*) AS total FROM ${mysqlIdentifier(table)}`,
    );
    const targetTotal = await countSqlServer(
      `SELECT COUNT_BIG(*) AS [total] FROM ${sqlServerTable(table)}`,
    );
    sourceCounts.set(table, sourceTotal);
    targetCounts.set(table, targetTotal);
  }
  const nonEmptyTarget = [...targetCounts].filter(([, count]) => count > 0n);
  if (nonEmptyTarget.length > 0 && !resume) {
    throw new Error(
      `Target tables are not empty (${nonEmptyTarget.map(([table, count]) => `${table}=${count}`).join(", ")}); rerun with --resume only to continue a previous transfer.`,
    );
  }

  const orderedTables = transferOrder(target.tables, target.foreignKeys);
  const deferredUpdates = new Map<string, DeferredUpdate[]>();
  let recordsCompared = 0;

  for (const table of orderedTables) {
    const sourceColumns = await getSourceColumns(connection, table);
    const sourceColumnByName = new Map(
      sourceColumns.map((column) => [column.columnName, column]),
    );
    const targetColumns = target.columnsByTable.get(table) ?? [];
    const targetColumnByName = new Map(
      targetColumns.map((column) => [column.columnName, column]),
    );
    const sourceOnlyColumns = sourceColumns
      .filter((column) => !targetColumnByName.has(column.columnName))
      .map((column) => column.columnName);
    if (sourceOnlyColumns.length > 0) {
      throw new Error(
        `${table} has columns missing from SQL Server: ${sourceOnlyColumns.join(", ")}.`,
      );
    }
    const missingRequiredColumns = targetColumns.filter(
      (column) =>
        !sourceColumnByName.has(column.columnName) &&
        !column.isNullable &&
        !column.hasDefault &&
        !column.isIdentity &&
        !column.isComputed,
    );
    if (missingRequiredColumns.length > 0) {
      throw new Error(
        `${table} source is missing required SQL Server columns: ${missingRequiredColumns.map((column) => column.columnName).join(", ")}.`,
      );
    }

    const columns = targetColumns
      .filter(
        (column) =>
          sourceColumnByName.has(column.columnName) && !column.isComputed,
      )
      .map((column) => column.columnName);
    const primaryKey = target.primaryKeys.get(table) ?? [];
    if (primaryKey.length !== 1 || !columns.includes(primaryKey[0]!)) {
      throw new Error(
        `${table} must have one source-backed primary key column.`,
      );
    }
    const identityColumn = targetColumns.find((column) => column.isIdentity);
    const primaryKeyColumn = primaryKey[0]!;
    const map = new Map(
      targetColumns.map((column) => [column.columnName, column]),
    );
    const pageSize = batchSizeFor(columns.length);
    const deferredColumn =
      table === DEFERRED_FK.table && columns.includes(DEFERRED_FK.column)
        ? DEFERRED_FK.column
        : null;
    let lastId: unknown;
    let transferred = 0n;

    while (true) {
      const where =
        lastId === undefined
          ? ""
          : `WHERE ${mysqlIdentifier(primaryKeyColumn)} > ? `;
      const page = await mysqlRows<MySqlRow>(
        connection,
        `SELECT * FROM ${mysqlIdentifier(table)} ${where}ORDER BY ${mysqlIdentifier(primaryKeyColumn)} LIMIT ?`,
        lastId === undefined ? [pageSize] : [lastId, pageSize],
      );
      if (page.length === 0) break;

      const records = page.map((row) => {
        const record = Object.fromEntries(
          columns.map((column) => {
            const targetColumn = map.get(column)!;
            const original = row[column];
            if (column === deferredColumn && original !== null) {
              deferredUpdates.set(table, [
                ...(deferredUpdates.get(table) ?? []),
                { id: row[primaryKeyColumn], value: original },
              ]);
              return [column, null];
            }
            return [
              column,
              transformValue(
                original,
                sourceColumnByName.get(column)?.dataType.toLowerCase() ?? "",
                targetColumn.dataType.toLowerCase(),
              ),
            ];
          }),
        );
        return record;
      });
      const merge = buildMergeStatement(
        table,
        columns,
        primaryKey,
        records.length,
      );
      const parameters = records.flatMap((record) =>
        columns.map((column) => record[column]),
      );
      await prisma.$transaction(
        async (tx) => {
          if (identityColumn) {
            await tx.$executeRawUnsafe(
              `SET IDENTITY_INSERT ${sqlServerTable(table)} ON`,
            );
          }
          try {
            await tx.$executeRawUnsafe(merge, ...parameters);
          } finally {
            if (identityColumn) {
              await tx.$executeRawUnsafe(
                `SET IDENTITY_INSERT ${sqlServerTable(table)} OFF`,
              );
            }
          }
        },
        { maxWait: 15_000, timeout: 120_000 },
      );

      const targetRows = await readTargetRows(
        table,
        columns,
        primaryKeyColumn,
        records.map((record) => record[primaryKeyColumn]),
        map,
      );
      const targetById = new Map(
        targetRows.map((row) => [String(row[primaryKeyColumn]), row]),
      );
      for (const record of records) {
        const id = record[primaryKeyColumn];
        const actual = targetById.get(String(id));
        if (
          !actual ||
          tableRowHash(record, columns, sourceColumnByName, map) !==
            tableRowHash(actual, columns, sourceColumnByName, map)
        ) {
          throw new Error(
            `Row reconciliation failed for ${table} (${String(id)}).`,
          );
        }
        recordsCompared += 1;
      }

      lastId = page.at(-1)![primaryKeyColumn];
      transferred += BigInt(page.length);
      if (
        transferred % BigInt(pageSize * 10) === 0n ||
        transferred === sourceCounts.get(table)
      ) {
        console.info(
          `${table}: ${transferred}/${sourceCounts.get(table)} rows copied`,
        );
      }
    }
    if (identityColumn) {
      await executeSqlServer(
        `DBCC CHECKIDENT (N'dbo.${table.replaceAll("'", "''")}', RESEED)`,
      );
    }
  }

  for (const [table, updates] of deferredUpdates) {
    const batchSize = batchSizeFor(2);
    for (let offset = 0; offset < updates.length; offset += batchSize) {
      const batch = updates.slice(offset, offset + batchSize);
      const source = batch
        .map((_, index) => `(@P${index * 2 + 1}, @P${index * 2 + 2})`)
        .join(", ");
      const sql = `MERGE ${sqlServerTable(table)} WITH (HOLDLOCK) AS target USING (VALUES ${source}) AS source ([id], [${DEFERRED_FK.column}]) ON target.[id] = source.[id] WHEN MATCHED THEN UPDATE SET target.[${DEFERRED_FK.column}] = source.[${DEFERRED_FK.column}];`;
      await executeSqlServer(
        sql,
        batch.flatMap(({ id, value }) => [id, value]),
      );

      const sourceColumns = new Map(
        (await getSourceColumns(connection, table)).map((column) => [
          column.columnName,
          column,
        ]),
      );
      const targetColumns = new Map(
        (target.columnsByTable.get(table) ?? []).map((column) => [
          column.columnName,
          column,
        ]),
      );
      const rows = await readTargetRows(
        table,
        ["id", DEFERRED_FK.column],
        "id",
        batch.map(({ id }) => id),
        targetColumns,
      );
      const rowsById = new Map(rows.map((row) => [String(row.id), row]));
      for (const expected of batch) {
        const actual = rowsById.get(String(expected.id));
        if (
          !actual ||
          tableRowHash(
            { [DEFERRED_FK.column]: expected.value },
            [DEFERRED_FK.column],
            sourceColumns,
            targetColumns,
          ) !==
            tableRowHash(
              { [DEFERRED_FK.column]: actual[DEFERRED_FK.column] },
              [DEFERRED_FK.column],
              sourceColumns,
              targetColumns,
            )
        ) {
          throw new Error(
            `Deferred relationship reconciliation failed for ${table} (${String(expected.id)}).`,
          );
        }
      }
    }
  }

  const targetOrphanChecks = await assertNoTargetOrphans(target.foreignKeys);
  const mismatchedCounts = [] as string[];
  for (const table of sourceNames) {
    const targetTotal = await countSqlServer(
      `SELECT COUNT_BIG(*) AS [total] FROM ${sqlServerTable(table)}`,
    );
    if (targetTotal !== sourceCounts.get(table)) {
      mismatchedCounts.push(
        `${table}: source=${sourceCounts.get(table)}, target=${targetTotal}`,
      );
    }
    targetCounts.set(table, targetTotal);
  }
  if (mismatchedCounts.length > 0) {
    throw new Error(
      `Row-count reconciliation failed: ${mismatchedCounts.join("; ")}.`,
    );
  }

  console.info(
    `Transfer reconciled: ${sourceNames.length} tables, ${sourceOrphanChecks} source FK checks, ${targetOrphanChecks} target FK checks, ${recordsCompared} rows compared.`,
  );
};

const assertNoTargetOrphans = async (
  foreignKeys: ForeignKeyColumn[],
): Promise<number> => {
  const groups = new Map<string, ForeignKeyColumn[]>();
  for (const key of foreignKeys) {
    const groupKey = `${key.childTable}:${key.constraintName}`;
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), key]);
  }
  let checked = 0;
  for (const relation of groups.values()) {
    const join = relation
      .map(
        ({ childColumn, parentColumn }) =>
          `c.${sqlServerIdentifier(childColumn)} = p.${sqlServerIdentifier(parentColumn)}`,
      )
      .join(" AND ");
    const present = relation
      .map(
        ({ childColumn }) =>
          `c.${sqlServerIdentifier(childColumn)} IS NOT NULL`,
      )
      .join(" AND ");
    const total = await countSqlServer(
      `SELECT COUNT_BIG(*) AS [total] FROM ${sqlServerTable(relation[0]!.childTable)} AS c LEFT JOIN ${sqlServerTable(relation[0]!.parentTable)} AS p ON ${join} WHERE ${present} AND p.${sqlServerIdentifier(relation[0]!.parentColumn)} IS NULL`,
    );
    if (total > 0n) {
      throw new Error(
        `SQL Server target contains ${total} orphan row(s) in ${relation[0]!.childTable}.${relation[0]!.childColumn}.`,
      );
    }
    checked += 1;
  }
  return checked;
};

const main = async (): Promise<void> => {
  const sourceUrl = process.env.MYSQL_SOURCE_URL;
  if (!sourceUrl)
    throw new Error("Set MYSQL_SOURCE_URL to the read-only MySQL source.");
  const resume = process.argv.includes("--resume");
  const url = new URL(sourceUrl);
  if (
    !["mysql:", "mysql2:"].includes(url.protocol) ||
    !url.hostname ||
    !url.pathname.slice(1)
  ) {
    throw new Error(
      "MYSQL_SOURCE_URL must include a hostname and database name.",
    );
  }
  if (
    [...url.searchParams.keys()].some((key) => key !== "ssl") ||
    (url.searchParams.has("ssl") && url.searchParams.get("ssl") !== "true")
  ) {
    throw new Error(
      "MYSQL_SOURCE_URL supports only the ssl=true query option; use a read-only source account.",
    );
  }
  const caPath = process.env.MYSQL_SOURCE_SSL_CA;
  const useTls = url.searchParams.get("ssl") === "true" || Boolean(caPath);
  const connection = await createConnection({
    bigNumberStrings: true,
    connectTimeout: 15_000,
    database: decodeURIComponent(url.pathname.slice(1)),
    dateStrings: true,
    host: url.hostname,
    jsonStrings: true,
    ...(useTls
      ? {
          ssl: {
            ...(caPath ? { ca: readFileSync(caPath, "utf8") } : {}),
            rejectUnauthorized: true,
          },
        }
      : {}),
    password: decodeURIComponent(url.password),
    port: url.port ? Number(url.port) : 3306,
    supportBigNumbers: true,
    timezone: "Z",
    user: decodeURIComponent(url.username),
  });
  try {
    await connection.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await connection.query(
      "START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY",
    );
    await transfer(connection, resume);
  } finally {
    try {
      await connection.rollback();
    } finally {
      await connection.end();
      await prisma.$disconnect();
    }
  }
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void main().catch((error: unknown) => {
    console.error("MySQL to SQL Server transfer failed.");
    console.error(error);
    process.exitCode = 1;
  });
}
