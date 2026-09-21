import assert from "node:assert/strict";
import test from "node:test";
import { parseBooleanEnvValue } from "./env.js";
test("parses string boolean environment values without coercing false to true", () => {
    assert.equal(parseBooleanEnvValue("false"), false);
    assert.equal(parseBooleanEnvValue("true"), true);
});
//# sourceMappingURL=env.test.js.map