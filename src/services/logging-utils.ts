import type { Prisma } from "../../generated/prisma/client.js";

export type JsonObject = Record<string, Prisma.InputJsonValue | null>;

export type LogActorContext = {
  ipAddress?: string | null;
  userId?: string | null;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

export const toLogJsonValue = (value: unknown): Prisma.InputJsonValue | null => {
  if (value === null) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => toLogJsonValue(item))
      .filter((item) => item !== undefined) as Prisma.InputJsonArray;
  }

  if (isPlainObject(value)) {
    return Object.entries(value).reduce<JsonObject>((result, [key, entryValue]) => {
      const serializedValue = toLogJsonValue(entryValue);

      if (serializedValue !== undefined) {
        result[key] = serializedValue;
      }

      return result;
    }, {}) as Prisma.InputJsonObject;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }

  return String(value);
};

export const normalizeStringArray = (values: string[]): string[] => {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)),
  ).sort((left, right) => left.localeCompare(right));
};

export const areStringArraysEqual = (
  leftValues: string[],
  rightValues: string[],
): boolean => {
  const left = normalizeStringArray(leftValues);
  const right = normalizeStringArray(rightValues);

  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
};

export const buildDateRangeFilter = (
  dateFrom?: string,
  dateTo?: string,
): { gte?: Date; lt?: Date } | undefined => {
  if (!dateFrom && !dateTo) {
    return undefined;
  }

  const result: { gte?: Date; lt?: Date } = {};

  if (dateFrom) {
    result.gte = new Date(`${dateFrom}T00:00:00.000Z`);
  }

  if (dateTo) {
    const end = new Date(`${dateTo}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    result.lt = end;
  }

  return result;
};

export const titleCaseEntityType = (value: string): string => {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

export type DerivedAuditAction = "Created" | "Deleted" | "Updated";

export const deriveAuditAction = (
  oldValues: unknown,
  newValues: unknown,
): DerivedAuditAction => {
  if (oldValues == null && newValues != null) {
    return "Created";
  }

  if (oldValues != null && newValues == null) {
    return "Deleted";
  }

  return "Updated";
};
