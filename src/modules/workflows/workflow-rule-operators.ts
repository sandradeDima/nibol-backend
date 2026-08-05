import {
  getWorkflowRuleField,
  normalizeWorkflowRuleValue,
  type WorkflowConditionField,
  type WorkflowConditionOperator,
  type WorkflowSimulationContext,
} from "./workflow-rule-fields.js";

export type WorkflowRuleCondition = {
  conditionId?: string | null | undefined;
  field: string;
  operator: string;
  sequence?: number | undefined;
  value?: unknown | undefined;
};

export type WorkflowRuleEvaluationOptions = {
  detailed?: boolean;
  now: Date;
  shortCircuit?: boolean;
};

export type WorkflowRuleEvaluation = {
  actualValue: unknown;
  conditionId: string;
  expectedValue: unknown;
  field: string;
  matched: boolean;
  message: string;
  operator: string;
};

const isEmpty = (value: unknown): boolean => {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
};

const parseDateUtc = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const trimmed = value.trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? new Date(`${trimmed}T00:00:00.000Z`)
    : new Date(trimmed);

  return Number.isNaN(date.getTime()) ? null : date;
};

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "vacío";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  return String(value);
};

const comparePrimitive = (
  actual: unknown,
  expected: unknown,
  operator: WorkflowConditionOperator,
): boolean => {
  switch (operator) {
    case "EQUALS":
      return actual === expected;
    case "NOT_EQUALS":
      return actual !== expected;
    case "GREATER_THAN":
      return typeof actual === "number" && typeof expected === "number"
        ? actual > expected
        : false;
    case "LESS_THAN":
      return typeof actual === "number" && typeof expected === "number"
        ? actual < expected
        : false;
    case "GREATER_THAN_OR_EQUAL":
      return typeof actual === "number" && typeof expected === "number"
        ? actual >= expected
        : false;
    case "LESS_THAN_OR_EQUAL":
      return typeof actual === "number" && typeof expected === "number"
        ? actual <= expected
        : false;
    case "CONTAINS":
      return typeof actual === "string" && typeof expected === "string"
        ? actual.includes(expected)
        : false;
    case "NOT_CONTAINS":
      return typeof actual === "string" && typeof expected === "string"
        ? !actual.includes(expected)
        : false;
    case "IN":
      return Array.isArray(expected) && expected.includes(actual);
    case "NOT_IN":
      return Array.isArray(expected) && !expected.includes(actual);
    case "IS_EMPTY":
    case "IS_NOT_EMPTY":
    case "IS_OVERDUE":
    case "DUE_WITHIN":
      return false;
  }
};

const normalizeExpectedValue = (
  field: WorkflowConditionField,
  operator: WorkflowConditionOperator,
  value: unknown,
): unknown => {
  if (
    operator === "IS_EMPTY" ||
    operator === "IS_NOT_EMPTY" ||
    operator === "IS_OVERDUE"
  ) {
    return null;
  }

  if (operator === "DUE_WITHIN") {
    const days = Number(value);
    return Number.isFinite(days) ? days : null;
  }

  if (operator === "IN" || operator === "NOT_IN") {
    return Array.isArray(value)
      ? value.map((item) => normalizeWorkflowRuleValue(field, item))
      : value;
  }

  return normalizeWorkflowRuleValue(field, value);
};

