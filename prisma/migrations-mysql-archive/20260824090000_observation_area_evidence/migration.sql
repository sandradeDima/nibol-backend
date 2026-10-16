-- AlterTable
ALTER TABLE `evidence_files` ADD COLUMN `observation_area_id` CHAR(36) NULL;

-- Backfill area ownership for evidence already attached to action plans.
UPDATE `evidence_files` AS evidence
INNER JOIN `action_plans` AS action_plan
    ON action_plan.`id` = evidence.`action_plan_id`
SET evidence.`observation_area_id` = action_plan.`observation_area_id`
WHERE evidence.`action_plan_id` IS NOT NULL;

-- CreateIndex
CREATE INDEX `evidence_files_observation_area_id_idx` ON `evidence_files`(`observation_area_id`);

-- AddForeignKey
ALTER TABLE `evidence_files` ADD CONSTRAINT `evidence_files_observation_area_id_fkey` FOREIGN KEY (`observation_area_id`) REFERENCES `observation_areas`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
