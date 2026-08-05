-- Phase 2.1 workflow foundation. Existing Phase 1 tables are untouched.

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

    UNIQUE INDEX `workflow_versions_workflow_definition_id_version_number_key`(`workflow_definition_id`, `version_number`),
    INDEX `workflow_versions_workflow_definition_id_status_idx`(`workflow_definition_id`, `status`),
    INDEX `workflow_versions_status_published_at_idx`(`status`, `published_at`),
    INDEX `workflow_versions_created_by_id_idx`(`created_by_id`),
    INDEX `workflow_versions_published_by_id_idx`(`published_by_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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

    UNIQUE INDEX `workflow_nodes_workflow_version_id_node_key_key`(`workflow_version_id`, `node_key`),
    INDEX `workflow_nodes_workflow_version_id_type_idx`(`workflow_version_id`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `workflow_condition_groups` (
    `id` CHAR(36) NOT NULL,
    `workflow_version_id` CHAR(36) NOT NULL,
    `logic_operator` ENUM('AND', 'OR') NOT NULL,
    `description` TEXT NULL,

    INDEX `workflow_condition_groups_workflow_version_id_idx`(`workflow_version_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `workflow_conditions` (
    `id` CHAR(36) NOT NULL,
    `condition_group_id` CHAR(36) NOT NULL,
    `field` VARCHAR(100) NOT NULL,
    `operator` ENUM('EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'LESS_THAN', 'GREATER_THAN_OR_EQUAL', 'LESS_THAN_OR_EQUAL', 'CONTAINS', 'NOT_CONTAINS', 'IS_EMPTY', 'IS_NOT_EMPTY', 'IN', 'NOT_IN', 'IS_OVERDUE', 'DUE_WITHIN') NOT NULL,
    `value_json` JSON NULL,
    `sequence` INTEGER NOT NULL,
    `description` TEXT NULL,

    UNIQUE INDEX `workflow_conditions_condition_group_id_sequence_key`(`condition_group_id`, `sequence`),
    INDEX `workflow_conditions_condition_group_id_sequence_idx`(`condition_group_id`, `sequence`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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
    `context_json` JSON NOT NULL,

    INDEX `workflow_instances_workflow_definition_id_status_idx`(`workflow_definition_id`, `status`),
    INDEX `workflow_instances_workflow_version_id_status_idx`(`workflow_version_id`, `status`),
    INDEX `workflow_instances_process_type_status_idx`(`process_type`, `status`),
    INDEX `workflow_instances_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    INDEX `workflow_instances_current_node_id_status_idx`(`current_node_id`, `status`),
    INDEX `workflow_instances_started_by_id_idx`(`started_by_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `workflow_tasks` (
    `id` CHAR(36) NOT NULL,
    `workflow_instance_id` CHAR(36) NOT NULL,
    `node_id` CHAR(36) NOT NULL,
    `assigned_user_id` CHAR(36) NULL,
    `assigned_role_id` CHAR(36) NULL,
    `assigned_area_id` CHAR(36) NULL,
    `status` ENUM('PENDING', 'IN_PROGRESS', 'APPROVED', 'REJECTED', 'OBSERVED', 'CORRECTION_REQUESTED', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    `due_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `decision` VARCHAR(100) NULL,
    `comments` LONGTEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `workflow_tasks_assigned_user_id_status_due_at_idx`(`assigned_user_id`, `status`, `due_at`),
    INDEX `workflow_tasks_assigned_role_id_status_idx`(`assigned_role_id`, `status`),
    INDEX `workflow_tasks_assigned_area_id_status_idx`(`assigned_area_id`, `status`),
    INDEX `workflow_tasks_workflow_instance_id_status_idx`(`workflow_instance_id`, `status`),
    INDEX `workflow_tasks_node_id_idx`(`node_id`),
    INDEX `workflow_tasks_status_due_at_idx`(`status`, `due_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `workflow_transition_logs` (
    `id` CHAR(36) NOT NULL,
    `workflow_instance_id` CHAR(36) NOT NULL,
    `source_node_id` CHAR(36) NULL,
    `target_node_id` CHAR(36) NULL,
    `trigger_type` VARCHAR(64) NOT NULL,
    `performed_by_id` CHAR(36) NULL,
    `decision` VARCHAR(100) NULL,
    `context_snapshot_json` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `workflow_transition_logs_workflow_instance_id_created_at_idx`(`workflow_instance_id`, `created_at`),
    INDEX `workflow_transition_logs_source_node_id_idx`(`source_node_id`),
    INDEX `workflow_transition_logs_target_node_id_idx`(`target_node_id`),
    INDEX `workflow_transition_logs_performed_by_id_idx`(`performed_by_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `workflow_timers_status_execute_at_idx`(`status`, `execute_at`),
    INDEX `workflow_timers_workflow_instance_id_status_idx`(`workflow_instance_id`, `status`),
    INDEX `workflow_timers_workflow_task_id_status_idx`(`workflow_task_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `workflow_definitions`
  ADD CONSTRAINT `workflow_definitions_created_by_id_fkey`
    FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `workflow_definitions_active_version_id_fkey`
    FOREIGN KEY (`active_version_id`) REFERENCES `workflow_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `workflow_versions`
  ADD CONSTRAINT `workflow_versions_workflow_definition_id_fkey`
    FOREIGN KEY (`workflow_definition_id`) REFERENCES `workflow_definitions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `workflow_versions_created_by_id_fkey`
    FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `workflow_versions_published_by_id_fkey`
    FOREIGN KEY (`published_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `workflow_nodes`
  ADD CONSTRAINT `workflow_nodes_workflow_version_id_fkey`
    FOREIGN KEY (`workflow_version_id`) REFERENCES `workflow_versions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `workflow_condition_groups`
  ADD CONSTRAINT `workflow_condition_groups_workflow_version_id_fkey`
    FOREIGN KEY (`workflow_version_id`) REFERENCES `workflow_versions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `workflow_conditions`
  ADD CONSTRAINT `workflow_conditions_condition_group_id_fkey`
    FOREIGN KEY (`condition_group_id`) REFERENCES `workflow_condition_groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `workflow_transitions`
  ADD CONSTRAINT `workflow_transitions_workflow_version_id_fkey`
    FOREIGN KEY (`workflow_version_id`) REFERENCES `workflow_versions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `workflow_transitions_source_node_id_fkey`
    FOREIGN KEY (`source_node_id`) REFERENCES `workflow_nodes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `workflow_transitions_target_node_id_fkey`
    FOREIGN KEY (`target_node_id`) REFERENCES `workflow_nodes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `workflow_transitions_condition_group_id_fkey`
    FOREIGN KEY (`condition_group_id`) REFERENCES `workflow_condition_groups`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `workflow_instances`
  ADD CONSTRAINT `workflow_instances_workflow_definition_id_fkey`
    FOREIGN KEY (`workflow_definition_id`) REFERENCES `workflow_definitions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `workflow_instances_workflow_version_id_fkey`
    FOREIGN KEY (`workflow_version_id`) REFERENCES `workflow_versions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `workflow_instances_current_node_id_fkey`
    FOREIGN KEY (`current_node_id`) REFERENCES `workflow_nodes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `workflow_instances_started_by_id_fkey`
    FOREIGN KEY (`started_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `workflow_tasks`
  ADD CONSTRAINT `workflow_tasks_workflow_instance_id_fkey`
    FOREIGN KEY (`workflow_instance_id`) REFERENCES `workflow_instances`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `workflow_tasks_node_id_fkey`
    FOREIGN KEY (`node_id`) REFERENCES `workflow_nodes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `workflow_tasks_assigned_user_id_fkey`
    FOREIGN KEY (`assigned_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `workflow_tasks_assigned_role_id_fkey`
    FOREIGN KEY (`assigned_role_id`) REFERENCES `roles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `workflow_tasks_assigned_area_id_fkey`
    FOREIGN KEY (`assigned_area_id`) REFERENCES `areas`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `workflow_transition_logs`
  ADD CONSTRAINT `workflow_transition_logs_workflow_instance_id_fkey`
    FOREIGN KEY (`workflow_instance_id`) REFERENCES `workflow_instances`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `workflow_transition_logs_source_node_id_fkey`
    FOREIGN KEY (`source_node_id`) REFERENCES `workflow_nodes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `workflow_transition_logs_target_node_id_fkey`
    FOREIGN KEY (`target_node_id`) REFERENCES `workflow_nodes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `workflow_transition_logs_performed_by_id_fkey`
    FOREIGN KEY (`performed_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `workflow_timers`
  ADD CONSTRAINT `workflow_timers_workflow_instance_id_fkey`
    FOREIGN KEY (`workflow_instance_id`) REFERENCES `workflow_instances`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `workflow_timers_workflow_task_id_fkey`
    FOREIGN KEY (`workflow_task_id`) REFERENCES `workflow_tasks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
