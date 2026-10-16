UPDATE observation
SET [status_id] = target_status.[id],
    [progress_percent] = progress.[progress_percent],
    [updated_at] = SYSUTCDATETIME()
FROM [dbo].[observations] AS observation
INNER JOIN (
  SELECT
    action_plan.[observation_id],
    ROUND(AVG(CONVERT(DECIMAL(10, 2), action_plan.[progress_percent])), 0) AS [progress_percent],
    CASE
      WHEN SUM(CASE WHEN action_plan.[status] <> 'NOT_STARTED' THEN 1 ELSE 0 END) = 0 THEN 'NO_INICIADO'
      WHEN SUM(CASE WHEN action_plan.[status] <> 'CONCLUDED' THEN 1 ELSE 0 END) = 0 THEN 'CONCLUIDO'
      WHEN SUM(CASE
        WHEN action_plan.[progress_percent] > 0
          OR action_plan.[status] IN ('WITH_PROGRESS', 'CONCLUDED')
        THEN 1 ELSE 0 END) > 0 THEN 'CON_AVANCE'
      ELSE 'INICIADO'
    END AS [progress_status]
  FROM [dbo].[action_plans] AS action_plan
  WHERE action_plan.[deleted_at] IS NULL
  GROUP BY action_plan.[observation_id]
) AS progress ON progress.[observation_id] = observation.[id]
INNER JOIN [dbo].[observation_statuses] AS target_status
  ON target_status.[key] = progress.[progress_status]
  AND target_status.[active] = 1
  AND target_status.[deleted_at] IS NULL
WHERE observation.[deleted_at] IS NULL
  AND (
    observation.[status_id] <> target_status.[id]
    OR observation.[progress_percent] <> progress.[progress_percent]
  );
