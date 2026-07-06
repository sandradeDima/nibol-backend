-- CreateTable
CREATE TABLE `remediation_plans` (
    `id` CHAR(36) NOT NULL,
    `observation_id` CHAR(36) NOT NULL,
    `area_id` CHAR(36) NOT NULL,
    `owner_user_id` CHAR(36) NULL,
    `strategy_text` LONGTEXT NOT NULL,
    `mitigation_text` LONGTEXT NULL,
    `additional_comments` LONGTEXT NULL,
    `status` ENUM('DRAFT', 'SENT_TO_AUDIT', 'APPROVED', 'RETURNED', 'CLOSED') NOT NULL DEFAULT 'DRAFT',
    `sent_to_audit_at` DATETIME(3) NULL,
    `approved_at` DATETIME(3) NULL,
    `approved_by_user_id` CHAR(36) NULL,
    `returned_at` DATETIME(3) NULL,
    `returned_by_user_id` CHAR(36) NULL,
    `return_reason` LONGTEXT NULL,
    `created_by_user_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `remediation_plans_observation_id_area_id_key`(`observation_id`, `area_id`),
    INDEX `remediation_plans_area_id_idx`(`area_id`),
    INDEX `remediation_plans_created_by_user_id_idx`(`created_by_user_id`),
    INDEX `remediation_plans_deleted_at_idx`(`deleted_at`),
    INDEX `remediation_plans_observation_id_idx`(`observation_id`),
    INDEX `remediation_plans_owner_user_id_idx`(`owner_user_id`),
    INDEX `remediation_plans_status_idx`(`status`),
    INDEX `remediation_plans_approved_by_user_id_idx`(`approved_by_user_id`),
    INDEX `remediation_plans_returned_by_user_id_idx`(`returned_by_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commitments` (
    `id` CHAR(36) NOT NULL,
    `remediation_plan_id` CHAR(36) NOT NULL,
    `observation_id` CHAR(36) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `responsible_user_id` CHAR(36) NULL,
    `due_date` DATETIME(3) NOT NULL,
    `completed_at` DATETIME(3) NULL,
    `progress_percent` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('PENDING', 'IN_PROGRESS', 'SENT_TO_AUDIT', 'APPROVED', 'RETURNED', 'COMPLETED', 'OVERDUE') NOT NULL DEFAULT 'PENDING',
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `commitments_completed_at_idx`(`completed_at`),
    INDEX `commitments_deleted_at_idx`(`deleted_at`),
    INDEX `commitments_due_date_idx`(`due_date`),
    INDEX `commitments_observation_id_idx`(`observation_id`),
    INDEX `commitments_progress_percent_idx`(`progress_percent`),
    INDEX `commitments_remediation_plan_id_idx`(`remediation_plan_id`),
    INDEX `commitments_responsible_user_id_idx`(`responsible_user_id`),
    INDEX `commitments_sort_order_idx`(`sort_order`),
    INDEX `commitments_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `remediation_plans` ADD CONSTRAINT `remediation_plans_observation_id_fkey` FOREIGN KEY (`observation_id`) REFERENCES `observations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `remediation_plans` ADD CONSTRAINT `remediation_plans_area_id_fkey` FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `remediation_plans` ADD CONSTRAINT `remediation_plans_owner_user_id_fkey` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `remediation_plans` ADD CONSTRAINT `remediation_plans_approved_by_user_id_fkey` FOREIGN KEY (`approved_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `remediation_plans` ADD CONSTRAINT `remediation_plans_returned_by_user_id_fkey` FOREIGN KEY (`returned_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `remediation_plans` ADD CONSTRAINT `remediation_plans_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commitments` ADD CONSTRAINT `commitments_remediation_plan_id_fkey` FOREIGN KEY (`remediation_plan_id`) REFERENCES `remediation_plans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commitments` ADD CONSTRAINT `commitments_observation_id_fkey` FOREIGN KEY (`observation_id`) REFERENCES `observations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commitments` ADD CONSTRAINT `commitments_responsible_user_id_fkey` FOREIGN KEY (`responsible_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

