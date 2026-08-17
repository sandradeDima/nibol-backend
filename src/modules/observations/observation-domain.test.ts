import assert from "node:assert/strict";
import test from "node:test";

import { observationAggregationService } from "./observation-aggregation.service.js";
import { observationDeadlineService } from "./observation-deadline.service.js";

test("deadlines use calendar days from the audit report date", () => {
  const reportDate = new Date("2026-08-14T00:00:00.000Z");
  assert.equal(
    observationDeadlineService.calculate(reportDate, "ALTO").toISOString(),
    "2026-11-12T00:00:00.000Z",
  );
  assert.equal(
    observationDeadlineService.calculate(reportDate, "MEDIO").toISOString(),
    "2026-12-12T00:00:00.000Z",
  );
  assert.equal(
    observationDeadlineService.calculate(reportDate, "BAJO").toISOString(),
    "2027-02-10T00:00:00.000Z",
  );
});

test("observation aggregation averages independent action plans", () => {
  const plans = [
    { progressPercent: 100, status: "CONCLUDED" as const },
    { progressPercent: 50, status: "WITH_PROGRESS" as const },
    { progressPercent: 25, status: "WITH_PROGRESS" as const },
    { progressPercent: 0, status: "NOT_STARTED" as const },
  ];
  assert.equal(observationAggregationService.calculateProgress(plans), 44);
  assert.equal(
    observationAggregationService.calculateStatus(plans),
    "CON_AVANCE",
  );
});

test("all concluded plans require closure approval before global conclusion", () => {
  const plans = [{ progressPercent: 100, status: "CONCLUDED" as const }];
  assert.equal(
    observationAggregationService.calculateStatus(plans),
    "CON_AVANCE",
  );
  assert.equal(
    observationAggregationService.calculateStatus(plans, true),
    "CONCLUIDO",
  );
});
