ALTER TABLE `evidence_files`
  ADD COLUMN `review_status` ENUM('DRAFT', 'PENDING', 'APPROVED', 'RETURNED', 'REJECTED') NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN `submitted_at` DATETIME(3) NULL,
  ADD COLUMN `reviewed_at` DATETIME(3) NULL,
  ADD COLUMN `reviewed_by_user_id` CHAR(36) NULL,
  ADD COLUMN `review_comment` LONGTEXT NULL,
  ADD COLUMN `workflow_instance_id` CHAR(36) NULL;

CREATE INDEX `evidence_files_review_status_idx`
  ON `evidence_files`(`review_status`);

CREATE INDEX `evidence_files_workflow_instance_id_idx`
  ON `evidence_files`(`workflow_instance_id`);
