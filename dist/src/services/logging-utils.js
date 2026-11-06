const isPlainObject = (value) => {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
};
const toJsonCompatibleValue = (value) => {
    if (value === null) {
        return null;
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (Array.isArray(value)) {
        return value
            .map((item) => toJsonCompatibleValue(item))
            .filter((item) => item !== undefined);
    }
    if (isPlainObject(value)) {
        return Object.entries(value).reduce((result, [key, entryValue]) => {
            const serializedValue = toJsonCompatibleValue(entryValue);
            if (serializedValue !== undefined) {
                result[key] = serializedValue;
            }
            return result;
        }, {});
    }
    if (typeof value === "bigint") {
        return value.toString();
    }
    if (typeof value === "boolean" ||
        typeof value === "number" ||
        typeof value === "string") {
        return value;
    }
    return String(value);
};
export const toDatabaseJson = (value) => {
    const serialized = JSON.stringify(toJsonCompatibleValue(value));
    if (serialized === undefined) {
        throw new TypeError("El valor no se puede serializar como JSON.");
    }
    return serialized;
};
export const parseDatabaseJson = (serialized, field, validate) => {
    if (serialized === null || serialized === undefined)
        return null;
    let value;
    try {
        value = JSON.parse(serialized);
    }
    catch (cause) {
        throw new Error(`El JSON almacenado en ${field} no es válido.`, { cause });
    }
    return validate ? validate(value) : value;
};
export const parseDatabaseJsonArray = (serialized, field) => {
    const value = parseDatabaseJson(serialized, field);
    if (value === null)
        return [];
    if (!Array.isArray(value))
        throw new Error(`El arreglo almacenado en ${field} no es válido.`);
    return value;
};
export const normalizeStringArray = (values) => {
    return Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))).sort((left, right) => left.localeCompare(right));
};
export const areStringArraysEqual = (leftValues, rightValues) => {
    const left = normalizeStringArray(leftValues);
    const right = normalizeStringArray(rightValues);
    if (left.length !== right.length) {
        return false;
    }
    return left.every((value, index) => value === right[index]);
};
export const buildDateRangeFilter = (dateFrom, dateTo) => {
    if (!dateFrom && !dateTo) {
        return undefined;
    }
    const result = {};
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
export const titleCaseEntityType = (value) => {
    return value
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
};
export const deriveAuditAction = (oldValues, newValues) => {
    if (oldValues == null && newValues != null) {
        return "Created";
    }
    if (oldValues != null && newValues == null) {
        return "Deleted";
    }
    return "Updated";
};
//# sourceMappingURL=logging-utils.js.map