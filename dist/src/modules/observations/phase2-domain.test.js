import assert from "node:assert/strict";
import test from "node:test";
import { nextAvailableObservationNumber } from "./observations.service.js";
import { observationDeadlineService } from "./observation-deadline.service.js";
import { officialProgressByStatus } from "../progress/progress.constants.js";
test("reutiliza el menor número libre dentro de un informe", () => {
    assert.equal(nextAvailableObservationNumber([1, 2, 4, 5]), 3);
    assert.equal(nextAvailableObservationNumber([1, 2, 3]), 4);
    assert.equal(nextAvailableObservationNumber([]), 1);
});
test("el correlativo se calcula por conjunto de números del informe", () => {
    assert.equal(nextAvailableObservationNumber([1, 2]), 3);
    assert.equal(nextAvailableObservationNumber([2, 3]), 1);
});
test("el estado oficial es la única fuente del porcentaje oficial", () => {
    assert.deepEqual(officialProgressByStatus, {
        CONCLUDED: 100,
        NOT_STARTED: 0,
        STARTED: 20,
        WITH_PROGRESS: 60,
    });
});
test("el límite de plazo se calcula desde la fecha del informe", () => {
    assert.equal(observationDeadlineService
        .calculate(new Date("2026-01-01T00:00:00.000Z"), 90)
        .toISOString()
        .slice(0, 10), "2026-04-01");
});
test("la fecha de compromiso acepta cualquier fecha hasta el máximo configurable", () => {
    const reportDate = new Date("2026-01-01T00:00:00.000Z");
    assert.equal(observationDeadlineService.isCommitmentDateAllowed(reportDate, 90, new Date("2026-04-01T00:00:00.000Z")), true);
    assert.equal(observationDeadlineService.isCommitmentDateAllowed(reportDate, 90, new Date("2026-04-02T00:00:00.000Z")), false);
    assert.equal(observationDeadlineService.isCommitmentDateAllowed(reportDate, 180, new Date("2026-06-30T00:00:00.000Z")), true);
    assert.equal(observationDeadlineService.isCommitmentDateAllowed(reportDate, 90, new Date("2025-12-31T00:00:00.000Z")), false);
});
//# sourceMappingURL=phase2-domain.test.js.map