-- CreateTable
CREATE TABLE `risk_levels` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `color_token` VARCHAR(64) NOT NULL,
    `default_deadline_days` INTEGER NULL,
    `sort_order` INTEGER NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `risk_levels_name_key`(`name`),
    INDEX `risk_levels_active_deleted_at_idx`(`active`, `deleted_at`),
    INDEX `risk_levels_deleted_at_idx`(`deleted_at`),
    INDEX `risk_levels_sort_order_idx`(`sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `observation_statuses` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `key` VARCHAR(100) NOT NULL,
    `sort_order` INTEGER NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `observation_statuses_name_key`(`name`),
    UNIQUE INDEX `observation_statuses_key_key`(`key`),
    INDEX `observation_statuses_active_deleted_at_idx`(`active`, `deleted_at`),
    INDEX `observation_statuses_deleted_at_idx`(`deleted_at`),
    INDEX `observation_statuses_sort_order_idx`(`sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `areas` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `manager_user_id` CHAR(36) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `areas_name_key`(`name`),
    INDEX `areas_active_deleted_at_idx`(`active`, `deleted_at`),
    INDEX `areas_deleted_at_idx`(`deleted_at`),
    INDEX `areas_manager_user_id_idx`(`manager_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `observations` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `audit_recommendation` TEXT NOT NULL,
    `risk_level_id` CHAR(36) NOT NULL,
    `status_id` CHAR(36) NOT NULL,
    `area_id` CHAR(36) NOT NULL,
    `responsible_user_id` CHAR(36) NULL,
    `auditor_user_id` CHAR(36) NOT NULL,
    `due_date` DATETIME(3) NOT NULL,
    `detected_at` DATETIME(3) NOT NULL,
    `source` VARCHAR(191) NULL,
    `process_name` VARCHAR(191) NULL,
    `category` VARCHAR(191) NULL,
    `progress_percent` INTEGER NOT NULL DEFAULT 0,
    `current_stage` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `observations_code_key`(`code`),
    INDEX `observations_area_id_idx`(`area_id`),
    INDEX `observations_auditor_user_id_idx`(`auditor_user_id`),
    INDEX `observations_deleted_at_idx`(`deleted_at`),
    INDEX `observations_detected_at_idx`(`detected_at`),
    INDEX `observations_due_date_idx`(`due_date`),
    INDEX `observations_responsible_user_id_idx`(`responsible_user_id`),
    INDEX `observations_risk_level_id_idx`(`risk_level_id`),
    INDEX `observations_status_id_idx`(`status_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `observation_area_assignments` (
    `id` CHAR(36) NOT NULL,
    `observation_id` CHAR(36) NOT NULL,
    `area_id` CHAR(36) NOT NULL,
    `responsible_user_id` CHAR(36) NULL,
    `role_in_finding` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `observation_area_assignments_observation_id_area_id_key`(`observation_id`, `area_id`),
    INDEX `observation_area_assignments_area_id_idx`(`area_id`),
    INDEX `observation_area_assignments_observation_id_idx`(`observation_id`),
    INDEX `observation_area_assignments_responsible_user_id_idx`(`responsible_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `areas` ADD CONSTRAINT `areas_manager_user_id_fkey` FOREIGN KEY (`manager_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `observations` ADD CONSTRAINT `observations_risk_level_id_fkey` FOREIGN KEY (`risk_level_id`) REFERENCES `risk_levels`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `observations` ADD CONSTRAINT `observations_status_id_fkey` FOREIGN KEY (`status_id`) REFERENCES `observation_statuses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `observations` ADD CONSTRAINT `observations_area_id_fkey` FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `observations` ADD CONSTRAINT `observations_responsible_user_id_fkey` FOREIGN KEY (`responsible_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `observations` ADD CONSTRAINT `observations_auditor_user_id_fkey` FOREIGN KEY (`auditor_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `observation_area_assignments` ADD CONSTRAINT `observation_area_assignments_observation_id_fkey` FOREIGN KEY (`observation_id`) REFERENCES `observations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `observation_area_assignments` ADD CONSTRAINT `observation_area_assignments_area_id_fkey` FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `observation_area_assignments` ADD CONSTRAINT `observation_area_assignments_responsible_user_id_fkey` FOREIGN KEY (`responsible_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
