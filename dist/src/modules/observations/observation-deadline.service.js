const DAY_IN_MS = 24 * 60 * 60 * 1000;
export const RISK_LEVEL_DEADLINE_DAYS = {
    ALTO: 90,
    BAJO: 180,
    MEDIO: 120,
};
const toUtcDate = (value) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
export const observationDeadlineService = {
    calculate(reportDate, riskLevelKey) {
        const days = RISK_LEVEL_DEADLINE_DAYS[riskLevelKey];
        if (!days) {
            throw new Error(`Risk level ${riskLevelKey} has no remediation deadline policy.`);
        }
        return new Date(toUtcDate(reportDate).getTime() + days * DAY_IN_MS);
    },
    getDays(riskLevelKey) {
        const days = RISK_LEVEL_DEADLINE_DAYS[riskLevelKey];
        if (!days) {
            throw new Error(`Risk level ${riskLevelKey} has no remediation deadline policy.`);
        }
        return days;
    },
};
//# sourceMappingURL=observation-deadline.service.js.map