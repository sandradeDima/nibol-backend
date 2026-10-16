UPDATE `action_plans`
SET `progress_percent` = 100,
    `updated_at` = CURRENT_TIMESTAMP(3)
WHERE `deleted_at` IS NULL
  AND `status` = 'CONCLUDED'
  AND `progress_percent` <> 100;

UPDATE `observations` AS observation
JOIN `observation_statuses` AS concluded
  ON concluded.`key` = 'CONCLUIDO'
  AND concluded.`active` = true
  AND concluded.`deleted_at` IS NULL
SET observation.`status_id` = concluded.`id`,
    observation.`progress_percent` = 100,
    observation.`updated_at` = CURRENT_TIMESTAMP(3)
WHERE observation.`deleted_at` IS NULL
  AND (observation.`status_id` <> concluded.`id` OR observation.`progress_percent` <> 100)
  AND EXISTS (
    SELECT 1 FROM `action_plans` AS plan
    WHERE plan.`observation_id` = observation.`id`
      AND plan.`deleted_at` IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM `action_plans` AS plan
    WHERE plan.`observation_id` = observation.`id`
      AND plan.`deleted_at` IS NULL
      AND plan.`status` <> 'CONCLUDED'
  );
