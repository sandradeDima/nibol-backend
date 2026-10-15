UPDATE `observations` AS observation
JOIN (
  SELECT
    plan.`observation_id`,
    ROUND(AVG(plan.`progress_percent`)) AS `progress_percent`,
    CASE
      WHEN SUM(plan.`status` <> 'NOT_STARTED') = 0 THEN 'NO_INICIADO'
      WHEN SUM(plan.`status` <> 'CONCLUDED') = 0 THEN 'CONCLUIDO'
      WHEN SUM(
        plan.`progress_percent` > 0
        OR plan.`status` IN ('WITH_PROGRESS', 'CONCLUDED')
      ) > 0 THEN 'CON_AVANCE'
      ELSE 'INICIADO'
    END AS `progress_status`
  FROM `action_plans` AS plan
  WHERE plan.`deleted_at` IS NULL
  GROUP BY plan.`observation_id`
) AS progress ON progress.`observation_id` = observation.`id`
JOIN `observation_statuses` AS target_status
  ON target_status.`key` = progress.`progress_status`
  AND target_status.`active` = true
  AND target_status.`deleted_at` IS NULL
SET observation.`status_id` = target_status.`id`,
    observation.`progress_percent` = progress.`progress_percent`,
    observation.`updated_at` = CURRENT_TIMESTAMP(3)
WHERE observation.`deleted_at` IS NULL
  AND (
    observation.`status_id` <> target_status.`id`
    OR observation.`progress_percent` <> progress.`progress_percent`
  );
