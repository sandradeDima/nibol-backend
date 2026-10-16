import { createHash } from "node:crypto";

export type SourceColumn = { columnName: string; dataType: string };
export type TargetColumn = {
  columnName: string;
  dataType: string;
  hasDefault: boolean;
  isComputed: boolean;
  isIdentity: boolean;
  isNullable: boolean;
};

export const sqlServerIdentifier = (value: string): string =>
  `[${value.replaceAll("]", "]]")}]`;

export const buildMergeStatement = (
  table: string,
  columns: string[],
  keyColumns: string[],
  rowCount: number,
): string => {
  const sourceRows: string[] = [];
  let parameter = 1;
  for (let row = 0; row < rowCount; row += 1) {
    sourceRows.push(`(${columns.map(() => `@P${parameter++}`).join(", ")})`);
  }

  const sourceColumns = columns.map(sqlServerIdentifier).join(", ");
  const on = keyColumns
    .map(
      (column) =>
        `target.${sqlServerIdentifier(column)} = source.${sqlServerIdentifier(column)}`,
    )
    .join(" AND ");
  const insertColumns = columns.map(sqlServerIdentifier).join(", ");
  const insertValues = columns
    .map((column) => `source.${sqlServerIdentifier(column)}`)
    .join(", ");

  return `MERGE [dbo].${sqlServerIdentifier(table)} WITH (HOLDLOCK) AS target USING (VALUES ${sourceRows.join(", ")}) AS source (${sourceColumns}) ON ${on} WHEN NOT MATCHED THEN INSERT (${insertColumns}) VALUES (${insertValues});`;
};

export const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null && !Buffer.isBuffer(value)) {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
};

export const canonicalValue = (
  value: unknown,
  sourceType: string,
  targetType: string,
): unknown => {
  if (value === null || value === undefined) return null;
  if (targetType === "bit") {
    const bit = Buffer.isBuffer(value) && value.length === 1 ? value[0] : value;
    if (bit === true || bit === 1 || bit === "1") return true;
    if (bit === false || bit === 0 || bit === "0") return false;
  }
  if (Buffer.isBuffer(value)) return value.toString("base64");
  if (sourceType === "json") {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return stableJson(parsed);
  }
  if (
    [
      "date",
      "datetime",
      "datetime2",
      "smalldatetime",
      "datetimeoffset",
    ].includes(targetType)
  ) {
    if (targetType === "date") {
      return value instanceof Date
        ? value.toISOString().slice(0, 10)
        : String(value).slice(0, 10);
    }
    if (value instanceof Date) return value.toISOString().replace(/Z$/, "");
    const timestamp = String(value).replace(" ", "T");
    return /\.\d+$/.test(timestamp) ? timestamp : `${timestamp}.000`;
  }
  if (["decimal", "numeric", "money", "smallmoney"].includes(targetType)) {
    const decimal = String(value);
    const [whole = "0", fraction = ""] = decimal.split(".");
    const normalizedWhole = whole.replace(/^(-?)0+(?=\d)/, "$1");
    const normalizedFraction = fraction.replace(/0+$/, "");
    return normalizedFraction
      ? `${normalizedWhole}.${normalizedFraction}`
      : normalizedWhole;
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "object") return stableJson(value);
  return value;
};

export const tableRowHash = (
  row: Record<string, unknown>,
  columns: string[],
  sourceColumns: Map<string, SourceColumn>,
  targetColumns: Map<string, TargetColumn>,
): string => {
  const normalized = Object.fromEntries(
    [...columns]
      .sort()
      .map((column) => [
        column,
        canonicalValue(
          row[column],
          sourceColumns.get(column)?.dataType.toLowerCase() ?? "",
          targetColumns.get(column)?.dataType.toLowerCase() ?? "",
        ),
      ]),
  );
  return createHash("sha256").update(stableJson(normalized)).digest("hex");
};

export const transformValue = (
  value: unknown,
  sourceType: string,
  targetType: string,
): unknown => {
  if (value === undefined) return null;
  if (targetType === "bit") {
    const bit = Buffer.isBuffer(value) && value.length === 1 ? value[0] : value;
    if (bit === true || bit === 1 || bit === "1") return true;
    if (bit === false || bit === 0 || bit === "0") return false;
  }
  if (sourceType === "json" && value !== null) {
    const serialized =
      typeof value === "string" ? value : JSON.stringify(value);
    JSON.parse(serialized);
    return serialized;
  }
  if (
    typeof value === "string" &&
    [
      "date",
      "datetime",
      "datetime2",
      "smalldatetime",
      "datetimeoffset",
    ].includes(targetType)
  ) {
    return targetType === "date" ? value.slice(0, 10) : value.replace(" ", "T");
  }
  return value;
};

export const batchSizeFor = (columnCount: number): number =>
  Math.max(1, Math.min(100, Math.floor(2000 / columnCount)));
