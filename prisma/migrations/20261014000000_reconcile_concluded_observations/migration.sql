UPDATE [dbo].[action_plans]
SET [progress_percent] = 100,
    [updated_at] = SYSUTCDATETIME()
WHERE [deleted_at] IS NULL
  AND [status] = 'CONCLUDED'
  AND [progress_percent] <> 100;

UPDATE observation
SET [status_id] = concluded.[id],
    [progress_percent] = 100,
    [updated_at] = SYSUTCDATETIME()
FROM [dbo].[observations] AS observation
INNER JOIN [dbo].[observation_statuses] AS concluded
  ON concluded.[key] = 'CONCLUIDO'
  AND concluded.[active] = 1
  AND concluded.[deleted_at] IS NULL
WHERE observation.[deleted_at] IS NULL
  AND (observation.[status_id] <> concluded.[id] OR observation.[progress_percent] <> 100)
  AND EXISTS (
    SELECT 1 FROM [dbo].[action_plans] AS action_plan
    WHERE action_plan.[observation_id] = observation.[id]
      AND action_plan.[deleted_at] IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM [dbo].[action_plans] AS action_plan
    WHERE action_plan.[observation_id] = observation.[id]
      AND action_plan.[deleted_at] IS NULL
      AND action_plan.[status] <> 'CONCLUDED'
  );