export const validateWorkflowRule = (
  rule: WorkflowRuleCondition,
): string | null => {
  const field = getWorkflowRuleField(rule.field);
  if (!field) {
    return "El campo de la regla no está soportado.";
  }

  if (
    !field.allowedOperators.includes(rule.operator as WorkflowConditionOperator)
  ) {
    return `El operador ${rule.operator} no es compatible con ${field.label}.`;
  }

  const operator = rule.operator as WorkflowConditionOperator;
  const noValueOperator = ["IS_EMPTY", "IS_NOT_EMPTY", "IS_OVERDUE"].includes(
    operator,
  );

  if (noValueOperator) {
    if (rule.value !== undefined && rule.value !== null && rule.value !== "") {
      return "Este operador no admite un valor.";
    }
    return null;
  }

  if (rule.value === undefined || rule.value === null || rule.value === "") {
    return "Ingrese un valor para esta regla.";
  }

  if (
    (operator === "IN" || operator === "NOT_IN") &&
    !Array.isArray(rule.value)
  ) {
    return "Use una lista de valores para este operador.";
  }

  if (operator === "DUE_WITHIN") {
    const days = Number(rule.value);
    if (!Number.isFinite(days) || days < 0) {
      return "DUE_WITHIN requiere una cantidad de días válida.";
    }
  }

  const normalized = normalizeExpectedValue(field.key, operator, rule.value);
  const values = Array.isArray(normalized) ? normalized : [normalized];
  if (values.some((value) => value === null || value === undefined)) {
    return `El valor no es válido para ${field.label}.`;
  }

  return null;
};

const evaluateDateOperator = (
  actualValue: unknown,
  expectedValue: unknown,
  operator: WorkflowConditionOperator,
  now: Date,
): boolean => {
  const actualDate = parseDateUtc(actualValue);
  if (!actualDate) return false;

  if (operator === "IS_OVERDUE") {
    return actualDate.getTime() < now.getTime();
  }

  if (operator === "DUE_WITHIN") {
    const days = Number(expectedValue);
    if (!Number.isFinite(days) || days < 0) return false;
    const deadline = new Date(now.getTime() + days * 86_400_000);
    return (
      actualDate.getTime() >= now.getTime() &&
      actualDate.getTime() <= deadline.getTime()
    );
  }

  if (operator === "IN" || operator === "NOT_IN") return false;

  const expectedDate = parseDateUtc(expectedValue);
  if (!expectedDate) return false;

  switch (operator) {
    case "EQUALS":
      return actualDate.getTime() === expectedDate.getTime();
    case "NOT_EQUALS":
      return actualDate.getTime() !== expectedDate.getTime();
    case "GREATER_THAN":
      return actualDate.getTime() > expectedDate.getTime();
    case "LESS_THAN":
      return actualDate.getTime() < expectedDate.getTime();
    case "GREATER_THAN_OR_EQUAL":
      return actualDate.getTime() >= expectedDate.getTime();
    case "LESS_THAN_OR_EQUAL":
      return actualDate.getTime() <= expectedDate.getTime();
    default:
      return false;
  }
};

export const evaluateWorkflowRule = (
  rule: WorkflowRuleCondition,
  context: WorkflowSimulationContext,
  options: WorkflowRuleEvaluationOptions,
  sequence = 0,
): WorkflowRuleEvaluation => {
  const field = getWorkflowRuleField(rule.field);
  const operator = rule.operator as WorkflowConditionOperator;
  const conditionId = rule.conditionId ?? `condition-${sequence + 1}`;
  const actualValue = field ? field.normalize(context[field.key]) : undefined;
  const validationError = validateWorkflowRule(rule);
  const expectedValue = field
    ? normalizeExpectedValue(field.key, operator, rule.value)
    : rule.value;

  if (validationError || !field) {
    return {
      actualValue,
      conditionId,
      expectedValue,
      field: rule.field,
      matched: false,
      message: validationError ?? "El campo de la regla no está soportado.",
      operator: rule.operator,
    };
  }

  const matched =
    operator === "IS_EMPTY"
      ? isEmpty(actualValue)
      : operator === "IS_NOT_EMPTY"
        ? !isEmpty(actualValue)
        : field.dataType === "date"
          ? evaluateDateOperator(
              actualValue,
              expectedValue,
              operator,
              options.now,
            )
          : comparePrimitive(actualValue, expectedValue, operator);

  const message = matched
    ? `${field.label}: ${formatValue(actualValue)} cumple ${operator} ${formatValue(expectedValue)}.`
    : `${field.label}: ${formatValue(actualValue)} no cumple ${operator} ${formatValue(expectedValue)}.`;

  return {
    actualValue,
    conditionId,
    expectedValue,
    field: field.key,
    matched,
    message,
    operator,
  };
};
