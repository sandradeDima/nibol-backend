import assert from "node:assert/strict";
import test from "node:test";
import { buildPlanDistributions } from "./reports.service.js";
const row = (suffix) => ({
    actionPlanId: `plan-${suffix}`,
    area: { id: `area-${suffix}`, name: `Área ${suffix}` },
    areaResponsible: {
        email: `responsable-${suffix}@test.local`,
        id: `responsible-${suffix}`,
        name: `Responsable ${suffix}`,
    },
    auditReportId: `report-${suffix}`,
    completedAt: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    deadlineStatus: "VIGENTE",
    description: `Plan ${suffix}`,
    effectiveDueDate: "2026-09-30T00:00:00.000Z",
    executor: {
        email: `ejecutor-${suffix}@test.local`,
        id: `executor-${suffix}`,
        name: `Ejecutor ${suffix}`,
    },
    href: `/planes-accion/plan-${suffix}`,
    observation: {
        code: `INF-${suffix} / OBS-001`,
        id: `observation-${suffix}`,
        status: { isFinal: false, key: "INICIADO", name: "Iniciado" },
        title: `Observación ${suffix}`,
    },
    observationDueDate: "2026-09-30T00:00:00.000Z",
    observationId: `observation-${suffix}`,
    officialProgress: {
        code: "I",
        key: "STARTED",
        label: "Iniciado",
        percent: 20,
    },
    originalDueDate: "2026-09-30T00:00:00.000Z",
    processOwner: {
        email: `dueno-${suffix}@test.local`,
        id: `owner-${suffix}`,
        name: `Dueño ${suffix}`,
    },
    progressPercent: 20,
    reportedProgressPercent: null,
    reprogrammed: false,
    riskLevel: {
        colorToken: "high",
        id: `risk-${suffix}`,
        key: "HIGH",
        name: "Alto",
    },
    title: `Plan ${suffix}`,
    updatedAt: "2026-09-01T00:00:00.000Z",
});
const labels = (rows) => {
    const charts = buildPlanDistributions(rows);
    return {
        area: charts.area.map((item) => item.label),
        areaResponsible: charts.areaResponsible.map((item) => item.label),
        executor: charts.executor.map((item) => item.label),
        processOwner: charts.processOwner.map((item) => item.label),
    };
};
test("plan distributions stay inside each role's scoped dataset", () => {
    const rows = [row("A"), row("B")];
    assert.deepEqual(labels(rows), {
        area: ["Área A", "Área B"],
        areaResponsible: ["Responsable A", "Responsable B"],
        executor: ["Ejecutor A", "Ejecutor B"],
        processOwner: ["Dueño A", "Dueño B"],
    });
    for (const scopedRows of [
        rows.filter((item) => item.processOwner?.id === "owner-A"),
        rows.filter((item) => item.areaResponsible?.id === "responsible-A"),
        rows.filter((item) => item.executor?.id === "executor-A"),
    ]) {
        assert.deepEqual(labels(scopedRows), {
            area: ["Área A"],
            areaResponsible: ["Responsable A"],
            executor: ["Ejecutor A"],
            processOwner: ["Dueño A"],
        });
    }
});
//# sourceMappingURL=reports.dashboard.test.js.map