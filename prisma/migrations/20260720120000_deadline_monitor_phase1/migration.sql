ALTER TABLE `notifications`
  ADD COLUMN `priority` ENUM('LOW', 'NORMAL', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'NORMAL' AFTER `type`,
  ADD COLUMN `event_type` VARCHAR(100) NULL AFTER `priority`,
  ADD COLUMN `entity_type` VARCHAR(100) NULL AFTER `event_type`,
  ADD COLUMN `entity_id` CHAR(36) NULL AFTER `entity_type`,
  ADD COLUMN `target_url` VARCHAR(500) NULL AFTER `entity_id`,
  ADD COLUMN `dedupe_key` VARCHAR(255) NULL AFTER `target_url`,
  ADD COLUMN `read_at` DATETIME(3) NULL AFTER `is_read`;

CREATE UNIQUE INDEX `notifications_dedupe_key_key` ON `notifications`(`dedupe_key`);
CREATE INDEX `notifications_event_type_entity_type_entity_id_idx`
  ON `notifications`(`event_type`, `entity_type`, `entity_id`);
CREATE INDEX `notifications_priority_created_at_idx`
  ON `notifications`(`priority`, `created_at`);

CREATE TABLE `notification_deliveries` (
  `id` CHAR(36) NOT NULL,
  `notification_id` CHAR(36) NULL,
  `dedupe_key` VARCHAR(255) NULL,
  `channel` ENUM('IN_APP', 'EMAIL') NOT NULL,
  `recipient_user_id` CHAR(36) NULL,
  `recipient_email` VARCHAR(191) NULL,
  `status` ENUM('PENDING', 'SENT', 'FAILED', 'SKIPPED') NOT NULL DEFAULT 'PENDING',
  `attempts` INT NOT NULL DEFAULT 0,
  `last_attempt_at` DATETIME(3) NULL,
  `sent_at` DATETIME(3) NULL,
  `error_message` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `notification_deliveries_notification_id_channel_idx`(`notification_id`, `channel`),
  INDEX `notification_deliveries_recipient_user_id_channel_status_idx`(`recipient_user_id`, `channel`, `status`),
  INDEX `notification_deliveries_status_last_attempt_at_idx`(`status`, `last_attempt_at`),
  UNIQUE INDEX `notification_deliveries_dedupe_key_key`(`dedupe_key`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `scheduled_job_executions` (
  `id` CHAR(36) NOT NULL,
  `job_name` VARCHAR(100) NOT NULL,
  `started_at` DATETIME(3) NOT NULL,
  `finished_at` DATETIME(3) NULL,
  `status` ENUM('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED') NOT NULL,
  `processed_count` INT NOT NULL DEFAULT 0,
  `notifications_created` INT NOT NULL DEFAULT 0,
  `emails_sent` INT NOT NULL DEFAULT 0,
  `failures_count` INT NOT NULL DEFAULT 0,
  `details_json` JSON NULL,
  `error_message` TEXT NULL,
  `triggered_by` ENUM('CRON', 'USER', 'SYSTEM') NOT NULL,
  `triggered_by_user_id` CHAR(36) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `scheduled_job_executions_job_name_started_at_idx`(`job_name`, `started_at`),
  INDEX `scheduled_job_executions_job_name_status_idx`(`job_name`, `status`),
  INDEX `scheduled_job_executions_triggered_by_user_id_idx`(`triggered_by_user_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `notification_deliveries`
  ADD CONSTRAINT `notification_deliveries_notification_id_fkey`
    FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `notification_deliveries_recipient_user_id_fkey`
    FOREIGN KEY (`recipient_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `scheduled_job_executions`
  ADD CONSTRAINT `scheduled_job_executions_triggered_by_user_id_fkey`
    FOREIGN KEY (`triggered_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO `permissions` (`id`, `name`, `description`, `created_at`, `updated_at`, `deleted_at`)
SELECT UUID(), permission_name, permission_description, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
FROM (
  SELECT 'automatic_jobs.view' AS permission_name, 'View automatic job execution summaries' AS permission_description
  UNION ALL
  SELECT 'automatic_jobs.create', 'Create automatic job definitions'
  UNION ALL
  SELECT 'automatic_jobs.edit', 'Edit automatic job definitions'
  UNION ALL
  SELECT 'automatic_jobs.delete', 'Delete automatic job definitions'
  UNION ALL
  SELECT 'automatic_jobs.execute', 'Execute the deadline monitor manually'
  UNION ALL
  SELECT 'notification_rules.view', 'View automatic notification rules'
  UNION ALL
  SELECT 'notification_rules.create', 'Create automatic notification rules'
  UNION ALL
  SELECT 'notification_rules.edit', 'Edit automatic notification rules'
  UNION ALL
  SELECT 'notification_rules.delete', 'Delete automatic notification rules'
) AS permissions_to_insert
WHERE NOT EXISTS (
  SELECT 1 FROM `permissions`
  WHERE `permissions`.`name` = permissions_to_insert.permission_name
);

INSERT INTO `role_permissions` (`id`, `role_id`, `permission_id`, `created_at`, `updated_at`)
SELECT UUID(), roles.id, permissions.id, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `roles`
INNER JOIN `permissions`
  ON `permissions`.`name` IN (
    'automatic_jobs.view',
    'automatic_jobs.execute',
    'notification_rules.view',
    'notification_rules.edit'
  )
LEFT JOIN `role_permissions`
  ON `role_permissions`.`role_id` = `roles`.`id`
  AND `role_permissions`.`permission_id` = `permissions`.`id`
WHERE LOWER(`roles`.`name`) IN ('admin', 'sistema', 'sistemas', 'system', 'systems')
  AND `roles`.`deleted_at` IS NULL
  AND `permissions`.`deleted_at` IS NULL
  AND `role_permissions`.`id` IS NULL;
