import {
  WORKFLOW_CONDITION_FIELD_ALIASES,
  WORKFLOW_CONDITION_FIELD_VALUES,
} from "./workflows.constants.js";
import type { WORKFLOW_CONDITION_OPERATOR_VALUES } from "./workflows.constants.js";

export type WorkflowConditionField =
  (typeof WORKFLOW_CONDITION_FIELD_VALUES)[number];
export type WorkflowConditionOperator =
  (typeof WORKFLOW_CONDITION_OPERATOR_VALUES)[number];
export type WorkflowRuleValue = string | number | boolean | null;
export type WorkflowRuleDataType = "boolean" | "date" | "number" | "string";

export type WorkflowSimulationContext = {
  processType: string;
  riskLevel?: string | null;
  observationStatus?: string | null;
  areaId?: string | null;
  responsibleUserId?: string | null;
  dueDate?: string | null;
  daysOverdue?: number | null;
  hasEvidence?: boolean | null;
  evidenceCount?: number | null;
  remediationPlanStatus?: string | null;
  requestType?: string | null;
  requestedExtensionDays?: number | null;
  previousDecision?: string | null;
  currentNodeKey?: string | null;
  requesterUserId?: string | null;
};

export type WorkflowFieldDefinition = {
  allowedOperators: readonly WorkflowConditionOperator[];
  catalogSource?: string;
  dataType: WorkflowRuleDataType;
  key: WorkflowConditionField;
  label: string;
  normalize: (value: unknown) => unknown;
  required: boolean;
  valueSource: "context";
};

const normalizeText = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeToken = (value: unknown): string | null => {
  const normalized = normalizeText(value);
  return normalized
    ? normalized
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
    : null;
};

const normalizeCatalogToken = (value: unknown): string | null => {
  const token = normalizeToken(value);

  if (!token) {
    return null;
  }

  const aliases: Record<string, string> = {
    CRITICAL: "ALTO",
    HIGH: "ALTO",
    LOW: "BAJO",
    MEDIUM: "MEDIO",
  };

  return aliases[token] ?? token;
};

const normalizeIdentifier = (value: unknown): string | null =>
  normalizeText(value);

const normalizeNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const normalizeBoolean = (value: unknown): boolean | null => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (value.trim().toLowerCase() === "true") return true;
    if (value.trim().toLowerCase() === "false") return false;
  }

  return null;
};

const stringOperators: readonly WorkflowConditionOperator[] = [
  "EQUALS",
  "NOT_EQUALS",
  "CONTAINS",
  "NOT_CONTAINS",
  "IN",
  "NOT_IN",
  "IS_EMPTY",
  "IS_NOT_EMPTY",
];

const numberOperators: readonly WorkflowConditionOperator[] = [
  "EQUALS",
  "NOT_EQUALS",
  "GREATER_THAN",
  "LESS_THAN",
  "GREATER_THAN_OR_EQUAL",
  "LESS_THAN_OR_EQUAL",
  "IN",
  "NOT_IN",
  "IS_EMPTY",
  "IS_NOT_EMPTY",
];

const booleanOperators: readonly WorkflowConditionOperator[] = [
  "EQUALS",
  "NOT_EQUALS",
  "IS_EMPTY",
  "IS_NOT_EMPTY",
];

const dateOperators: readonly WorkflowConditionOperator[] = [
  "EQUALS",
  "NOT_EQUALS",
  "GREATER_THAN",
  "LESS_THAN",
  "GREATER_THAN_OR_EQUAL",
  "LESS_THAN_OR_EQUAL",
  "IS_OVERDUE",
  "DUE_WITHIN",
  "IS_EMPTY",
  "IS_NOT_EMPTY",
];

export const WORKFLOW_RULE_FIELDS: Record<
  WorkflowConditionField,
  WorkflowFieldDefinition
