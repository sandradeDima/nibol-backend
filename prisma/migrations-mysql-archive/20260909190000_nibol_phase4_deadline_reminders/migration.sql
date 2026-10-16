ALTER TABLE `notification_deliveries`
  ADD COLUMN `payload_json` JSON NULL;

ALTER TABLE `scheduled_job_executions`
  ADD COLUMN `run_type` VARCHAR(16) NULL,
  ADD COLUMN `cadence_key` VARCHAR(32) NULL,
  ADD COLUMN `period_key` VARCHAR(16) NULL,
  ADD COLUMN `dedupe_key` VARCHAR(255) NULL,
  ADD COLUMN `scheduled_for` DATETIME(3) NULL;

CREATE UNIQUE INDEX `scheduled_job_executions_dedupe_key_key`
  ON `scheduled_job_executions`(`dedupe_key`);

CREATE INDEX `scheduled_job_executions_job_name_cadence_key_period_key_idx`
  ON `scheduled_job_executions`(`job_name`, `cadence_key`, `period_key`);
