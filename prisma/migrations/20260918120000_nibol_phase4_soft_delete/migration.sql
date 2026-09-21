ALTER TABLE `observations`
  ADD COLUMN `deleted_by_id` CHAR(36) NULL,
  ADD INDEX `observations_deleted_by_id_idx`(`deleted_by_id`),
  ADD CONSTRAINT `observations_deleted_by_id_fkey`
    FOREIGN KEY (`deleted_by_id`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `remediation_plans`
  ADD COLUMN `deleted_by_id` CHAR(36) NULL,
  ADD INDEX `remediation_plans_deleted_by_id_idx`(`deleted_by_id`),
  ADD CONSTRAINT `remediation_plans_deleted_by_id_fkey`
    FOREIGN KEY (`deleted_by_id`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `action_plans`
  ADD COLUMN `deleted_by_id` CHAR(36) NULL,
  ADD INDEX `action_plans_deleted_by_id_idx`(`deleted_by_id`),
  ADD CONSTRAINT `action_plans_deleted_by_id_fkey`
    FOREIGN KEY (`deleted_by_id`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
