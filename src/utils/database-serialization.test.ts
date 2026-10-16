import assert from "node:assert/strict";
import test from "node:test";

import {
  ActionPlanStatus,
  WorkflowNodeType,
  parseDatabaseEnum,
} from "../types/database-enums.js";
import {
  parseDatabaseJson,
  parseDatabaseJsonArray,
  toDatabaseJson,
} from "../services/logging-utils.js";
import {
  batchSizeFor,
  buildMergeStatement,
  tableRowHash,
  type SourceColumn,
  type TargetColumn,
} from "../../scripts/sqlserver-transfer-utils.js";
import { resolveAdminSeedConfigs } from "../../prisma/admin-seed-config.js";

test("string-backed JSON preserves nested workflow data and null values", () => {
  const input = {
    configuration: { label: "Revisión", retries: 2 },
    history: [{ status: "APPROVED", comment: null }],
  };

  assert.deepEqual(parseDatabaseJson(toDatabaseJson(input), "workflow"), input);
  assert.equal(parseDatabaseJson(toDatabaseJson(null), "nullable-json"), null);
  assert.equal(parseDatabaseJson(null, "nullable-column"), null);
});

test("string-backed JSON arrays reject malformed or wrong-shaped stored values", () => {
  assert.deepEqual(parseDatabaseJsonArray('["a", {"b": 1}]', "history"), [
    "a",
    { b: 1 },
  ]);
  assert.deepEqual(parseDatabaseJsonArray(null, "history"), []);
  assert.throws(
    () => parseDatabaseJson("{", "workflow"),
    /Invalid JSON stored/,
  );
  assert.throws(
    () => parseDatabaseJsonArray("{}", "history"),
    /Invalid array stored/,
  );
});

test("SQL Server enum strings are checked against the application constants", () => {
  assert.equal(
    parseDatabaseEnum(ActionPlanStatus, "CONCLUDED", "actionPlan.status"),
    "CONCLUDED",
  );
  assert.equal(
    parseDatabaseEnum(WorkflowNodeType, "SUBFLOW", "workflowNode.type"),
    "SUBFLOW",
  );
  assert.throws(
    () => parseDatabaseEnum(ActionPlanStatus, "UNKNOWN", "actionPlan.status"),
    /Invalid value stored/,
  );
});

test("MySQL transfer batches stay below SQL Server's parameter limit and do not overwrite target rows", () => {
  assert.equal(batchSizeFor(25), 80);
  assert.equal(batchSizeFor(2_500), 1);

  const sql = buildMergeStatement("things", ["id", "name"], ["id"], 2);
  assert.match(sql, /@P1.*@P2.*@P3.*@P4/);
  assert.match(sql, /WHEN NOT MATCHED THEN INSERT/);
  assert.doesNotMatch(sql, /WHEN MATCHED THEN UPDATE/);
});

test("transfer row hashes normalize JSON key order and SQL Server date formatting", () => {
  const sourceColumns = new Map<string, SourceColumn>([
    ["payload", { columnName: "payload", dataType: "json" }],
    ["createdAt", { columnName: "createdAt", dataType: "datetime" }],
  ]);
  const targetColumns = new Map<string, TargetColumn>([
    [
      "payload",
      {
        columnName: "payload",
        dataType: "nvarchar",
        hasDefault: false,
        isComputed: false,
        isIdentity: false,
        isNullable: true,
      },
    ],
    [
      "createdAt",
      {
        columnName: "createdAt",
        dataType: "datetime2",
        hasDefault: false,
        isComputed: false,
        isIdentity: false,
        isNullable: false,
      },
    ],
  ]);
  const columns = ["payload", "createdAt"];

  assert.equal(
    tableRowHash(
      { payload: '{"b":2,"a":1}', createdAt: "2026-01-02 03:04:05.123" },
      columns,
      sourceColumns,
      targetColumns,
    ),
    tableRowHash(
      { payload: '{"a":1,"b":2}', createdAt: "2026-01-02T03:04:05.123" },
      columns,
      sourceColumns,
      targetColumns,
    ),
  );
});

test("transfer row hashes normalize MySQL booleans to SQL Server BIT", () => {
  const sourceColumns = new Map<string, SourceColumn>([
    ["active", { columnName: "active", dataType: "tinyint" }],
  ]);
  const targetColumns = new Map<string, TargetColumn>([
    [
      "active",
      {
        columnName: "active",
        dataType: "bit",
        hasDefault: false,
        isComputed: false,
        isIdentity: false,
        isNullable: false,
      },
    ],
  ]);

  assert.equal(
    tableRowHash({ active: 1 }, ["active"], sourceColumns, targetColumns),
    tableRowHash({ active: true }, ["active"], sourceColumns, targetColumns),
  );
});

test("production seeding requires an explicitly configured administrator", () => {
  assert.throws(
    () => resolveAdminSeedConfigs({ NODE_ENV: "production" }),
    /Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD explicitly/,
  );
  assert.deepEqual(
    resolveAdminSeedConfigs({
      NODE_ENV: "production",
      SEED_ADMIN_EMAIL: "admin@example.com",
      SEED_ADMIN_PASSWORD: "use-a-secret-value",
    }),
    [
      {
        email: "admin@example.com",
        name: "System Administrator",
        password: "use-a-secret-value",
        source: "env",
      },
    ],
  );
});
