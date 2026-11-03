;WITH Candidate AS (
  SELECT role.[id] AS [role_id], permission.[id] AS [permission_id]
  FROM [dbo].[roles] AS role
  INNER JOIN [dbo].[permissions] AS permission
    ON permission.[name] = 'action_plans.evaluate'
   AND permission.[deleted_at] IS NULL
  WHERE role.[code] = 'PROCESS_OWNER'
    AND role.[deleted_at] IS NULL
)
INSERT INTO [dbo].[role_permissions] ([id], [role_id], [permission_id], [created_at], [updated_at])
SELECT CONVERT(CHAR(36), NEWID()), candidate.[role_id], candidate.[permission_id], SYSUTCDATETIME(), SYSUTCDATETIME()
FROM Candidate AS candidate
WHERE NOT EXISTS (
  SELECT 1
  FROM [dbo].[role_permissions] AS existing
  WHERE existing.[role_id] = candidate.[role_id]
    AND existing.[permission_id] = candidate.[permission_id]
);
