-- CreateTable
CREATE TABLE `users` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(255) NULL,
    `avatar` VARCHAR(255) NULL,
    `job_title` VARCHAR(191) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `email_verified` BOOLEAN NOT NULL DEFAULT false,
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `roles` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `roles_name_key`(`name`),
    INDEX `roles_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permissions` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `permissions_name_key`(`name`),
    INDEX `permissions_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_roles` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `role_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `user_roles_role_id_idx`(`role_id`),
    UNIQUE INDEX `user_roles_user_id_role_id_key`(`user_id`, `role_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role_permissions` (
    `id` CHAR(36) NOT NULL,
    `role_id` CHAR(36) NOT NULL,
    `permission_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `role_permissions_permission_id_idx`(`permission_id`),
    UNIQUE INDEX `role_permissions_role_id_permission_id_key`(`role_id`, `permission_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invitations` (
    `id` CHAR(36) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `role_id` CHAR(36) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `accepted_at` DATETIME(3) NULL,
    `created_by` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `invitations_token_key`(`token`),
    INDEX `invitations_email_idx`(`email`),
    INDEX `invitations_role_id_idx`(`role_id`),
    INDEX `invitations_created_by_idx`(`created_by`),
    INDEX `invitations_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `settings` (
    `id` CHAR(36) NOT NULL,
    `app_name` VARCHAR(191) NOT NULL,
    `logo` VARCHAR(255) NULL,
    `primary_color` VARCHAR(32) NULL,
    `support_email` VARCHAR(191) NOT NULL,
    `timezone` VARCHAR(100) NOT NULL,
    `date_format` VARCHAR(50) NOT NULL,
    `sender_name` VARCHAR(191) NOT NULL,
    `sender_email` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `settings_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `message` TEXT NOT NULL,
    `type` ENUM('info', 'success', 'warning', 'error') NOT NULL DEFAULT 'info',
    `priority` ENUM('LOW', 'NORMAL', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'NORMAL',
    `event_type` VARCHAR(100) NULL,
    `entity_type` VARCHAR(100) NULL,
    `entity_id` CHAR(36) NULL,
    `target_url` VARCHAR(500) NULL,
    `dedupe_key` VARCHAR(255) NULL,
    `is_read` BOOLEAN NOT NULL DEFAULT false,
    `read_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `notifications_dedupe_key_key`(`dedupe_key`),
    INDEX `notifications_user_id_is_read_idx`(`user_id`, `is_read`),
    INDEX `notifications_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `notifications_event_type_entity_type_entity_id_idx`(`event_type`, `entity_type`, `entity_id`),
    INDEX `notifications_priority_created_at_idx`(`priority`, `created_at`),
    INDEX `notifications_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_deliveries` (
    `id` CHAR(36) NOT NULL,
    `notification_id` CHAR(36) NULL,
    `dedupe_key` VARCHAR(255) NULL,
    `channel` ENUM('IN_APP', 'EMAIL') NOT NULL,
    `recipient_user_id` CHAR(36) NULL,
    `recipient_email` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'SENT', 'FAILED', 'SKIPPED') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `last_attempt_at` DATETIME(3) NULL,
    `sent_at` DATETIME(3) NULL,
    `error_message` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `notification_deliveries_dedupe_key_key`(`dedupe_key`),
    INDEX `notification_deliveries_notification_id_channel_idx`(`notification_id`, `channel`),
    INDEX `notification_deliveries_recipient_user_id_channel_status_idx`(`recipient_user_id`, `channel`, `status`),
    INDEX `notification_deliveries_status_last_attempt_at_idx`(`status`, `last_attempt_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `entity_activities` (
    `id` CHAR(36) NOT NULL,
    `observation_id` CHAR(36) NULL,
    `entity_type` VARCHAR(64) NOT NULL,
    `entity_id` VARCHAR(191) NOT NULL,
    `activity_type` VARCHAR(100) NOT NULL,
    `action` VARCHAR(100) NOT NULL,
    `actor_user_id` CHAR(36) NULL,
    `actor_type` VARCHAR(32) NOT NULL DEFAULT 'USER',
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `previous_data_json` JSON NULL,
    `new_data_json` JSON NULL,
    `metadata_json` JSON NULL,
    `visibility` VARCHAR(32) NOT NULL DEFAULT 'ALL_AUTHORIZED',
    `target_url` VARCHAR(500) NULL,
    `dedupe_key` VARCHAR(255) NULL,
    `related_audit_log_id` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `entity_activities_dedupe_key_key`(`dedupe_key`),
    INDEX `entity_activities_observation_id_idx`(`observation_id`),
    INDEX `entity_activities_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    INDEX `entity_activities_actor_user_id_idx`(`actor_user_id`),
    INDEX `entity_activities_activity_type_idx`(`activity_type`),
    INDEX `entity_activities_created_at_idx`(`created_at`),
    INDEX `entity_activities_visibility_idx`(`visibility`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `scheduled_job_executions` (
    `id` CHAR(36) NOT NULL,
    `job_name` VARCHAR(100) NOT NULL,
    `started_at` DATETIME(3) NOT NULL,
    `finished_at` DATETIME(3) NULL,
    `status` ENUM('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED') NOT NULL,
    `processed_count` INTEGER NOT NULL DEFAULT 0,
    `notifications_created` INTEGER NOT NULL DEFAULT 0,
    `emails_sent` INTEGER NOT NULL DEFAULT 0,
    `failures_count` INTEGER NOT NULL DEFAULT 0,
    `details_json` JSON NULL,
    `error_message` TEXT NULL,
    `triggered_by` ENUM('CRON', 'USER', 'SYSTEM') NOT NULL,
    `triggered_by_user_id` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `scheduled_job_executions_job_name_started_at_idx`(`job_name`, `started_at`),
    INDEX `scheduled_job_executions_job_name_status_idx`(`job_name`, `status`),
    INDEX `scheduled_job_executions_triggered_by_user_id_idx`(`triggered_by_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `scheduled_job_locks` (
    `job_name` VARCHAR(100) NOT NULL,
    `lock_token` CHAR(36) NOT NULL,
    `acquired_at` DATETIME(3) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `scheduled_job_locks_lock_token_key`(`lock_token`),
    INDEX `scheduled_job_locks_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`job_name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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

    INDEX `module_records_module_key_deleted_at_idx`(`module_key`, `deleted_at`),
    INDEX `module_records_module_key_is_active_idx`(`module_key`, `is_active`),
    INDEX `module_records_module_key_created_at_idx`(`module_key`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activity_logs` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NULL,
    `action` VARCHAR(191) NOT NULL,
    `entity_type` VARCHAR(191) NOT NULL,
    `entity_id` CHAR(36) NULL,
    `metadata` JSON NULL,
    `ip_address` VARCHAR(45) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `activity_logs_user_id_idx`(`user_id`),
    INDEX `activity_logs_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    INDEX `activity_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` CHAR(36) NOT NULL,
    `entity_type` VARCHAR(191) NOT NULL,
    `entity_id` CHAR(36) NULL,
    `old_values` JSON NULL,
    `new_values` JSON NULL,
    `changed_by` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `audit_logs_changed_by_idx`(`changed_by`),
    INDEX `audit_logs_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    INDEX `audit_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `risk_levels` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `key` VARCHAR(100) NOT NULL,
    `description` VARCHAR(500) NULL,
    `color_token` VARCHAR(64) NULL,
    `severity_order` INTEGER NOT NULL,
    `default_deadline_days` INTEGER NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `risk_levels_name_key`(`name`),
    UNIQUE INDEX `risk_levels_key_key`(`key`),
    INDEX `risk_levels_active_deleted_at_idx`(`active`, `deleted_at`),
    INDEX `risk_levels_deleted_at_idx`(`deleted_at`),
    INDEX `risk_levels_severity_order_idx`(`severity_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `observation_statuses` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `key` VARCHAR(100) NOT NULL,
    `description` VARCHAR(500) NULL,
    `sort_order` INTEGER NOT NULL,
    `is_initial` BOOLEAN NOT NULL DEFAULT false,
    `is_final` BOOLEAN NOT NULL DEFAULT false,
    `counts_as_overdue` BOOLEAN NOT NULL DEFAULT false,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `observation_statuses_key_key`(`key`),
    INDEX `observation_statuses_active_deleted_at_idx`(`active`, `deleted_at`),
    INDEX `observation_statuses_deleted_at_idx`(`deleted_at`),
    INDEX `observation_statuses_sort_order_idx`(`sort_order`),
    UNIQUE INDEX `observation_statuses_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `areas` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(100) NULL,
    `description` VARCHAR(500) NULL,
    `manager_user_id` CHAR(36) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `areas_name_key`(`name`),
    UNIQUE INDEX `areas_code_key`(`code`),
    INDEX `areas_active_deleted_at_idx`(`active`, `deleted_at`),
    INDEX `areas_deleted_at_idx`(`deleted_at`),
    INDEX `areas_manager_user_id_idx`(`manager_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_reports` (
    `id` CHAR(36) NOT NULL,
    `report_number` VARCHAR(64) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `report_date` DATE NOT NULL,
    `created_by_user_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `audit_reports_report_number_key`(`report_number`),
    INDEX `audit_reports_created_by_user_id_idx`(`created_by_user_id`),
    INDEX `audit_reports_report_date_idx`(`report_date`),
    INDEX `audit_reports_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `observation_dictionary` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `observation_dictionary_name_key`(`name`),
    INDEX `observation_dictionary_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `risks` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `risks_name_key`(`name`),
    INDEX `risks_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `system_parameters` (
    `id` CHAR(36) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `value_type` VARCHAR(32) NOT NULL,
    `group_name` VARCHAR(100) NOT NULL,
    `description` VARCHAR(500) NULL,
    `editable` BOOLEAN NOT NULL DEFAULT true,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `system_parameters_key_key`(`key`),
    INDEX `system_parameters_active_deleted_at_idx`(`active`, `deleted_at`),
    INDEX `system_parameters_deleted_at_idx`(`deleted_at`),
    INDEX `system_parameters_group_name_active_deleted_at_idx`(`group_name`, `active`, `deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `catalogs` (
    `id` CHAR(36) NOT NULL,
    `type` VARCHAR(100) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `key` VARCHAR(100) NULL,
    `description` VARCHAR(500) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `catalogs_active_deleted_at_idx`(`active`, `deleted_at`),
    INDEX `catalogs_deleted_at_idx`(`deleted_at`),
    INDEX `catalogs_type_sort_order_idx`(`type`, `sort_order`),
    INDEX `catalogs_type_active_deleted_at_idx`(`type`, `active`, `deleted_at`),
    UNIQUE INDEX `catalogs_type_key_key`(`type`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `observations` (
    `id` CHAR(36) NOT NULL,
    `audit_report_id` CHAR(36) NOT NULL,
    `observation_number` INTEGER NOT NULL,
    `main_observation_id` CHAR(36) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `audit_recommendation` TEXT NOT NULL,
    `risk_level_id` CHAR(36) NOT NULL,
    `status_id` CHAR(36) NOT NULL,
    `auditor_user_id` CHAR(36) NOT NULL,
    `original_due_date` DATE NOT NULL,
    `current_due_date` DATE NOT NULL,
    `source` VARCHAR(191) NULL,
    `process_name` VARCHAR(191) NULL,
    `category` VARCHAR(191) NULL,
    `progress_percent` INTEGER NOT NULL DEFAULT 0,
    `current_stage` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `observations_audit_report_id_idx`(`audit_report_id`),
    INDEX `observations_auditor_user_id_idx`(`auditor_user_id`),
    INDEX `observations_deleted_at_idx`(`deleted_at`),
    INDEX `observations_current_due_date_idx`(`current_due_date`),
    INDEX `observations_main_observation_id_idx`(`main_observation_id`),
    INDEX `observations_original_due_date_idx`(`original_due_date`),
    INDEX `observations_risk_level_id_idx`(`risk_level_id`),
    INDEX `observations_status_id_idx`(`status_id`),
    UNIQUE INDEX `observations_audit_report_id_observation_number_key`(`audit_report_id`, `observation_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `observation_risks` (
    `id` CHAR(36) NOT NULL,
    `observation_id` CHAR(36) NOT NULL,
    `risk_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `observation_risks_risk_id_idx`(`risk_id`),
    UNIQUE INDEX `observation_risks_observation_id_risk_id_key`(`observation_id`, `risk_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `observation_areas` (
    `id` CHAR(36) NOT NULL,
    `observation_id` CHAR(36) NOT NULL,
    `area_id` CHAR(36) NOT NULL,
    `process_owner_user_id` CHAR(36) NOT NULL,
    `area_responsible_user_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `observation_areas_area_id_idx`(`area_id`),
    INDEX `observation_areas_observation_id_idx`(`observation_id`),
    INDEX `observation_areas_process_owner_user_id_idx`(`process_owner_user_id`),
    INDEX `observation_areas_area_responsible_user_id_idx`(`area_responsible_user_id`),
    UNIQUE INDEX `observation_areas_observation_id_area_id_key`(`observation_id`, `area_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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
    `workflow_instance_id` CHAR(36) NULL,

    INDEX `remediation_plans_area_id_idx`(`area_id`),
    INDEX `remediation_plans_created_by_user_id_idx`(`created_by_user_id`),
    INDEX `remediation_plans_deleted_at_idx`(`deleted_at`),
    INDEX `remediation_plans_observation_id_idx`(`observation_id`),
    INDEX `remediation_plans_owner_user_id_idx`(`owner_user_id`),
    INDEX `remediation_plans_status_idx`(`status`),
    INDEX `remediation_plans_approved_by_user_id_idx`(`approved_by_user_id`),
    INDEX `remediation_plans_returned_by_user_id_idx`(`returned_by_user_id`),
    INDEX `remediation_plans_workflow_instance_id_idx`(`workflow_instance_id`),
    UNIQUE INDEX `remediation_plans_observation_id_area_id_key`(`observation_id`, `area_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `action_plans` (
    `id` CHAR(36) NOT NULL,
    `remediation_plan_id` CHAR(36) NULL,
    `observation_id` CHAR(36) NOT NULL,
    `observation_area_id` CHAR(36) NOT NULL,
    `responsible_user_id` CHAR(36) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `original_due_date` DATE NOT NULL,
    `current_due_date` DATE NOT NULL,
    `completed_at` DATETIME(3) NULL,
    `progress_percent` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('NOT_STARTED', 'STARTED', 'WITH_PROGRESS', 'CONCLUDED') NOT NULL DEFAULT 'NOT_STARTED',
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `action_plans_completed_at_idx`(`completed_at`),
    INDEX `action_plans_deleted_at_idx`(`deleted_at`),
    INDEX `action_plans_current_due_date_idx`(`current_due_date`),
    INDEX `action_plans_original_due_date_idx`(`original_due_date`),
    INDEX `action_plans_observation_id_idx`(`observation_id`),
    INDEX `action_plans_progress_percent_idx`(`progress_percent`),
    INDEX `action_plans_remediation_plan_id_idx`(`remediation_plan_id`),
    INDEX `action_plans_observation_area_id_idx`(`observation_area_id`),
    INDEX `action_plans_responsible_user_id_idx`(`responsible_user_id`),
    INDEX `action_plans_sort_order_idx`(`sort_order`),
    INDEX `action_plans_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `deadline_extension_requests` (
    `id` CHAR(36) NOT NULL,
    `target_type` ENUM('OBSERVATION', 'ACTION_PLAN') NOT NULL,
    `observation_id` CHAR(36) NULL,
    `action_plan_id` CHAR(36) NULL,
    `observation_area_id` CHAR(36) NULL,
    `requested_by_user_id` CHAR(36) NOT NULL,
    `previous_due_date` DATE NOT NULL,
    `proposed_due_date` DATE NOT NULL,
    `reason` LONGTEXT NOT NULL,
    `status` ENUM('DRAFT', 'SENT_TO_MANAGER', 'MANAGER_APPROVED', 'MANAGER_REJECTED', 'SENT_TO_AUDIT', 'AUDIT_APPROVED', 'AUDIT_REJECTED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `manager_reviewer_id` CHAR(36) NULL,
    `manager_reviewed_at` DATETIME(3) NULL,
    `manager_comment` LONGTEXT NULL,
    `audit_reviewer_id` CHAR(36) NULL,
    `audit_reviewed_at` DATETIME(3) NULL,
    `audit_comment` LONGTEXT NULL,
    `final_approved_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `workflow_instance_id` CHAR(36) NULL,

    INDEX `deadline_extension_requests_observation_area_id_idx`(`observation_area_id`),
    INDEX `deadline_extension_requests_audit_reviewer_id_idx`(`audit_reviewer_id`),
    INDEX `deadline_extension_requests_action_plan_id_idx`(`action_plan_id`),
    INDEX `deadline_extension_requests_deleted_at_idx`(`deleted_at`),
    INDEX `deadline_extension_requests_manager_reviewer_id_idx`(`manager_reviewer_id`),
    INDEX `der_observation_action_plan_status_deleted_idx`(`observation_id`, `action_plan_id`, `status`, `deleted_at`),
    INDEX `deadline_extension_requests_requested_by_user_id_idx`(`requested_by_user_id`),
    INDEX `deadline_extension_requests_status_updated_at_idx`(`status`, `updated_at`),
    INDEX `deadline_extension_requests_workflow_instance_id_idx`(`workflow_instance_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `deadline_extension_attachments` (
    `id` CHAR(36) NOT NULL,
    `extension_request_id` CHAR(36) NOT NULL,
    `evidence_file_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `deadline_extension_attachments_evidence_file_id_idx`(`evidence_file_id`),
    UNIQUE INDEX `dea_extension_request_id_evidence_file_id_key`(`extension_request_id`, `evidence_file_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sessions` (
    `id` CHAR(36) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `token` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `ip_address` VARCHAR(45) NULL,
    `user_agent` VARCHAR(255) NULL,
    `user_id` CHAR(36) NOT NULL,

    UNIQUE INDEX `sessions_token_key`(`token`),
    INDEX `sessions_user_id_idx`(`user_id`),
    INDEX `sessions_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `accounts` (
    `id` CHAR(36) NOT NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `provider_id` VARCHAR(191) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `access_token` TEXT NULL,
    `refresh_token` TEXT NULL,
    `id_token` TEXT NULL,
    `access_token_expires_at` DATETIME(3) NULL,
    `refresh_token_expires_at` DATETIME(3) NULL,
    `scope` VARCHAR(255) NULL,
    `password` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `accounts_user_id_idx`(`user_id`),
    UNIQUE INDEX `accounts_provider_id_account_id_key`(`provider_id`, `account_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `verifications` (
    `id` CHAR(36) NOT NULL,
    `identifier` VARCHAR(255) NOT NULL,
    `value` TEXT NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `verifications_identifier_idx`(`identifier`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `progress_evaluations` (
    `id` CHAR(36) NOT NULL,
    `action_plan_id` CHAR(36) NOT NULL,
    `submitted_by_user_id` CHAR(36) NOT NULL,
    `type` ENUM('ADVANCE', 'FINALIZATION', 'CORRECTION') NOT NULL DEFAULT 'ADVANCE',
    `progress_percent` INTEGER NOT NULL,
    `action_plan_status` ENUM('NOT_STARTED', 'STARTED', 'WITH_PROGRESS', 'CONCLUDED') NOT NULL,
    `comment` LONGTEXT NOT NULL,
    `review_status` ENUM('DRAFT', 'SENT_TO_AUDIT', 'APPROVED', 'RETURNED', 'REJECTED') NOT NULL DEFAULT 'DRAFT',
    `reviewed_by_user_id` CHAR(36) NULL,
    `submitted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reviewed_at` DATETIME(3) NULL,
    `review_comment` LONGTEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `workflow_instance_id` CHAR(36) NULL,

    INDEX `progress_evaluations_action_plan_id_submitted_at_idx`(`action_plan_id`, `submitted_at`),
    INDEX `progress_evaluations_deleted_at_idx`(`deleted_at`),
    INDEX `progress_evaluations_review_status_deleted_at_idx`(`review_status`, `deleted_at`),
    INDEX `progress_evaluations_reviewed_by_user_id_idx`(`reviewed_by_user_id`),
    INDEX `progress_evaluations_review_status_idx`(`review_status`),
    INDEX `progress_evaluations_submitted_by_user_id_idx`(`submitted_by_user_id`),
    INDEX `progress_evaluations_workflow_instance_id_idx`(`workflow_instance_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `evidence_files` (
    `id` CHAR(36) NOT NULL,
    `observation_id` CHAR(36) NOT NULL,
    `context` ENUM('FINDING', 'ACTION_PLAN', 'PROGRESS_EVALUATION', 'CLOSURE') NOT NULL,
    `action_plan_id` CHAR(36) NULL,
    `progress_evaluation_id` CHAR(36) NULL,
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

    INDEX `evidence_files_action_plan_id_idx`(`action_plan_id`),
    INDEX `evidence_files_context_idx`(`context`),
    INDEX `evidence_files_deleted_at_idx`(`deleted_at`),
    INDEX `evidence_files_observation_id_created_at_idx`(`observation_id`, `created_at`),
    INDEX `evidence_files_progress_evaluation_id_idx`(`progress_evaluation_id`),
    INDEX `evidence_files_uploaded_by_user_id_idx`(`uploaded_by_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `observation_comments` (
    `id` CHAR(36) NOT NULL,
    `observation_id` CHAR(36) NOT NULL,
    `remediation_plan_id` CHAR(36) NULL,
    `action_plan_id` CHAR(36) NULL,
    `progress_evaluation_id` CHAR(36) NULL,
    `author_user_id` CHAR(36) NOT NULL,
    `visibility` ENUM('INTERNAL_AUDIT', 'AREA_VISIBLE', 'SYSTEM') NOT NULL DEFAULT 'AREA_VISIBLE',
    `body` LONGTEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `observation_comments_author_user_id_idx`(`author_user_id`),
    INDEX `observation_comments_action_plan_id_idx`(`action_plan_id`),
    INDEX `observation_comments_deleted_at_idx`(`deleted_at`),
    INDEX `observation_comments_observation_id_created_at_idx`(`observation_id`, `created_at`),
    INDEX `observation_comments_progress_evaluation_id_idx`(`progress_evaluation_id`),
    INDEX `observation_comments_remediation_plan_id_idx`(`remediation_plan_id`),
    INDEX `observation_comments_visibility_idx`(`visibility`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `progress_review_history` (
    `id` CHAR(36) NOT NULL,
    `progress_evaluation_id` CHAR(36) NOT NULL,
    `action` ENUM('SENT', 'APPROVED', 'RETURNED', 'REJECTED') NOT NULL,
    `from_status` ENUM('DRAFT', 'SENT_TO_AUDIT', 'APPROVED', 'RETURNED', 'REJECTED') NULL,
    `to_status` ENUM('DRAFT', 'SENT_TO_AUDIT', 'APPROVED', 'RETURNED', 'REJECTED') NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `comment` LONGTEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `progress_review_history_created_at_idx`(`created_at`),
    INDEX `progress_review_history_progress_evaluation_id_created_at_idx`(`progress_evaluation_id`, `created_at`),
    INDEX `progress_review_history_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workflow_definitions` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `process_type` VARCHAR(100) NOT NULL,
    `status` ENUM('DRAFT', 'PUBLISHED', 'INACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `active_version_id` CHAR(36) NULL,
    `created_by_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `archived_at` DATETIME(3) NULL,

    UNIQUE INDEX `workflow_definitions_active_version_id_key`(`active_version_id`),
    INDEX `workflow_definitions_process_type_status_idx`(`process_type`, `status`),
    INDEX `workflow_definitions_status_updated_at_idx`(`status`, `updated_at`),
    INDEX `workflow_definitions_created_by_id_idx`(`created_by_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workflow_versions` (
    `id` CHAR(36) NOT NULL,
    `workflow_definition_id` CHAR(36) NOT NULL,
    `version_number` INTEGER NOT NULL,
    `status` ENUM('DRAFT', 'PUBLISHED', 'INACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `change_description` TEXT NULL,
    `created_by_id` CHAR(36) NOT NULL,
    `published_by_id` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `published_at` DATETIME(3) NULL,

    INDEX `workflow_versions_workflow_definition_id_status_idx`(`workflow_definition_id`, `status`),
    INDEX `workflow_versions_status_published_at_idx`(`status`, `published_at`),
    INDEX `workflow_versions_created_by_id_idx`(`created_by_id`),
    INDEX `workflow_versions_published_by_id_idx`(`published_by_id`),
    UNIQUE INDEX `workflow_versions_workflow_definition_id_version_number_key`(`workflow_definition_id`, `version_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workflow_nodes` (
    `id` CHAR(36) NOT NULL,
    `workflow_version_id` CHAR(36) NOT NULL,
    `node_key` VARCHAR(100) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `type` ENUM('START', 'STAGE', 'APPROVAL', 'REJECTION', 'CONDITION', 'SLA', 'ESCALATION', 'NOTIFICATION', 'END') NOT NULL,
    `assignment_strategy` ENUM('FIXED_USER', 'ROLE', 'AREA', 'MANAGEMENT', 'RECORD_OWNER', 'OBSERVATION_RESPONSIBLE', 'REQUESTER', 'SUPERVISOR', 'FIELD_REFERENCE') NULL,
    `position_x` DOUBLE NOT NULL,
    `position_y` DOUBLE NOT NULL,
    `configuration_json` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `workflow_nodes_workflow_version_id_type_idx`(`workflow_version_id`, `type`),
    UNIQUE INDEX `workflow_nodes_workflow_version_id_node_key_key`(`workflow_version_id`, `node_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workflow_transitions` (
    `id` CHAR(36) NOT NULL,
    `workflow_version_id` CHAR(36) NOT NULL,
    `source_node_id` CHAR(36) NOT NULL,
    `target_node_id` CHAR(36) NOT NULL,
    `label` VARCHAR(191) NULL,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `transition_type` VARCHAR(64) NULL,
    `condition_group_id` CHAR(36) NULL,

    INDEX `workflow_transitions_workflow_version_id_priority_idx`(`workflow_version_id`, `priority`),
    INDEX `workflow_transitions_source_node_id_priority_idx`(`source_node_id`, `priority`),
    INDEX `workflow_transitions_target_node_id_idx`(`target_node_id`),
    INDEX `workflow_transitions_condition_group_id_idx`(`condition_group_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workflow_condition_groups` (
    `id` CHAR(36) NOT NULL,
    `workflow_version_id` CHAR(36) NOT NULL,
    `logic_operator` ENUM('AND', 'OR') NOT NULL,
    `description` TEXT NULL,

    INDEX `workflow_condition_groups_workflow_version_id_idx`(`workflow_version_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workflow_conditions` (
    `id` CHAR(36) NOT NULL,
    `condition_group_id` CHAR(36) NOT NULL,
    `field` VARCHAR(100) NOT NULL,
    `operator` ENUM('EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'LESS_THAN', 'GREATER_THAN_OR_EQUAL', 'LESS_THAN_OR_EQUAL', 'CONTAINS', 'NOT_CONTAINS', 'IS_EMPTY', 'IS_NOT_EMPTY', 'IN', 'NOT_IN', 'IS_OVERDUE', 'DUE_WITHIN') NOT NULL,
    `value_json` JSON NULL,
    `sequence` INTEGER NOT NULL,
    `description` TEXT NULL,

    INDEX `workflow_conditions_condition_group_id_sequence_idx`(`condition_group_id`, `sequence`),
    UNIQUE INDEX `workflow_conditions_condition_group_id_sequence_key`(`condition_group_id`, `sequence`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workflow_instances` (
    `id` CHAR(36) NOT NULL,
    `workflow_definition_id` CHAR(36) NOT NULL,
    `workflow_version_id` CHAR(36) NOT NULL,
    `process_type` VARCHAR(100) NOT NULL,
    `entity_type` VARCHAR(100) NOT NULL,
    `entity_id` VARCHAR(191) NOT NULL,
    `current_node_id` CHAR(36) NULL,
    `status` ENUM('PENDING', 'ACTIVE', 'WAITING', 'COMPLETED', 'REJECTED', 'CANCELLED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `started_by_id` CHAR(36) NOT NULL,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completed_at` DATETIME(3) NULL,
    `final_result` VARCHAR(64) NULL,
    `runtime_error_code` VARCHAR(100) NULL,
    `runtime_error_message` TEXT NULL,
    `last_execution_at` DATETIME(3) NULL,
    `context_json` JSON NOT NULL,

    INDEX `workflow_instances_workflow_definition_id_status_idx`(`workflow_definition_id`, `status`),
    INDEX `workflow_instances_workflow_version_id_status_idx`(`workflow_version_id`, `status`),
    INDEX `workflow_instances_process_type_status_idx`(`process_type`, `status`),
    INDEX `workflow_instances_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    INDEX `workflow_instances_current_node_id_status_idx`(`current_node_id`, `status`),
    INDEX `workflow_instances_started_by_id_idx`(`started_by_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workflow_tasks` (
    `id` CHAR(36) NOT NULL,
    `workflow_instance_id` CHAR(36) NOT NULL,
    `node_id` CHAR(36) NOT NULL,
    `assigned_user_id` CHAR(36) NULL,
    `assigned_role_id` CHAR(36) NULL,
    `assigned_area_id` CHAR(36) NULL,
    `status` ENUM('PENDING', 'IN_PROGRESS', 'APPROVED', 'REJECTED', 'OBSERVED', 'CORRECTION_REQUESTED', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    `entry_sequence` INTEGER NOT NULL DEFAULT 1,
    `due_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `decision` VARCHAR(100) NULL,
    `comments` LONGTEXT NULL,
    `assignment_snapshot_json` JSON NULL,
    `assignment_history_json` JSON NULL,
    `evidence_references_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `workflow_tasks_assigned_user_id_status_due_at_idx`(`assigned_user_id`, `status`, `due_at`),
    INDEX `workflow_tasks_assigned_role_id_status_idx`(`assigned_role_id`, `status`),
    INDEX `workflow_tasks_assigned_area_id_status_idx`(`assigned_area_id`, `status`),
    INDEX `workflow_tasks_workflow_instance_id_status_idx`(`workflow_instance_id`, `status`),
    INDEX `workflow_tasks_node_id_idx`(`node_id`),
    INDEX `workflow_tasks_status_due_at_idx`(`status`, `due_at`),
    UNIQUE INDEX `workflow_tasks_instance_node_entry_key`(`workflow_instance_id`, `node_id`, `entry_sequence`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workflow_transition_logs` (
    `id` CHAR(36) NOT NULL,
    `workflow_instance_id` CHAR(36) NOT NULL,
    `source_node_id` CHAR(36) NULL,
    `target_node_id` CHAR(36) NULL,
    `trigger_type` VARCHAR(64) NOT NULL,
    `performed_by_id` CHAR(36) NULL,
    `decision` VARCHAR(100) NULL,
    `event_type` VARCHAR(64) NULL,
    `details_json` JSON NULL,
    `context_snapshot_json` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `workflow_transition_logs_workflow_instance_id_created_at_idx`(`workflow_instance_id`, `created_at`),
    INDEX `workflow_transition_logs_source_node_id_idx`(`source_node_id`),
    INDEX `workflow_transition_logs_target_node_id_idx`(`target_node_id`),
    INDEX `workflow_transition_logs_performed_by_id_idx`(`performed_by_id`),
    INDEX `workflow_transition_logs_workflow_instance_id_event_type_cre_idx`(`workflow_instance_id`, `event_type`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workflow_timers` (
    `id` CHAR(36) NOT NULL,
    `workflow_instance_id` CHAR(36) NOT NULL,
    `workflow_task_id` CHAR(36) NULL,
    `timer_type` VARCHAR(64) NOT NULL,
    `execute_at` DATETIME(3) NOT NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `executed_at` DATETIME(3) NULL,
    `configuration_json` JSON NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `last_error` TEXT NULL,
    `last_attempt_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `workflow_timers_status_execute_at_idx`(`status`, `execute_at`),
    INDEX `workflow_timers_workflow_instance_id_status_idx`(`workflow_instance_id`, `status`),
    INDEX `workflow_timers_workflow_task_id_status_idx`(`workflow_task_id`, `status`),
    UNIQUE INDEX `workflow_timers_task_type_key`(`workflow_task_id`, `timer_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invitations` ADD CONSTRAINT `invitations_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invitations` ADD CONSTRAINT `invitations_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_deliveries` ADD CONSTRAINT `notification_deliveries_notification_id_fkey` FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_deliveries` ADD CONSTRAINT `notification_deliveries_recipient_user_id_fkey` FOREIGN KEY (`recipient_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `entity_activities` ADD CONSTRAINT `entity_activities_observation_id_fkey` FOREIGN KEY (`observation_id`) REFERENCES `observations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `entity_activities` ADD CONSTRAINT `entity_activities_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `scheduled_job_executions` ADD CONSTRAINT `scheduled_job_executions_triggered_by_user_id_fkey` FOREIGN KEY (`triggered_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activity_logs` ADD CONSTRAINT `activity_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_changed_by_fkey` FOREIGN KEY (`changed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `areas` ADD CONSTRAINT `areas_manager_user_id_fkey` FOREIGN KEY (`manager_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_reports` ADD CONSTRAINT `audit_reports_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `observations` ADD CONSTRAINT `observations_audit_report_id_fkey` FOREIGN KEY (`audit_report_id`) REFERENCES `audit_reports`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `observations` ADD CONSTRAINT `observations_main_observation_id_fkey` FOREIGN KEY (`main_observation_id`) REFERENCES `observation_dictionary`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `observations` ADD CONSTRAINT `observations_risk_level_id_fkey` FOREIGN KEY (`risk_level_id`) REFERENCES `risk_levels`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `observations` ADD CONSTRAINT `observations_status_id_fkey` FOREIGN KEY (`status_id`) REFERENCES `observation_statuses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `observations` ADD CONSTRAINT `observations_auditor_user_id_fkey` FOREIGN KEY (`auditor_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `observation_risks` ADD CONSTRAINT `observation_risks_observation_id_fkey` FOREIGN KEY (`observation_id`) REFERENCES `observations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `observation_risks` ADD CONSTRAINT `observation_risks_risk_id_fkey` FOREIGN KEY (`risk_id`) REFERENCES `risks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `observation_areas` ADD CONSTRAINT `observation_areas_observation_id_fkey` FOREIGN KEY (`observation_id`) REFERENCES `observations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `observation_areas` ADD CONSTRAINT `observation_areas_area_id_fkey` FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `observation_areas` ADD CONSTRAINT `observation_areas_process_owner_user_id_fkey` FOREIGN KEY (`process_owner_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `observation_areas` ADD CONSTRAINT `observation_areas_area_responsible_user_id_fkey` FOREIGN KEY (`area_responsible_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE `action_plans` ADD CONSTRAINT `action_plans_remediation_plan_id_fkey` FOREIGN KEY (`remediation_plan_id`) REFERENCES `remediation_plans`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `action_plans` ADD CONSTRAINT `action_plans_observation_id_fkey` FOREIGN KEY (`observation_id`) REFERENCES `observations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `action_plans` ADD CONSTRAINT `action_plans_observation_area_id_fkey` FOREIGN KEY (`observation_area_id`) REFERENCES `observation_areas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `action_plans` ADD CONSTRAINT `action_plans_responsible_user_id_fkey` FOREIGN KEY (`responsible_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `deadline_extension_requests` ADD CONSTRAINT `deadline_extension_requests_observation_id_fkey` FOREIGN KEY (`observation_id`) REFERENCES `observations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `deadline_extension_requests` ADD CONSTRAINT `deadline_extension_requests_action_plan_id_fkey` FOREIGN KEY (`action_plan_id`) REFERENCES `action_plans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `deadline_extension_requests` ADD CONSTRAINT `deadline_extension_requests_observation_area_id_fkey` FOREIGN KEY (`observation_area_id`) REFERENCES `observation_areas`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `deadline_extension_requests` ADD CONSTRAINT `deadline_extension_requests_requested_by_user_id_fkey` FOREIGN KEY (`requested_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `deadline_extension_requests` ADD CONSTRAINT `deadline_extension_requests_manager_reviewer_id_fkey` FOREIGN KEY (`manager_reviewer_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `deadline_extension_requests` ADD CONSTRAINT `deadline_extension_requests_audit_reviewer_id_fkey` FOREIGN KEY (`audit_reviewer_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `deadline_extension_attachments` ADD CONSTRAINT `deadline_extension_attachments_extension_request_id_fkey` FOREIGN KEY (`extension_request_id`) REFERENCES `deadline_extension_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `deadline_extension_attachments` ADD CONSTRAINT `deadline_extension_attachments_evidence_file_id_fkey` FOREIGN KEY (`evidence_file_id`) REFERENCES `evidence_files`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `progress_evaluations` ADD CONSTRAINT `progress_evaluations_action_plan_id_fkey` FOREIGN KEY (`action_plan_id`) REFERENCES `action_plans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `progress_evaluations` ADD CONSTRAINT `progress_evaluations_submitted_by_user_id_fkey` FOREIGN KEY (`submitted_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `progress_evaluations` ADD CONSTRAINT `progress_evaluations_reviewed_by_user_id_fkey` FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evidence_files` ADD CONSTRAINT `evidence_files_observation_id_fkey` FOREIGN KEY (`observation_id`) REFERENCES `observations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evidence_files` ADD CONSTRAINT `evidence_files_action_plan_id_fkey` FOREIGN KEY (`action_plan_id`) REFERENCES `action_plans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evidence_files` ADD CONSTRAINT `evidence_files_progress_evaluation_id_fkey` FOREIGN KEY (`progress_evaluation_id`) REFERENCES `progress_evaluations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evidence_files` ADD CONSTRAINT `evidence_files_uploaded_by_user_id_fkey` FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `observation_comments` ADD CONSTRAINT `observation_comments_observation_id_fkey` FOREIGN KEY (`observation_id`) REFERENCES `observations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `observation_comments` ADD CONSTRAINT `observation_comments_remediation_plan_id_fkey` FOREIGN KEY (`remediation_plan_id`) REFERENCES `remediation_plans`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `observation_comments` ADD CONSTRAINT `observation_comments_action_plan_id_fkey` FOREIGN KEY (`action_plan_id`) REFERENCES `action_plans`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `observation_comments` ADD CONSTRAINT `observation_comments_progress_evaluation_id_fkey` FOREIGN KEY (`progress_evaluation_id`) REFERENCES `progress_evaluations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `observation_comments` ADD CONSTRAINT `observation_comments_author_user_id_fkey` FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `progress_review_history` ADD CONSTRAINT `progress_review_history_progress_evaluation_id_fkey` FOREIGN KEY (`progress_evaluation_id`) REFERENCES `progress_evaluations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `progress_review_history` ADD CONSTRAINT `progress_review_history_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_definitions` ADD CONSTRAINT `workflow_definitions_active_version_id_fkey` FOREIGN KEY (`active_version_id`) REFERENCES `workflow_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_definitions` ADD CONSTRAINT `workflow_definitions_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_versions` ADD CONSTRAINT `workflow_versions_workflow_definition_id_fkey` FOREIGN KEY (`workflow_definition_id`) REFERENCES `workflow_definitions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_versions` ADD CONSTRAINT `workflow_versions_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_versions` ADD CONSTRAINT `workflow_versions_published_by_id_fkey` FOREIGN KEY (`published_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_nodes` ADD CONSTRAINT `workflow_nodes_workflow_version_id_fkey` FOREIGN KEY (`workflow_version_id`) REFERENCES `workflow_versions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_transitions` ADD CONSTRAINT `workflow_transitions_workflow_version_id_fkey` FOREIGN KEY (`workflow_version_id`) REFERENCES `workflow_versions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_transitions` ADD CONSTRAINT `workflow_transitions_source_node_id_fkey` FOREIGN KEY (`source_node_id`) REFERENCES `workflow_nodes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_transitions` ADD CONSTRAINT `workflow_transitions_target_node_id_fkey` FOREIGN KEY (`target_node_id`) REFERENCES `workflow_nodes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_transitions` ADD CONSTRAINT `workflow_transitions_condition_group_id_fkey` FOREIGN KEY (`condition_group_id`) REFERENCES `workflow_condition_groups`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_condition_groups` ADD CONSTRAINT `workflow_condition_groups_workflow_version_id_fkey` FOREIGN KEY (`workflow_version_id`) REFERENCES `workflow_versions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_conditions` ADD CONSTRAINT `workflow_conditions_condition_group_id_fkey` FOREIGN KEY (`condition_group_id`) REFERENCES `workflow_condition_groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_instances` ADD CONSTRAINT `workflow_instances_workflow_definition_id_fkey` FOREIGN KEY (`workflow_definition_id`) REFERENCES `workflow_definitions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_instances` ADD CONSTRAINT `workflow_instances_workflow_version_id_fkey` FOREIGN KEY (`workflow_version_id`) REFERENCES `workflow_versions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_instances` ADD CONSTRAINT `workflow_instances_current_node_id_fkey` FOREIGN KEY (`current_node_id`) REFERENCES `workflow_nodes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_instances` ADD CONSTRAINT `workflow_instances_started_by_id_fkey` FOREIGN KEY (`started_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_tasks` ADD CONSTRAINT `workflow_tasks_workflow_instance_id_fkey` FOREIGN KEY (`workflow_instance_id`) REFERENCES `workflow_instances`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_tasks` ADD CONSTRAINT `workflow_tasks_node_id_fkey` FOREIGN KEY (`node_id`) REFERENCES `workflow_nodes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_tasks` ADD CONSTRAINT `workflow_tasks_assigned_user_id_fkey` FOREIGN KEY (`assigned_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_tasks` ADD CONSTRAINT `workflow_tasks_assigned_role_id_fkey` FOREIGN KEY (`assigned_role_id`) REFERENCES `roles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_tasks` ADD CONSTRAINT `workflow_tasks_assigned_area_id_fkey` FOREIGN KEY (`assigned_area_id`) REFERENCES `areas`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_transition_logs` ADD CONSTRAINT `workflow_transition_logs_workflow_instance_id_fkey` FOREIGN KEY (`workflow_instance_id`) REFERENCES `workflow_instances`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_transition_logs` ADD CONSTRAINT `workflow_transition_logs_source_node_id_fkey` FOREIGN KEY (`source_node_id`) REFERENCES `workflow_nodes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_transition_logs` ADD CONSTRAINT `workflow_transition_logs_target_node_id_fkey` FOREIGN KEY (`target_node_id`) REFERENCES `workflow_nodes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_transition_logs` ADD CONSTRAINT `workflow_transition_logs_performed_by_id_fkey` FOREIGN KEY (`performed_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_timers` ADD CONSTRAINT `workflow_timers_workflow_instance_id_fkey` FOREIGN KEY (`workflow_instance_id`) REFERENCES `workflow_instances`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_timers` ADD CONSTRAINT `workflow_timers_workflow_task_id_fkey` FOREIGN KEY (`workflow_task_id`) REFERENCES `workflow_tasks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

