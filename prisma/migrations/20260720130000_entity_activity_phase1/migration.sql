CREATE TABLE `entity_activities` (
  `id` CHAR(36) NOT NULL,
  `observation_id` CHAR(36) NULL,
  `entity_type` VARCHAR(64) NOT NULL,
  `entity_id` VARCHAR(191) NOT NULL,
  `activity_type` VARCHAR(100) NOT NULL,
  `action` VARCHAR(100) NOT NULL,
  `actor_user_id` CHAR(36) NULL,
  `actor_type` VARCHAR(32) NOT NULL DEFAULT 'USER',
  `title` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `previous_data_json` JSON NULL,
  `new_data_json` JSON NULL,
  `metadata_json` JSON NULL,
  `visibility` VARCHAR(32) NOT NULL DEFAULT 'ALL_AUTHORIZED',
  `target_url` VARCHAR(500) NULL,
  `dedupe_key` VARCHAR(255) NULL,
  `related_audit_log_id` CHAR(36) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `entity_activities_dedupe_key_key`(`dedupe_key`),
  INDEX `entity_activities_observation_id_idx`(`observation_id`),
  INDEX `entity_activities_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
  INDEX `entity_activities_actor_user_id_idx`(`actor_user_id`),
  INDEX `entity_activities_activity_type_idx`(`activity_type`),
  INDEX `entity_activities_created_at_idx`(`created_at`),
  INDEX `entity_activities_visibility_idx`(`visibility`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `entity_activities`
  ADD CONSTRAINT `entity_activities_observation_id_fkey`
    FOREIGN KEY (`observation_id`) REFERENCES `observations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `entity_activities_actor_user_id_fkey`
    FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO `permissions` (`id`, `name`, `description`, `created_at`, `updated_at`, `deleted_at`)
SELECT UUID(), permission_name, permission_description, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
FROM (
  SELECT 'activity.view' AS permission_name, 'View business activity and traceability' AS permission_description
  UNION ALL
  SELECT 'activity.export', 'Export filtered business activity'
  UNION ALL
  SELECT 'activity.technical', 'View safe technical activity details'
) AS permissions_to_insert
WHERE NOT EXISTS (
  SELECT 1 FROM `permissions`
  WHERE `permissions`.`name` = permissions_to_insert.permission_name
);

INSERT INTO `role_permissions` (`id`, `role_id`, `permission_id`, `created_at`, `updated_at`)
SELECT UUID(), roles.id, permissions.id, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `roles`
INNER JOIN `permissions`
  ON `permissions`.`name` IN ('activity.view', 'activity.export', 'activity.technical')
LEFT JOIN `role_permissions`
  ON `role_permissions`.`role_id` = `roles`.`id`
  AND `role_permissions`.`permission_id` = `permissions`.`id`
WHERE LOWER(`roles`.`name`) IN ('admin', 'sistema', 'sistemas', 'system', 'systems')
  AND `roles`.`deleted_at` IS NULL
  AND `permissions`.`deleted_at` IS NULL
  AND `role_permissions`.`id` IS NULL;
