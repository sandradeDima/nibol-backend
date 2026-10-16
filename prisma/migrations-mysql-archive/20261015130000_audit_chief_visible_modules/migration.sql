DELETE role_permission
FROM `role_permissions` AS role_permission
JOIN `roles` AS r
  ON r.`id` = role_permission.`role_id`
JOIN `permissions` AS p
  ON p.`id` = role_permission.`permission_id`
WHERE r.`code` = 'AUDIT_CHIEF'
  AND p.`name` LIKE '%.view_module'
  AND p.`name` NOT IN (
    'observations.view_module',
    'action_plans.view_module',
    'reports.view_module',
    'notifications.view_module'
  );

INSERT IGNORE INTO `role_permissions` (`id`, `role_id`, `permission_id`, `created_at`, `updated_at`)
SELECT UUID(), r.`id`, p.`id`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `roles` AS r
JOIN `permissions` AS p
  ON p.`name` IN (
    'observations.view',
    'observations.view_module',
    'action_plans.view',
    'action_plans.view_module',
    'reports.view',
    'reports.view_module',
    'notifications.view',
    'notifications.view_module'
  )
 AND p.`deleted_at` IS NULL
WHERE r.`code` = 'AUDIT_CHIEF'
  AND r.`deleted_at` IS NULL;