> = {
  areaId: {
    allowedOperators: stringOperators,
    catalogSource: "areas",
    dataType: "string",
    key: "areaId",
    label: "Área",
    normalize: normalizeIdentifier,
    required: false,
    valueSource: "context",
  },
  daysOverdue: {
    allowedOperators: numberOperators,
    dataType: "number",
    key: "daysOverdue",
    label: "Días vencidos",
    normalize: normalizeNumber,
    required: false,
    valueSource: "context",
  },
  dueDate: {
    allowedOperators: dateOperators,
    dataType: "date",
    key: "dueDate",
    label: "Fecha límite",
    normalize: normalizeText,
    required: false,
    valueSource: "context",
  },
  evidenceCount: {
    allowedOperators: numberOperators,
    dataType: "number",
    key: "evidenceCount",
    label: "Cantidad de evidencias",
    normalize: normalizeNumber,
    required: false,
    valueSource: "context",
  },
  hasEvidence: {
    allowedOperators: booleanOperators,
    dataType: "boolean",
    key: "hasEvidence",
    label: "Evidencia presente",
    normalize: normalizeBoolean,
    required: false,
    valueSource: "context",
  },
  observationStatus: {
    allowedOperators: stringOperators,
    catalogSource: "observationStatuses",
    dataType: "string",
    key: "observationStatus",
    label: "Estado de observación",
    normalize: normalizeCatalogToken,
    required: false,
    valueSource: "context",
  },
  previousDecision: {
    allowedOperators: stringOperators,
    dataType: "string",
    key: "previousDecision",
    label: "Decisión anterior",
    normalize: normalizeCatalogToken,
    required: false,
    valueSource: "context",
  },
  processType: {
    allowedOperators: stringOperators,
    catalogSource: "workflow_process_type",
    dataType: "string",
    key: "processType",
    label: "Tipo de proceso",
    normalize: normalizeCatalogToken,
    required: true,
    valueSource: "context",
  },
  remediationPlanStatus: {
    allowedOperators: stringOperators,
    catalogSource: "remediationPlanStatuses",
    dataType: "string",
    key: "remediationPlanStatus",
    label: "Estado del plan de remediación",
    normalize: normalizeCatalogToken,
    required: false,
    valueSource: "context",
  },
  requestType: {
    allowedOperators: stringOperators,
    dataType: "string",
    key: "requestType",
    label: "Tipo de solicitud",
    normalize: normalizeCatalogToken,
    required: false,
    valueSource: "context",
  },
  requestedExtensionDays: {
    allowedOperators: numberOperators,
    dataType: "number",
    key: "requestedExtensionDays",
    label: "Días de ampliación solicitados",
    normalize: normalizeNumber,
    required: false,
    valueSource: "context",
  },
  responsibleUserId: {
    allowedOperators: stringOperators,
    catalogSource: "users",
    dataType: "string",
    key: "responsibleUserId",
    label: "Usuario responsable",
    normalize: normalizeIdentifier,
    required: false,
    valueSource: "context",
  },
  riskLevel: {
    allowedOperators: stringOperators,
    catalogSource: "riskLevels",
    dataType: "string",
    key: "riskLevel",
    label: "Nivel de riesgo",
    normalize: normalizeCatalogToken,
    required: false,
    valueSource: "context",
  },
};

export const canonicalizeWorkflowConditionField = (
  field: string,
): WorkflowConditionField | null => {
  if (field in WORKFLOW_RULE_FIELDS) {
    return field as WorkflowConditionField;
  }

  const alias =
    WORKFLOW_CONDITION_FIELD_ALIASES[
      field as keyof typeof WORKFLOW_CONDITION_FIELD_ALIASES
    ];
  return alias ?? null;
};

export const getWorkflowRuleField = (
  field: string,
): WorkflowFieldDefinition | null => {
  const canonicalField = canonicalizeWorkflowConditionField(field);
  return canonicalField ? WORKFLOW_RULE_FIELDS[canonicalField] : null;
};

export const getWorkflowRuleContextValue = (
  context: WorkflowSimulationContext,
  field: WorkflowConditionField,
): unknown => {
  return context[field];
};

export const normalizeWorkflowRuleValue = (
  field: WorkflowConditionField,
  value: unknown,
): unknown => WORKFLOW_RULE_FIELDS[field].normalize(value);

export const normalizeWorkflowSimulationContext = (
  context: WorkflowSimulationContext,
): WorkflowSimulationContext => {
  const normalized: WorkflowSimulationContext = {
    processType: String(context.processType ?? "").trim(),
  };

  for (const field of WORKFLOW_CONDITION_FIELD_VALUES) {
    if (!(field in context)) continue;
    const definition = WORKFLOW_RULE_FIELDS[field];
    const value = definition.normalize(context[field]);
    normalized[field] = value as never;
  }

  if (context.currentNodeKey !== undefined) {
    normalized.currentNodeKey = normalizeIdentifier(context.currentNodeKey);
  }
  if (context.requesterUserId !== undefined) {
    normalized.requesterUserId = normalizeIdentifier(context.requesterUserId);
  }

  return normalized;
};

export const workflowConditionFieldLabels = Object.fromEntries(
  WORKFLOW_CONDITION_FIELD_VALUES.map((field) => [
    field,
    WORKFLOW_RULE_FIELDS[field].label,
  ]),
) as Record<WorkflowConditionField, string>;
