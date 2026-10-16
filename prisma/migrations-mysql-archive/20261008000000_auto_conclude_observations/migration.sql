UPDATE `observations` AS observation
JOIN `observation_statuses` AS concluded
  ON concluded.`key` = 'CONCLUIDO'
  AND concluded.`active` = true
  AND concluded.`deleted_at` IS NULL
SET observation.`status_id` = concluded.`id`,
    observation.`progress_percent` = 100,
    observation.`updated_at` = CURRENT_TIMESTAMP(3)
WHERE observation.`deleted_at` IS NULL
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
