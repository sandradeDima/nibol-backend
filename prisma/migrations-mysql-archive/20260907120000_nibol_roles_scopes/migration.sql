ALTER TABLE `roles`
    ADD COLUMN `code` VARCHAR(64) NULL;

UPDATE `roles`
SET `code` = CASE
    WHEN `name` IN ('Admin', 'Administrador del sistema') THEN 'SYSTEM_ADMIN'
    WHEN `name` IN ('Auditoría', 'Auditor') THEN 'AUDITOR'
    WHEN `name` IN ('Non Admin', 'Ejecutor') THEN 'EXECUTOR'
    WHEN `name` = 'Dueño del proceso' THEN 'PROCESS_OWNER'
    WHEN `name` = 'Responsable de área' THEN 'AREA_RESPONSIBLE'
    ELSE CONCAT('LEGACY_', `id`)
END
WHERE `code` IS NULL;

UPDATE `roles` SET `name` = 'Administrador del sistema' WHERE `code` = 'SYSTEM_ADMIN';
UPDATE `roles` SET `name` = 'Auditor' WHERE `code` = 'AUDITOR';
UPDATE `roles` SET `name` = 'Ejecutor' WHERE `code` = 'EXECUTOR';

INSERT INTO `roles` (`id`, `code`, `name`, `description`, `created_at`, `updated_at`, `deleted_at`)
SELECT UUID(), 'PROCESS_OWNER', 'Dueño del proceso', 'Seguimiento de observaciones y planes del proceso.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
WHERE NOT EXISTS (SELECT 1 FROM `roles` WHERE `code` = 'PROCESS_OWNER');

INSERT INTO `roles` (`id`, `code`, `name`, `description`, `created_at`, `updated_at`, `deleted_at`)
SELECT UUID(), 'AREA_RESPONSIBLE', 'Responsable de área', 'Gestión y seguimiento de los planes del área.', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
WHERE NOT EXISTS (SELECT 1 FROM `roles` WHERE `code` = 'AREA_RESPONSIBLE');

ALTER TABLE `roles`
    MODIFY `code` VARCHAR(64) NOT NULL,
    ADD UNIQUE INDEX `roles_code_key`(`code`);

DELETE duplicate_role
FROM `user_roles` duplicate_role
JOIN `user_roles` kept_role
  ON kept_role.`user_id` = duplicate_role.`user_id`
 AND kept_role.`id` < duplicate_role.`id`;

ALTER TABLE `user_roles`
    ADD UNIQUE INDEX `user_roles_user_id_key`(`user_id`);
