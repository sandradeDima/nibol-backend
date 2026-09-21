import assert from "node:assert/strict";
import test from "node:test";
import { buildApprovedCompletionEvaluationWhere } from "./remediation.service.js";
test("plan completion checks the reported progress field", () => {
    assert.deepEqual(buildApprovedCompletionEvaluationWhere("plan-1"), {
        actionPlanId: "plan-1",
        deletedAt: null,
        reportedProgressPercent: 100,
        reviewStatus: "APPROVED",
    });
});
//# sourceMappingURL=remediation.domain.test.js.map