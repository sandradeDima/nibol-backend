CREATE TABLE `audit_report_classes` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(500) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `audit_report_classes_name_key`(`name`),
    INDEX `audit_report_classes_active_deleted_at_idx`(`active`, `deleted_at`),
    INDEX `audit_report_classes_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `audit_reports`
    ADD COLUMN `report_class_id` CHAR(36) NULL,
    ADD INDEX `audit_reports_report_class_id_idx`(`report_class_id`),
    ADD CONSTRAINT `audit_reports_report_class_id_fkey`
        FOREIGN KEY (`report_class_id`) REFERENCES `audit_report_classes`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE `risk_levels`
SET `color_token` = CASE `color_token`
    WHEN 'critical' THEN '#B42318'
    WHEN 'high' THEN '#D92D20'
    WHEN 'medium' THEN '#DC6803'
    WHEN 'low' THEN '#027A48'
    ELSE `color_token`
END
WHERE `color_token` IN ('critical', 'high', 'medium', 'low');
