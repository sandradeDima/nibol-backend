const DAY_IN_MS = 24 * 60 * 60 * 1000;

export const RISK_LEVEL_DEADLINE_DAYS = {
  ALTO: 90,
  BAJO: 180,
  MEDIO: 120,
} as const;

export type RemediationRiskLevelKey = keyof typeof RISK_LEVEL_DEADLINE_DAYS;

const toUtcDate = (value: Date): Date =>
  new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );

export const observationDeadlineService = {
  calculate(reportDate: Date, riskLevelKey: string): Date {
    const days =
      RISK_LEVEL_DEADLINE_DAYS[riskLevelKey as RemediationRiskLevelKey];
    if (!days) {
      throw new Error(
        `Risk level ${riskLevelKey} has no remediation deadline policy.`,
      );
    }

    return new Date(toUtcDate(reportDate).getTime() + days * DAY_IN_MS);
  },

  getDays(riskLevelKey: string): number {
    const days =
      RISK_LEVEL_DEADLINE_DAYS[riskLevelKey as RemediationRiskLevelKey];
    if (!days) {
      throw new Error(
        `Risk level ${riskLevelKey} has no remediation deadline policy.`,
      );
    }
    return days;
  },
};
