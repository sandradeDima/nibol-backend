ALTER TABLE `risk_levels`
  ADD COLUMN `key` VARCHAR(100) NULL AFTER `name`,
  ADD COLUMN `description` VARCHAR(500) NULL AFTER `key`,
  MODIFY `color_token` VARCHAR(64) NULL,
  CHANGE `sort_order` `severity_order` INTEGER NOT NULL;

UPDATE `risk_levels`
SET
  `key` = CASE
    WHEN `name` = 'Crítico' THEN 'CRITICO'
    WHEN `name` = 'Alto' THEN 'ALTO'
    WHEN `name` = 'Medio' THEN 'MEDIO'
    WHEN `name` = 'Bajo' THEN 'BAJO'
    ELSE UPPER(REPLACE(`name`, ' ', '_'))
  END,
  `description` = CASE
    WHEN `name` = 'Crítico' THEN 'Observaciones con impacto severo y atención inmediata.'
    WHEN `name` = 'Alto' THEN 'Observaciones de alta prioridad con impacto material.'
    WHEN `name` = 'Medio' THEN 'Observaciones relevantes con seguimiento programado.'
    WHEN `name` = 'Bajo' THEN 'Observaciones de menor criticidad y ejecución gradual.'
    ELSE `description`
  END,
  `severity_order` = CASE
    WHEN `name` = 'Crítico' THEN 1
    WHEN `name` = 'Alto' THEN 2
    WHEN `name` = 'Medio' THEN 3
    WHEN `name` = 'Bajo' THEN 4
    ELSE `severity_order`
  END,
  `default_deadline_days` = CASE
    WHEN `name` = 'Medio' THEN 60
    WHEN `name` = 'Bajo' THEN 90
    WHEN `name` = 'Crítico' THEN 15
    WHEN `name` = 'Alto' THEN 30
    ELSE `default_deadline_days`
  END,
  `color_token` = CASE
    WHEN `name` = 'Crítico' THEN COALESCE(`color_token`, 'critical')
    WHEN `name` = 'Alto' THEN COALESCE(`color_token`, 'high')
    WHEN `name` = 'Medio' THEN COALESCE(`color_token`, 'medium')
    WHEN `name` = 'Bajo' THEN COALESCE(`color_token`, 'low')
    ELSE `color_token`
  END;

ALTER TABLE `risk_levels`
  MODIFY `key` VARCHAR(100) NOT NULL,
  MODIFY `severity_order` INTEGER NOT NULL;

DROP INDEX `risk_levels_sort_order_idx` ON `risk_levels`;
CREATE UNIQUE INDEX `risk_levels_key_key` ON `risk_levels`(`key`);
CREATE INDEX `risk_levels_severity_order_idx` ON `risk_levels`(`severity_order`);

ALTER TABLE `observation_statuses`
  ADD COLUMN `description` VARCHAR(500) NULL AFTER `key`,
  ADD COLUMN `is_initial` BOOLEAN NOT NULL DEFAULT false AFTER `sort_order`,
  ADD COLUMN `is_final` BOOLEAN NOT NULL DEFAULT false AFTER `is_initial`,
  ADD COLUMN `counts_as_overdue` BOOLEAN NOT NULL DEFAULT false AFTER `is_final`;

UPDATE `observation_statuses`
SET
  `key` = CASE
    WHEN `key` = 'pending' THEN 'PENDIENTE'
    WHEN `key` = 'in_progress' THEN 'EN_PROCESO'
    WHEN `key` = 'in_review' THEN 'EN_REVISION'
    WHEN `key` = 'closed' THEN 'CERRADA'
    WHEN `key` = 'overdue' THEN 'VENCIDA'
    WHEN `key` = 'rejected' THEN 'RECHAZADA'
    ELSE UPPER(REPLACE(`key`, ' ', '_'))
  END,
  `description` = CASE
    WHEN `name` = 'Pendiente' THEN 'Estado inicial para observaciones recién registradas.'
    WHEN `name` = 'En proceso' THEN 'La observación está siendo atendida por el área responsable.'
    WHEN `name` = 'En revisión' THEN 'La observación cuenta con evidencia en revisión.'
    WHEN `name` = 'Cerrada' THEN 'La observación fue cerrada y validada.'
    WHEN `name` = 'Vencida' THEN 'La observación excedió la fecha límite comprometida.'
    WHEN `name` = 'Rechazada' THEN 'La remediación fue rechazada y requiere ajustes.'
    ELSE `description`
  END,
  `is_initial` = CASE WHEN `name` = 'Pendiente' THEN true ELSE false END,
  `is_final` = CASE
    WHEN `name` IN ('Cerrada', 'Rechazada') THEN true
    ELSE false
  END,
  `counts_as_overdue` = CASE WHEN `name` = 'Vencida' THEN true ELSE false END;

ALTER TABLE `areas`
  ADD COLUMN `code` VARCHAR(100) NULL AFTER `name`,
  ADD COLUMN `description` VARCHAR(500) NULL AFTER `code`;

UPDATE `areas`
SET
  `code` = CASE
    WHEN `name` = 'Tecnología de la Información' THEN 'TI'
    WHEN `name` = 'Operaciones' THEN 'OPER'
    WHEN `name` = 'Finanzas' THEN 'FIN'
    WHEN `name` = 'Comercial' THEN 'COM'
    WHEN `name` = 'Almacenes y Logística' THEN 'ALM'
    ELSE `code`
  END,
  `description` = CASE
    WHEN `name` = 'Tecnología de la Información' THEN 'Gobierno y operación de plataformas, accesos e infraestructura.'
    WHEN `name` = 'Operaciones' THEN 'Ejecución operativa, control diario y continuidad del servicio.'
    WHEN `name` = 'Finanzas' THEN 'Tesorería, conciliaciones y control financiero.'
    WHEN `name` = 'Comercial' THEN 'Gestión comercial, descuentos y relación con clientes.'
    WHEN `name` = 'Almacenes y Logística' THEN 'Inventarios, almacenes y logística de distribución.'
    ELSE `description`
  END;

CREATE UNIQUE INDEX `areas_code_key` ON `areas`(`code`);

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

  UNIQUE INDEX `catalogs_type_key_key`(`type`, `key`),
  INDEX `catalogs_active_deleted_at_idx`(`active`, `deleted_at`),
  INDEX `catalogs_deleted_at_idx`(`deleted_at`),
  INDEX `catalogs_type_sort_order_idx`(`type`, `sort_order`),
  INDEX `catalogs_type_active_deleted_at_idx`(`type`, `active`, `deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `observations`
  ADD COLUMN `observation_type` VARCHAR(191) NULL AFTER `detected_at`;
