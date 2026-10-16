UPDATE `permissions` AS module_permission
JOIN `permissions` AS resource
  ON module_permission.`name` = CONCAT(LEFT(resource.`name`, CHAR_LENGTH(resource.`name`) - CHAR_LENGTH('.view')), '.view_module')
SET module_permission.`deleted_at` = NULL,
    module_permission.`updated_at` = CURRENT_TIMESTAMP(3)
WHERE RIGHT(resource.`name`, CHAR_LENGTH('.view')) = '.view'
  AND resource.`deleted_at` IS NULL
  AND module_permission.`deleted_at` IS NOT NULL;

UPDATE `permissions` AS module_permission
JOIN `permissions` AS malformed
  ON module_permission.`name` = CONCAT(LEFT(malformed.`name`, CHAR_LENGTH(malformed.`name`) - CHAR_LENGTH('.view.view_module')), '.view_module')
SET module_permission.`deleted_at` = NULL,
    module_permission.`updated_at` = CURRENT_TIMESTAMP(3)
WHERE RIGHT(malformed.`name`, CHAR_LENGTH('.view.view_module')) = '.view.view_module'
  AND malformed.`deleted_at` IS NULL
  AND module_permission.`deleted_at` IS NOT NULL;

INSERT INTO `permissions` (`id`, `name`, `description`, `created_at`, `updated_at`, `deleted_at`)
SELECT UUID(), candidate.`name`, 'Permission to view a module.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
FROM (
  SELECT CONCAT(LEFT(resource.`name`, CHAR_LENGTH(resource.`name`) - CHAR_LENGTH('.view')), '.view_module') AS `name`
  FROM `permissions` AS resource
  WHERE RIGHT(resource.`name`, CHAR_LENGTH('.view')) = '.view'
    AND resource.`deleted_at` IS NULL
  UNION
  SELECT CONCAT(LEFT(malformed.`name`, CHAR_LENGTH(malformed.`name`) - CHAR_LENGTH('.view.view_module')), '.view_module') AS `name`
  FROM `permissions` AS malformed
  WHERE RIGHT(malformed.`name`, CHAR_LENGTH('.view.view_module')) = '.view.view_module'
    AND malformed.`deleted_at` IS NULL
) AS candidate
WHERE NOT EXISTS (
  SELECT 1 FROM `permissions` AS existing
  WHERE existing.`name` = candidate.`name`
);

INSERT IGNORE INTO `role_permissions` (`id`, `role_id`, `permission_id`, `created_at`, `updated_at`)
SELECT UUID(), role_permission.`role_id`, module_permission.`id`, role_permission.`created_at`, role_permission.`updated_at`
FROM `role_permissions` AS role_permission
JOIN `permissions` AS malformed
  ON malformed.`id` = role_permission.`permission_id`
JOIN `permissions` AS module_permission
  ON module_permission.`name` = CONCAT(LEFT(malformed.`name`, CHAR_LENGTH(malformed.`name`) - CHAR_LENGTH('.view.view_module')), '.view_module')
 AND module_permission.`deleted_at` IS NULL
WHERE RIGHT(malformed.`name`, CHAR_LENGTH('.view.view_module')) = '.view.view_module'
  AND malformed.`deleted_at` IS NULL;

DELETE role_permission
FROM `role_permissions` AS role_permission
JOIN `permissions` AS malformed
  ON malformed.`id` = role_permission.`permission_id`
WHERE RIGHT(malformed.`name`, CHAR_LENGTH('.view.view_module')) = '.view.view_module'
  AND malformed.`deleted_at` IS NULL;

UPDATE `permissions`
SET `deleted_at` = CURRENT_TIMESTAMP(3),
    `updated_at` = CURRENT_TIMESTAMP(3)
WHERE RIGHT(`name`, CHAR_LENGTH('.view.view_module')) = '.view.view_module'
  AND `deleted_at` IS NULL;
