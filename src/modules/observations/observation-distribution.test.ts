import assert from "node:assert/strict";
import test from "node:test";

import {
  buildObservationAssignmentGroups,
  buildObservationSendDedupeKey,
  buildObservationSendOperationId,
  canSendObservation,
  formatRiskLevelMaxPeriods,
  type ObservationDistributionRecord,
} from "./observations.service.js";

const user = (id: string, email: string) => ({
  email,
  id,
  name: id,
});

const record = (
  id: string,
  number: number,
  areaAssignments: ObservationDistributionRecord["areaAssignments"],
): ObservationDistributionRecord => ({
  areaAssignments,
  auditReport: { id: "report-1", reportNumber: "INF-001", title: "Informe" },
  description: `Descripción ${number}`,
  id,
  observationNumber: number,
  riskLevel: { maxRemediationDays: 90, name: "Alto" },
  title: `Observación ${number}`,
});

const assignment = (
  areaId: string,
  processOwner: ReturnType<typeof user>,
  areaResponsible = processOwner,
) => ({
  actionPlans: [],
  area: { id: areaId, name: areaId },
  areaResponsible,
  processOwner,
});

const oneRecipientRecords = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    record(`observation-${index + 1}`, index + 1, [
      assignment("Finanzas", user("owner", "OWNER@EXAMPLE.COM")),
    ]),
  );

test("Case A: five observations for one recipient produce one email group", () => {
  const [group] = buildObservationAssignmentGroups(
    oneRecipientRecords(5),
    "Alto: 90 días",
  );
  assert.equal(group?.email, "OWNER@EXAMPLE.COM");
  assert.equal(group?.observationIds.length, 5);
  assert.equal(group?.reports[0]?.observations.length, 5);
});

test("Case B: two recipients only receive their relevant observations", () => {
  const owner = user("owner", "owner@example.com");
  const second = user("second", "second@example.com");
  const groups = buildObservationAssignmentGroups(
    Array.from({ length: 5 }, (_, index) =>
      record(`observation-${index + 1}`, index + 1, [
        assignment("Finanzas", owner),
        ...(index >= 3 ? [assignment("Operaciones", second)] : []),
      ]),
    ),
    "Alto: 90 días",
  );
  assert.deepEqual(
    groups.map((group) => [group.email, group.observationIds.length]),
    [
      ["owner@example.com", 5],
      ["second@example.com", 2],
    ],
  );
});

test("Case C: role duplication for one person produces one group", () => {
  const owner = user("owner", "owner@example.com");
  const [group] = buildObservationAssignmentGroups(
    [record("observation-1", 1, [assignment("Finanzas", owner, owner)])],
    "Alto: 90 días",
  );
  assert.equal(group?.observationIds.length, 1);
  assert.equal(group?.reports[0]?.observations.length, 1);
});

test("Case D: the same person across areas produces one group", () => {
  const owner = user("owner", "owner@example.com");
  const [group] = buildObservationAssignmentGroups(
    [
      record("observation-1", 1, [
        assignment("Finanzas", owner),
        assignment("Operaciones", owner),
      ]),
    ],
    "Alto: 90 días",
  );
  assert.equal(group?.observationIds.length, 1);
  assert.deepEqual(group?.reports[0]?.areaNames, ["Finanzas", "Operaciones"]);
});

test("Case E: the send operation and delivery key are deterministic", () => {
  const first = buildObservationSendOperationId(["b", "a", "a"]);
  const retry = buildObservationSendOperationId(["a", "b"]);
  assert.equal(first, retry);
  assert.equal(
    buildObservationSendDedupeKey(first, "owner", "EMAIL"),
    buildObservationSendDedupeKey(retry, "owner", "EMAIL"),
  );
});

test("Case F: an already sent observation cannot be sent again", () => {
  assert.equal(canSendObservation(null), true);
  assert.equal(canSendObservation(new Date("2026-09-09T00:00:00.000Z")), false);
});

test("risk periods use active values in severity order", () => {
  assert.equal(
    formatRiskLevelMaxPeriods([
      { maxRemediationDays: 120, name: "Medio", severityOrder: 2 },
      { maxRemediationDays: 90, name: "Alto", severityOrder: 1 },
      { maxRemediationDays: null, name: "Sin plazo", severityOrder: 3 },
    ]),
    "Alto: 90 días · Medio: 120 días",
  );
});
