import assert from "node:assert/strict";
import test from "node:test";
import { canReviewEvidenceAsAuditor } from "./progress.service.js";
const access = (roleCode, permissions = ["evidence.review"]) => ({
    dataScope: roleCode === "AUDITOR" ? "AUDIT_SCOPE" : "ALL",
    isAdmin: roleCode === "SYSTEM_ADMIN",
    permissions,
    roleCode,
    roleName: roleCode,
    roles: roleCode ? [roleCode] : [],
    userId: "user-1",
});
test("fallback evidence review is restricted to the Auditor role", () => {
    assert.equal(canReviewEvidenceAsAuditor(access("AUDITOR")), true);
    assert.equal(canReviewEvidenceAsAuditor(access("SYSTEM_ADMIN")), false);
    assert.equal(canReviewEvidenceAsAuditor(access("PROCESS_OWNER")), false);
    assert.equal(canReviewEvidenceAsAuditor(access("AUDITOR", [])), false);
});
//# sourceMappingURL=evidence-review.test.js.map