INSERT INTO `permissions` (`id`, `name`, `description`, `created_at`, `updated_at`, `deleted_at`)
SELECT UUID(), CONCAT(resource.`name`, '.view_module'), 'Permission to view a module.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
FROM `permissions` AS resource
WHERE resource.`name` REGEXP '^[a-z0-9_.]+\\.view$'
  AND resource.`deleted_at` IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM `permissions` AS existing
    WHERE existing.`name` = CONCAT(SUBSTRING_INDEX(resource.`name`, '.view', 1), '.view_module')
  );
