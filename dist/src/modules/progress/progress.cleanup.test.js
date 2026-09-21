import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { buildProgressEvaluationSubmissionData, canSubmitProgressEvaluationForPlan, removeStoredEvidenceFiles, } from "./progress.service.js";
import { evidenceUploadsDir, uploadsRootDir } from "../../utils/uploads.js";
test("removes stored files when a draft evidence record is deleted", async () => {
    const directory = await mkdtemp(path.join(evidenceUploadsDir, "qa-cleanup-"));
    const absolutePath = path.join(directory, "draft.png");
    const relativePath = path.relative(uploadsRootDir, absolutePath);
    await mkdir(directory, { recursive: true });
    await writeFile(absolutePath, "qa");
    try {
        await removeStoredEvidenceFiles([relativePath]);
        await assert.rejects(access(absolutePath));
    }
    finally {
        await rm(directory, { force: true, recursive: true });
    }
});
test("does not allow progress submissions after a plan is concluded", () => {
    assert.equal(canSubmitProgressEvaluationForPlan("STARTED"), true);
    assert.equal(canSubmitProgressEvaluationForPlan("CONCLUDED"), false);
});
test("clears stale review metadata when a returned evaluation is resubmitted", () => {
    const submittedAt = new Date("2026-09-18T00:00:00.000Z");
    assert.deepEqual(buildProgressEvaluationSubmissionData(submittedAt), {
        reviewComment: null,
        reviewedAt: null,
        reviewedByUserId: null,
        reviewStatus: "SENT_TO_AUDIT",
        submittedAt,
    });
});
//# sourceMappingURL=progress.cleanup.test.js.map