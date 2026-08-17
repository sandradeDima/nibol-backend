import { z } from "zod";

export const WORKFLOW_SLA_UNITS = [
  "MINUTES",
  "HOURS",
  "BUSINESS_DAYS",
  "CALENDAR_DAYS",
] as const;

export type WorkflowSlaUnit = (typeof WORKFLOW_SLA_UNITS)[number];

export const workflowSlaDurationSchema = z
  .object({
    duration: z.number().int().positive().max(100_000),
    unit: z.enum(WORKFLOW_SLA_UNITS),
  })
  .strict();

export type WorkflowSlaDuration = z.infer<typeof workflowSlaDurationSchema>;

export type WorkflowBusinessCalendar = {
  /** The runtime currently evaluates weekdays in UTC for deterministic storage. */
  timezone?: "UTC";
  isBusinessDay?: (date: Date) => boolean;
};

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const cloneDate = (date: Date): Date => {
  const result = new Date(date.getTime());
  if (Number.isNaN(result.getTime())) {
    throw new Error("startedAt debe ser una fecha válida.");
  }
  return result;
};

const weekendOnlyCalendar = (date: Date): boolean => {
  const day = date.getUTCDay();
  return day !== 0 && day !== 6;
};

const addBusinessDays = (
  startedAt: Date,
  duration: number,
  calendar: WorkflowBusinessCalendar,
): Date => {
  const result = cloneDate(startedAt);
  const isBusinessDay = calendar.isBusinessDay ?? weekendOnlyCalendar;
  let remaining = duration;

  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + 1);
    if (isBusinessDay(result)) remaining -= 1;
  }

  return result;
};

/**
 * Calculates a pinned workflow deadline.
 *
 * Business-day SLAs currently exclude weekends only. All persisted workflow
 * instants are calculated in UTC so the scheduler and API agree regardless of
 * the host machine's local timezone.
 */
export const calculateWorkflowDeadline = (input: {
  startedAt: Date;
  duration: number;
  unit: WorkflowSlaUnit;
  calendar?: WorkflowBusinessCalendar;
}): Date => {
  if (!Number.isInteger(input.duration) || input.duration <= 0) {
    throw new Error("La duración SLA debe ser un entero positivo.");
  }

  const startedAt = cloneDate(input.startedAt);
  const calendar = input.calendar ?? { timezone: "UTC" as const };

  switch (input.unit) {
    case "MINUTES":
      return new Date(startedAt.getTime() + input.duration * MINUTE_MS);
    case "HOURS":
      return new Date(startedAt.getTime() + input.duration * HOUR_MS);
    case "CALENDAR_DAYS":
      return new Date(startedAt.getTime() + input.duration * DAY_MS);
    case "BUSINESS_DAYS":
      return addBusinessDays(startedAt, input.duration, calendar);
  }
};

export const calculateWorkflowThresholdAt = (input: {
  startedAt: Date;
  threshold: number | null | undefined;
  unit: WorkflowSlaUnit;
  calendar?: WorkflowBusinessCalendar;
}): Date | null => {
  if (input.threshold === null || input.threshold === undefined) return null;
  return calculateWorkflowDeadline({
    ...(input.calendar ? { calendar: input.calendar } : {}),
    duration: input.threshold,
    startedAt: input.startedAt,
    unit: input.unit,
  });
};

export const getWorkflowSlaState = (input: {
  dueAt: Date | null;
  now?: Date;
  dueSoonAt?: Date | null;
}): "NO_SLA" | "ON_TIME" | "DUE_SOON" | "OVERDUE" => {
  if (!input.dueAt) return "NO_SLA";
  const now = input.now ?? new Date();
  if (input.dueAt.getTime() < now.getTime()) return "OVERDUE";
  if (input.dueSoonAt && input.dueAt.getTime() <= input.dueSoonAt.getTime()) {
    return "DUE_SOON";
  }
  return "ON_TIME";
};
