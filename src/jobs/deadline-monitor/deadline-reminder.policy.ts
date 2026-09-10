import { getBusinessDateKey } from "../../modules/reports/reporting-definitions.js";
import type {
  DeadlineReminderPolicy,
  DeadlineReminderRole,
} from "./deadline-reminder.constants.js";

export type DeadlineReminderBucket =
  | "OVERDUE"
  | "DUE_TODAY"
  | "UPCOMING";

export type ScheduledReminderPeriod = {
  cutoffDateKey: string;
  periodKey: string;
  scheduledFor: Date;
};

const dateFromKey = (value: string): Date => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day ?? 1, 12));
};

const dateKey = (value: Date): string => value.toISOString().slice(0, 10);

export const addDaysToDateKey = (value: string, days: number): string => {
  const date = dateFromKey(value);
  date.setUTCDate(date.getUTCDate() + days);
  return dateKey(date);
};

export const addCalendarMonthsToPeriodKey = (
  periodKey: string,
  months: number,
): string => {
  const date = dateFromKey(`${periodKey}-01`);
  date.setUTCMonth(date.getUTCMonth() + months, 1);
  return dateKey(date).slice(0, 7);
};

export const buildCutoffDateKey = (periodKey: string, cutoffDay: number): string =>
  `${periodKey}-${String(cutoffDay).padStart(2, "0")}`;

export const getCadenceKey = (cadenceMonths: number): string =>
  cadenceMonths === 1
    ? "monthly"
    : cadenceMonths === 2
      ? "bimonthly"
      : `every-${cadenceMonths}-months`;

export const getCadenceLabel = (cadenceMonths: number): string =>
  cadenceMonths === 1
    ? "mensual"
    : cadenceMonths === 2
      ? "bimestral"
      : `cada ${cadenceMonths} meses`;

export const getScheduleGroupKey = (policy: DeadlineReminderPolicy): string =>
  `${getCadenceKey(policy.cadenceMonths)}:${policy.cutoffDay}`;

export const getReminderBucket = (input: {
  cutoffDateKey: string;
  effectiveDueDateKey: string;
  upcomingWindowDays: number;
}): DeadlineReminderBucket | null => {
  if (input.effectiveDueDateKey < input.cutoffDateKey) return "OVERDUE";
  if (input.effectiveDueDateKey === input.cutoffDateKey) return "DUE_TODAY";
  return input.effectiveDueDateKey <=
    addDaysToDateKey(input.cutoffDateKey, input.upcomingWindowDays)
    ? "UPCOMING"
    : null;
};

export const getScheduledReminderPeriods = (input: {
  createdAt: Date;
  lastPeriodKey?: string | null;
  now: Date;
  policy: Omit<DeadlineReminderPolicy, "role">;
  timeZone: string;
}): ScheduledReminderPeriod[] => {
  const today = getBusinessDateKey(input.now, input.timeZone);
  const createdDate = getBusinessDateKey(input.createdAt, input.timeZone);
  let periodKey = input.lastPeriodKey
    ? addCalendarMonthsToPeriodKey(
        input.lastPeriodKey,
        input.policy.cadenceMonths,
      )
    : createdDate.slice(0, 7);

  if (
    !input.lastPeriodKey &&
    buildCutoffDateKey(periodKey, input.policy.cutoffDay) < createdDate
  ) {
    periodKey = addCalendarMonthsToPeriodKey(
      periodKey,
      input.policy.cadenceMonths,
    );
  }

  const periods: ScheduledReminderPeriod[] = [];
  const cutoffFor = (currentPeriodKey: string): string =>
    buildCutoffDateKey(currentPeriodKey, input.policy.cutoffDay);

  if (!input.lastPeriodKey) {
    if (cutoffFor(periodKey) > today) return periods;
    // ponytail: first startup uses the latest due period; historical periods are not replayed.
    while (
      cutoffFor(
        addCalendarMonthsToPeriodKey(periodKey, input.policy.cadenceMonths),
      ) <= today
    ) {
      periodKey = addCalendarMonthsToPeriodKey(
        periodKey,
        input.policy.cadenceMonths,
      );
    }
    periods.push({
      cutoffDateKey: cutoffFor(periodKey),
      periodKey,
      scheduledFor: dateFromKey(cutoffFor(periodKey)),
    });
    return periods;
  }

  while (cutoffFor(periodKey) <= today) {
    periods.push({
      cutoffDateKey: cutoffFor(periodKey),
      periodKey,
      scheduledFor: dateFromKey(cutoffFor(periodKey)),
    });
    periodKey = addCalendarMonthsToPeriodKey(
      periodKey,
      input.policy.cadenceMonths,
    );
  }

  return periods;
};

export const getNextScheduledReminderPeriod = (input: {
  createdAt: Date;
  lastPeriodKey?: string | null;
  now: Date;
  policy: Omit<DeadlineReminderPolicy, "role">;
  timeZone: string;
}): ScheduledReminderPeriod | null => {
  const today = getBusinessDateKey(input.now, input.timeZone);
  const createdDate = getBusinessDateKey(input.createdAt, input.timeZone);
  let periodKey = input.lastPeriodKey
    ? addCalendarMonthsToPeriodKey(
        input.lastPeriodKey,
        input.policy.cadenceMonths,
      )
    : createdDate.slice(0, 7);

  if (
    !input.lastPeriodKey &&
    buildCutoffDateKey(periodKey, input.policy.cutoffDay) < createdDate
  ) {
    periodKey = addCalendarMonthsToPeriodKey(
      periodKey,
      input.policy.cadenceMonths,
    );
  }

  while (buildCutoffDateKey(periodKey, input.policy.cutoffDay) < today) {
    periodKey = addCalendarMonthsToPeriodKey(
      periodKey,
      input.policy.cadenceMonths,
    );
  }

  const nextCutoffDateKey = buildCutoffDateKey(
    periodKey,
    input.policy.cutoffDay,
  );
  return {
    cutoffDateKey: nextCutoffDateKey,
    periodKey,
    scheduledFor: dateFromKey(nextCutoffDateKey),
  };
};

export const getRoleLabel = (role: DeadlineReminderRole): string =>
  role === "AREA_RESPONSIBLE"
    ? "Responsable de área"
    : role === "PROCESS_OWNER"
      ? "Dueño del proceso"
      : "Ejecutor";
