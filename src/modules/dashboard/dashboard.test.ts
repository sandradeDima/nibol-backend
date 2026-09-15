import assert from "node:assert/strict";
import test from "node:test";

import { buildObservationUrl } from "../../utils/observation-links.js";

test("dashboard deep links preserve the observation context", () => {
  assert.equal(
    buildObservationUrl("observation-1", {
      advanceId: "advance-1",
      planId: "plan-1",
      tab: "plans",
    }),
    "/observaciones/observation-1?tab=plans&planId=plan-1&advanceId=advance-1",
  );
});
