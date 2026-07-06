-- CreateTable
CREATE TABLE `progress_updates` (
    `id` CHAR(36) NOT NULL,
    `observation_id` CHAR(36) NOT NULL,
    `remediation_plan_id` CHAR(36) NULL,
    `commitment_id` CHAR(36) NULL,
    `submitted_by_user_id` CHAR(36) NOT NULL,
    `type` ENUM('ADVANCE', 'FINALIZATION', 'CORRECTION') NOT NULL,
    `progress_percent` INTEGER NULL,
    `comment` LONGTEXT NOT NULL,
    `status` ENUM('DRAFT', 'SENT_TO_AUDIT', 'APPROVED', 'RETURNED', 'REJECTED') NOT NULL DEFAULT 'DRAFT',
    `reviewed_by_user_id` CHAR(36) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `review_comment` LONGTEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `progress_updates_commitment_id_idx`(`commitment_id`),
    INDEX `progress_updates_deleted_at_idx`(`deleted_at`),
    INDEX `progress_updates_observation_id_created_at_idx`(`observation_id`, `created_at`),
    INDEX `progress_updates_observation_id_status_deleted_at_idx`(`observation_id`, `status`, `deleted_at`),
    INDEX `progress_updates_remediation_plan_id_idx`(`remediation_plan_id`),
    INDEX `progress_updates_reviewed_by_user_id_idx`(`reviewed_by_user_id`),
    INDEX `progress_updates_status_idx`(`status`),
    INDEX `progress_updates_submitted_by_user_id_idx`(`submitted_by_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `evidence_files` (
    `id` CHAR(36) NOT NULL,
    `observation_id` CHAR(36) NOT NULL,
    `remediation_plan_id` CHAR(36) NULL,
    `commitment_id` CHAR(36) NULL,
    `progress_update_id` CHAR(36) NULL,
    `uploaded_by_user_id` CHAR(36) NOT NULL,
    `original_name` VARCHAR(255) NOT NULL,
    `stored_name` VARCHAR(255) NOT NULL,
    `relative_path` VARCHAR(500) NOT NULL,
    `mime_type` VARCHAR(191) NOT NULL,
    `size_bytes` BIGINT NOT NULL,
    `checksum` VARCHAR(128) NULL,
    `description` LONGTEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,

    INDEX `evidence_files_commitment_id_idx`(`commitment_id`),
    INDEX `evidence_files_deleted_at_idx`(`deleted_at`),
    INDEX `evidence_files_observation_id_created_at_idx`(`observation_id`, `created_at`),
    INDEX `evidence_files_progress_update_id_idx`(`progress_update_id`),
    INDEX `evidence_files_remediation_plan_id_idx`(`remediation_plan_id`),
    INDEX `evidence_files_uploaded_by_user_id_idx`(`uploaded_by_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `observation_comments` (
    `id` CHAR(36) NOT NULL,
    `observation_id` CHAR(36) NOT NULL,
    `remediation_plan_id` CHAR(36) NULL,
    `commitment_id` CHAR(36) NULL,
    `progress_update_id` CHAR(36) NULL,
    `author_user_id` CHAR(36) NOT NULL,
    `visibility` ENUM('INTERNAL_AUDIT', 'AREA_VISIBLE', 'SYSTEM') NOT NULL DEFAULT 'AREA_VISIBLE',
    `body` LONGTEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `observation_comments_author_user_id_idx`(`author_user_id`),
    INDEX `observation_comments_commitment_id_idx`(`commitment_id`),
    INDEX `observation_comments_deleted_at_idx`(`deleted_at`),
    INDEX `observation_comments_observation_id_created_at_idx`(`observation_id`, `created_at`),
    INDEX `observation_comments_progress_update_id_idx`(`progress_update_id`),
    INDEX `observation_comments_remediation_plan_id_idx`(`remediation_plan_id`),
    INDEX `observation_comments_visibility_idx`(`visibility`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `progress_review_history` (
    `id` CHAR(36) NOT NULL,
    `progress_update_id` CHAR(36) NOT NULL,
    `action` ENUM('SENT', 'APPROVED', 'RETURNED', 'REJECTED') NOT NULL,
    `from_status` ENUM('DRAFT', 'SENT_TO_AUDIT', 'APPROVED', 'RETURNED', 'REJECTED') NULL,
    `to_status` ENUM('DRAFT', 'SENT_TO_AUDIT', 'APPROVED', 'RETURNED', 'REJECTED') NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `comment` LONGTEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `progress_review_history_created_at_idx`(`created_at`),
    INDEX `progress_review_history_progress_update_id_created_at_idx`(`progress_update_id`, `created_at`),
    INDEX `progress_review_history_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `progress_updates` ADD CONSTRAINT `progress_updates_observation_id_fkey` FOREIGN KEY (`observation_id`) REFERENCES `observations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `progress_updates` ADD CONSTRAINT `progress_updates_remediation_plan_id_fkey` FOREIGN KEY (`remediation_plan_id`) REFERENCES `remediation_plans`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `progress_updates` ADD CONSTRAINT `progress_updates_commitment_id_fkey` FOREIGN KEY (`commitment_id`) REFERENCES `commitments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `progress_updates` ADD CONSTRAINT `progress_updates_submitted_by_user_id_fkey` FOREIGN KEY (`submitted_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `progress_updates` ADD CONSTRAINT `progress_updates_reviewed_by_user_id_fkey` FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evidence_files` ADD CONSTRAINT `evidence_files_observation_id_fkey` FOREIGN KEY (`observation_id`) REFERENCES `observations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evidence_files` ADD CONSTRAINT `evidence_files_remediation_plan_id_fkey` FOREIGN KEY (`remediation_plan_id`) REFERENCES `remediation_plans`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evidence_files` ADD CONSTRAINT `evidence_files_commitment_id_fkey` FOREIGN KEY (`commitment_id`) REFERENCES `commitments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evidence_files` ADD CONSTRAINT `evidence_files_progress_update_id_fkey` FOREIGN KEY (`progress_update_id`) REFERENCES `progress_updates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evidence_files` ADD CONSTRAINT `evidence_files_uploaded_by_user_id_fkey` FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `observation_comments` ADD CONSTRAINT `observation_comments_observation_id_fkey` FOREIGN KEY (`observation_id`) REFERENCES `observations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `observation_comments` ADD CONSTRAINT `observation_comments_remediation_plan_id_fkey` FOREIGN KEY (`remediation_plan_id`) REFERENCES `remediation_plans`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `observation_comments` ADD CONSTRAINT `observation_comments_commitment_id_fkey` FOREIGN KEY (`commitment_id`) REFERENCES `commitments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `observation_comments` ADD CONSTRAINT `observation_comments_progress_update_id_fkey` FOREIGN KEY (`progress_update_id`) REFERENCES `progress_updates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `observation_comments` ADD CONSTRAINT `observation_comments_author_user_id_fkey` FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `progress_review_history` ADD CONSTRAINT `progress_review_history_progress_update_id_fkey` FOREIGN KEY (`progress_update_id`) REFERENCES `progress_updates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `progress_review_history` ADD CONSTRAINT `progress_review_history_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
