import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeActivityData } from "./entity-activity-service.js";
import { getExtensionActivityType, getProgressActivityType, getRemediationActivityType } from "./entity-activity-mapping.js";
test("sanitiza secretos, identificadores y rutas privadas del historial", () => {
    const result = sanitizeActivityData({
        password: "do-not-store",
        accessToken: "do-not-store",
        id: "internal-id",
        responsibleUserId: "internal-user-id",
        title: "Cambio visible",
        nested: { privatePath: "/srv/private/file.pdf", status: "APROBADO" },
    });
    assert.deepEqual(result, {
        nested: { status: "APROBADO" },
        title: "Cambio visible",
    });
});
test("mapea acciones de módulos a tipos de actividad de negocio", () => {
    assert.equal(getRemediationActivityType("remediation_plan", "remediation-plan.send-to-audit"), "PLAN_SENT_TO_AUDIT");
    assert.equal(getRemediationActivityType("commitment", "commitment.mark-complete"), "COMMITMENT_COMPLETED");
    assert.equal(getProgressActivityType("evidence_file", "evidence-file.upload"), "EVIDENCE_UPLOADED");
    assert.equal(getExtensionActivityType("extension-request.audit-approve"), "EXTENSION_AUDIT_APPROVED");
});
//# sourceMappingURL=entity-activity.test.js.map