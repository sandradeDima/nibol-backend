-- Alter notifications to persist reusable type metadata for in-app and future channel integrations.
ALTER TABLE `notifications`
  ADD COLUMN `type` ENUM('info', 'success', 'warning', 'error') NOT NULL DEFAULT 'info' AFTER `message`;

CREATE INDEX `notifications_user_id_created_at_idx`
  ON `notifications`(`user_id`, `created_at`);
