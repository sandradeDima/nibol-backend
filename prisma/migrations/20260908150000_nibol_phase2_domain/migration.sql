ALTER TABLE `risk_levels`
  CHANGE COLUMN `default_deadline_days` `max_remediation_days` INTEGER NULL;

ALTER TABLE `observations`
  ADD COLUMN `deleted_observation_number` INTEGER NULL,
  ADD COLUMN `sent_at` DATETIME(3) NULL;

ALTER TABLE `observations`
  MODIFY COLUMN `auditor_user_id` CHAR(36) NULL;

CREATE TABLE `deadline_extension_classifications` (
  `id` CHAR(36) NOT NULL,
  `code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` VARCHAR(500) NOT NULL,
  `max_additional_days` INTEGER NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `deadline_extension_classifications_code_key`(`code`),
  UNIQUE INDEX `deadline_extension_classifications_name_key`(`name`),
  INDEX `deadline_extension_classifications_active_idx`(`active`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `deadline_extension_requests`
  ADD COLUMN `classification_id` CHAR(36) NULL,
  ADD COLUMN `max_additional_days` INTEGER NULL,
  ADD COLUMN `max_allowed_date` DATE NULL;

UPDATE `deadline_extension_requests`
SET `status` = CASE `status`
  WHEN 'SENT_TO_AUDIT' THEN 'SENT_TO_MANAGER'
  WHEN 'AUDIT_APPROVED' THEN 'MANAGER_APPROVED'
  WHEN 'AUDIT_REJECTED' THEN 'MANAGER_REJECTED'
  ELSE `status`
END;

ALTER TABLE `deadline_extension_requests`
  DROP FOREIGN KEY `deadline_extension_requests_audit_reviewer_id_fkey`,
  DROP INDEX `deadline_extension_requests_audit_reviewer_id_idx`,
  DROP COLUMN `audit_reviewer_id`,
  DROP COLUMN `audit_reviewed_at`,
  DROP COLUMN `audit_comment`,
  MODIFY COLUMN `status` ENUM('DRAFT', 'SENT_TO_MANAGER', 'MANAGER_APPROVED', 'MANAGER_REJECTED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT';

UPDATE `progress_evaluations`
SET `type` = 'ADVANCE'
WHERE `type` = 'CORRECTION';

UPDATE `progress_evaluations`
SET `review_status` = 'RETURNED'
WHERE `review_status` = 'REJECTED';

UPDATE `progress_review_history`
SET `action` = 'RETURNED'
WHERE `action` = 'REJECTED';

UPDATE `progress_review_history`
SET `from_status` = 'RETURNED'
WHERE `from_status` = 'REJECTED';

UPDATE `progress_review_history`
SET `to_status` = 'RETURNED'
WHERE `to_status` = 'REJECTED';

ALTER TABLE `progress_evaluations`
  MODIFY COLUMN `type` ENUM('ADVANCE', 'FINALIZATION') NOT NULL DEFAULT 'ADVANCE',
  MODIFY COLUMN `review_status` ENUM('DRAFT', 'SENT_TO_AUDIT', 'APPROVED', 'RETURNED') NOT NULL DEFAULT 'DRAFT';

ALTER TABLE `progress_review_history`
  MODIFY COLUMN `action` ENUM('SENT', 'APPROVED', 'RETURNED') NOT NULL,
  MODIFY COLUMN `from_status` ENUM('DRAFT', 'SENT_TO_AUDIT', 'APPROVED', 'RETURNED') NULL,
  MODIFY COLUMN `to_status` ENUM('DRAFT', 'SENT_TO_AUDIT', 'APPROVED', 'RETURNED') NOT NULL;

ALTER TABLE `progress_evaluations`
  CHANGE COLUMN `progress_percent` `reported_progress_percent` INTEGER NULL,
  ADD COLUMN `evaluated_status` ENUM('NOT_STARTED', 'STARTED', 'WITH_PROGRESS', 'CONCLUDED') NULL,
  DROP COLUMN `action_plan_status`;

ALTER TABLE `deadline_extension_requests`
  ADD UNIQUE INDEX `deadline_extension_one_per_action_plan_key`(`action_plan_id`),
  ADD INDEX `deadline_extension_requests_classification_id_idx`(`classification_id`),
  ADD CONSTRAINT `deadline_extension_requests_classification_id_fkey`
    FOREIGN KEY (`classification_id`) REFERENCES `deadline_extension_classifications`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
