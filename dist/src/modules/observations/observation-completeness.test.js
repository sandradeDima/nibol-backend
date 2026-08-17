import assert from "node:assert/strict";
import test from "node:test";
import { buildObservationActionItems, buildObservationActionSummary, } from "./observation-completeness.service.js";
const access = {
    isAdmin: true,
    permissions: [],
    roles: ["Admin"],
    userId: "00000000-0000-4000-8000-000000000001",
};
const context = () => ({
    actionPlans: [],
    areaAssignments: [
        {
            areaId: "00000000-0000-4000-8000-000000000010",
            areaName: "Finanzas",
            areaResponsibleUserId: "00000000-0000-4000-8000-000000000011",
            processOwnerUserId: "00000000-0000-4000-8000-000000000012",
        },
    ],
    currentDueDate: new Date("2026-10-01T00:00:00.000Z"),
    findingEvidenceCount: 0,
    id: "00000000-0000-4000-8000-000000000020",
    pendingReviewCount: 0,
    progressPercent: 0,
    riskCount: 1,
    status: { isFinal: false, key: "NO_INICIADO" },
});
test("completeness identifies missing action plan and finding evidence", () => {
    const items = buildObservationActionItems(context(), access, new Date("2026-08-14T00:00:00.000Z"));
    assert.deepEqual(items.map((item) => item.code).sort(), [
        "ACTION_PLAN_MISSING",
        "FINDING_EVIDENCE_MISSING",
    ]);
});
test("completeness exposes friendly per-area ownership actions", () => {
    const input = context();
    input.areaAssignments[0].areaResponsibleUserId = null;
    input.areaAssignments[0].processOwnerUserId = null;
    const items = buildObservationActionItems(input, access, new Date("2026-08-14T00:00:00.000Z"));
    assert.ok(items.some((item) => item.label.includes("Finanzas")));
    assert.ok(items.some((item) => item.code === "PROCESS_OWNER_MISSING"));
    assert.ok(items.some((item) => item.code === "AREA_RESPONSIBLE_MISSING"));
});
test("summary marks overdue work as critical", () => {
    const input = context();
    input.currentDueDate = new Date("2026-08-01T00:00:00.000Z");
    const items = buildObservationActionItems(input, access, new Date("2026-08-14T00:00:00.000Z"));
    const summary = buildObservationActionSummary(items);
    assert.equal(summary.status, "OVERDUE");
    assert.equal(summary.severity, "CRITICAL");
});
//# sourceMappingURL=observation-completeness.test.js.map