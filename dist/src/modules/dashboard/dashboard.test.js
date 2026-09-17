import assert from "node:assert/strict";
import test from "node:test";
import { getRoleDashboardStatus } from "./dashboard.service.js";
import { buildObservationUrl } from "../../utils/observation-links.js";
test("dashboard deep links preserve the observation context", () => {
    assert.equal(buildObservationUrl("observation-1", {
        advanceId: "advance-1",
        planId: "plan-1",
        tab: "plans",
    }), "/observaciones/observation-1?tab=plans&planId=plan-1&advanceId=advance-1");
});
test("role dashboard status reflects mixed observation states", () => {
    assert.deepEqual(getRoleDashboardStatus(2, 0), {
        key: "PENDING",
        name: "Pendiente",
    });
    assert.deepEqual(getRoleDashboardStatus(0, 3), {
        key: "CONCLUDED",
        name: "Concluida",
    });
    assert.deepEqual(getRoleDashboardStatus(1, 1), {
        key: "MIXED",
        name: "Mixto",
    });
});
//# sourceMappingURL=dashboard.test.js.map