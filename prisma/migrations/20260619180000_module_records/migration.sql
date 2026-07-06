CREATE TABLE `module_records` (
  `id` CHAR(36) NOT NULL,
  `module_key` VARCHAR(100) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `metadata` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `module_records_module_key_deleted_at_idx` ON `module_records`(`module_key`, `deleted_at`);
CREATE INDEX `module_records_module_key_is_active_idx` ON `module_records`(`module_key`, `is_active`);
CREATE INDEX `module_records_module_key_created_at_idx` ON `module_records`(`module_key`, `created_at`);
