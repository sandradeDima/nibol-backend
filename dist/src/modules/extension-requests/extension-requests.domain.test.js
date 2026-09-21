import assert from "node:assert/strict";
import test from "node:test";
import { isActiveWorkflowInstanceStatus } from "./extension-requests.service.js";
test("extension cancellation identifies workflow instances that still need cleanup", () => {
    assert.equal(isActiveWorkflowInstanceStatus("PENDING"), true);
    assert.equal(isActiveWorkflowInstanceStatus("WAITING"), true);
    assert.equal(isActiveWorkflowInstanceStatus("COMPLETED"), false);
    assert.equal(isActiveWorkflowInstanceStatus("CANCELLED"), false);
});
//# sourceMappingURL=extension-requests.domain.test.js.map