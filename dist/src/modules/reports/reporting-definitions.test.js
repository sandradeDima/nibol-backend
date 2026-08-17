import assert from "node:assert/strict";
import test from "node:test";
import { getObservationStatusGroup, getRiskGroupLabel, isObservationDueSoon, isObservationOverdue, } from "./reporting-definitions.js";
const now = new Date("2026-08-12T12:00:00.000Z");
test("clasifica vencimientos sin contar estados finales como atrasados", () => {
    assert.equal(isObservationOverdue(new Date("2026-08-11T12:00:00.000Z"), {
        isFinal: false,
        key: "INICIADO",
    }, now), true);
    assert.equal(isObservationOverdue(new Date("2026-08-11T12:00:00.000Z"), {
        isFinal: true,
        key: "CONCLUIDO",
    }, now), false);
    assert.equal(isObservationDueSoon(new Date("2026-08-15T12:00:00.000Z"), {
        isFinal: false,
        key: "INICIADO",
    }, 7, now), true);
});
test("asigna grupos y etiquetas de negocio deterministas", () => {
    assert.equal(getObservationStatusGroup({ isFinal: false, key: "CON_AVANCE", name: "Con avance" }, false), "IN_REVIEW");
    assert.equal(getObservationStatusGroup({ isFinal: false, key: "INICIADO", name: "Iniciado" }, true), "OVERDUE");
    assert.equal(getRiskGroupLabel("ALTO", "Alto"), "Alto");
    assert.equal(getRiskGroupLabel("HIGH", "High"), "Alto");
});
//# sourceMappingURL=reporting-definitions.test.js.map