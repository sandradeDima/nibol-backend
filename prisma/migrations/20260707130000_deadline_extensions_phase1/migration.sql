CREATE TABLE `deadline_extension_requests` (
  `id` CHAR(36) NOT NULL,
  `observation_id` CHAR(36) NOT NULL,
  `commitment_id` CHAR(36) NULL,
  `requested_by_user_id` CHAR(36) NOT NULL,
  `area_id` CHAR(36) NOT NULL,
  `current_due_date` DATETIME(3) NOT NULL,
  `requested_due_date` DATETIME(3) NOT NULL,
  `reason` LONGTEXT NOT NULL,
  `status` ENUM(
    'DRAFT',
    'SENT_TO_MANAGER',
    'MANAGER_APPROVED',
    'MANAGER_REJECTED',
    'SENT_TO_AUDIT',
    'AUDIT_APPROVED',
    'AUDIT_REJECTED',
    'CANCELLED'
  ) NOT NULL DEFAULT 'DRAFT',
  `manager_reviewer_id` CHAR(36) NULL,
  `manager_reviewed_at` DATETIME(3) NULL,
  `manager_comment` LONGTEXT NULL,
  `audit_reviewer_id` CHAR(36) NULL,
  `audit_reviewed_at` DATETIME(3) NULL,
  `audit_comment` LONGTEXT NULL,
  `final_approved_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  INDEX `deadline_extension_requests_area_id_idx`(`area_id`),
  INDEX `deadline_extension_requests_audit_reviewer_id_idx`(`audit_reviewer_id`),
  INDEX `deadline_extension_requests_commitment_id_idx`(`commitment_id`),
  INDEX `deadline_extension_requests_deleted_at_idx`(`deleted_at`),
  INDEX `deadline_extension_requests_manager_reviewer_id_idx`(`manager_reviewer_id`),
  INDEX `der_observation_commitment_status_deleted_idx`(`observation_id`, `commitment_id`, `status`, `deleted_at`),
  INDEX `deadline_extension_requests_requested_by_user_id_idx`(`requested_by_user_id`),
  INDEX `deadline_extension_requests_status_updated_at_idx`(`status`, `updated_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `deadline_extension_attachments` (
  `id` CHAR(36) NOT NULL,
  `extension_request_id` CHAR(36) NOT NULL,
  `evidence_file_id` CHAR(36) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `dea_extension_request_id_evidence_file_id_key`(`extension_request_id`, `evidence_file_id`),
  INDEX `deadline_extension_attachments_evidence_file_id_idx`(`evidence_file_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `deadline_extension_requests`
  ADD CONSTRAINT `deadline_extension_requests_observation_id_fkey`
  FOREIGN KEY (`observation_id`) REFERENCES `observations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `deadline_extension_requests`
  ADD CONSTRAINT `deadline_extension_requests_commitment_id_fkey`
  FOREIGN KEY (`commitment_id`) REFERENCES `commitments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `deadline_extension_requests`
  ADD CONSTRAINT `deadline_extension_requests_requested_by_user_id_fkey`
  FOREIGN KEY (`requested_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `deadline_extension_requests`
  ADD CONSTRAINT `deadline_extension_requests_area_id_fkey`
  FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `deadline_extension_requests`
  ADD CONSTRAINT `deadline_extension_requests_manager_reviewer_id_fkey`
  FOREIGN KEY (`manager_reviewer_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `deadline_extension_requests`
  ADD CONSTRAINT `deadline_extension_requests_audit_reviewer_id_fkey`
  FOREIGN KEY (`audit_reviewer_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `deadline_extension_attachments`
  ADD CONSTRAINT `deadline_extension_attachments_extension_request_id_fkey`
  FOREIGN KEY (`extension_request_id`) REFERENCES `deadline_extension_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `deadline_extension_attachments`
  ADD CONSTRAINT `deadline_extension_attachments_evidence_file_id_fkey`
  FOREIGN KEY (`evidence_file_id`) REFERENCES `evidence_files`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO `permissions` (`id`, `name`, `description`, `created_at`, `updated_at`, `deleted_at`)
SELECT UUID(), permission_name, permission_description, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
FROM (
  SELECT 'extension_requests.view' AS permission_name, 'View deadline extension requests' AS permission_description
  UNION ALL
  SELECT 'extension_requests.create', 'Create deadline extension requests'
  UNION ALL
  SELECT 'extension_requests.edit', 'Edit deadline extension requests'
  UNION ALL
  SELECT 'extension_requests.delete', 'Delete deadline extension requests'
) AS permissions_to_insert
WHERE NOT EXISTS (
  SELECT 1
  FROM `permissions`
  WHERE `permissions`.`name` = permissions_to_insert.permission_name
);

INSERT INTO `role_permissions` (`id`, `role_id`, `permission_id`, `created_at`, `updated_at`)
SELECT UUID(), roles.id, permissions.id, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `roles`
INNER JOIN `permissions`
  ON `permissions`.`name` IN (
    'extension_requests.view',
    'extension_requests.create',
    'extension_requests.edit',
    'extension_requests.delete'
  )
LEFT JOIN `role_permissions`
  ON `role_permissions`.`role_id` = `roles`.`id`
  AND `role_permissions`.`permission_id` = `permissions`.`id`
WHERE `roles`.`name` = 'Admin'
  AND `roles`.`deleted_at` IS NULL
  AND `permissions`.`deleted_at` IS NULL
  AND `role_permissions`.`id` IS NULL;
