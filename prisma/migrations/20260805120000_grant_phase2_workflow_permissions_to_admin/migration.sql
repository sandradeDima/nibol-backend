-- Register the Phase 2 workflow permissions for existing installations and
-- grant every one of them to the protected Admin role. The application seeds
-- keep doing the same work for fresh databases, while this migration upgrades
-- databases where the Admin role already exists without recreating accounts.

INSERT INTO `permissions` (`id`, `name`, `description`, `created_at`, `updated_at`, `deleted_at`)
VALUES
  (UUID(), 'workflows.view', 'workflows.view permission.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  (UUID(), 'workflows.create', 'workflows.create permission.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  (UUID(), 'workflows.edit', 'workflows.edit permission.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  (UUID(), 'workflows.delete', 'workflows.delete permission.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  (UUID(), 'workflows.archive', 'workflows.archive permission.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  (UUID(), 'workflows.publish', 'workflows.publish permission.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  (UUID(), 'workflows.validate', 'workflows.validate permission.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  (UUID(), 'workflows.simulate', 'workflows.simulate permission.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  (UUID(), 'workflows.view_versions', 'workflows.view_versions permission.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  (UUID(), 'workflows.view_instances', 'workflows.view_instances permission.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  (UUID(), 'workflow_tasks.view', 'workflow_tasks.view permission.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  (UUID(), 'workflow_tasks.approve', 'workflow_tasks.approve permission.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  (UUID(), 'workflow_tasks.reject', 'workflow_tasks.reject permission.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  (UUID(), 'workflow_tasks.observe', 'workflow_tasks.observe permission.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  (UUID(), 'workflow_tasks.request_correction', 'workflow_tasks.request_correction permission.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  (UUID(), 'workflow_tasks.reassign', 'workflow_tasks.reassign permission.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  (UUID(), 'workflow_instances.cancel', 'workflow_instances.cancel permission.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  (UUID(), 'workflow_instances.retry', 'workflow_instances.retry permission.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  (UUID(), 'workflow_instances.view_audit', 'workflow_instances.view_audit permission.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL)
ON DUPLICATE KEY UPDATE
  `description` = VALUES(`description`),
  `updated_at` = CURRENT_TIMESTAMP(3),
  `deleted_at` = NULL;

INSERT INTO `role_permissions` (`id`, `role_id`, `permission_id`, `created_at`, `updated_at`)
SELECT UUID(), admin_role.`id`, workflow_permission.`id`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `roles` AS admin_role
CROSS JOIN `permissions` AS workflow_permission
WHERE admin_role.`name` = 'Admin'
  AND admin_role.`deleted_at` IS NULL
  AND workflow_permission.`deleted_at` IS NULL
  AND workflow_permission.`name` IN (
    'workflows.view',
    'workflows.create',
    'workflows.edit',
    'workflows.delete',
    'workflows.archive',
    'workflows.publish',
    'workflows.validate',
    'workflows.simulate',
    'workflows.view_versions',
    'workflows.view_instances',
    'workflow_tasks.view',
    'workflow_tasks.approve',
    'workflow_tasks.reject',
    'workflow_tasks.observe',
    'workflow_tasks.request_correction',
    'workflow_tasks.reassign',
    'workflow_instances.cancel',
    'workflow_instances.retry',
    'workflow_instances.view_audit'
  )
ON DUPLICATE KEY UPDATE
  `updated_at` = CURRENT_TIMESTAMP(3);
