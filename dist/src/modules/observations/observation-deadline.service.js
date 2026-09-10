const DAY_IN_MS = 24 * 60 * 60 * 1000;
const toUtcDate = (value) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
export const observationDeadlineService = {
    calculate(reportDate, days) {
        if (days === null ||
            days === undefined ||
            !Number.isInteger(days) ||
            days <= 0)
            throw new Error("El nivel de riesgo no tiene un plazo válido.");
        return new Date(toUtcDate(reportDate).getTime() + days * DAY_IN_MS);
    },
    isCommitmentDateAllowed(reportDate, days, commitmentDate) {
        const normalizedReportDate = toUtcDate(reportDate).getTime();
        const normalizedCommitmentDate = toUtcDate(commitmentDate).getTime();
        return (normalizedCommitmentDate >= normalizedReportDate &&
            normalizedCommitmentDate <= this.calculate(reportDate, days).getTime());
    },
};
//# sourceMappingURL=observation-deadline.service.js.map