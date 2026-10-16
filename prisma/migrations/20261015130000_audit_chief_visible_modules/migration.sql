DELETE role_permission
FROM [dbo].[role_permissions] AS role_permission
INNER JOIN [dbo].[roles] AS r
  ON r.[id] = role_permission.[role_id]
INNER JOIN [dbo].[permissions] AS p
  ON p.[id] = role_permission.[permission_id]
WHERE r.[code] = 'AUDIT_CHIEF'
  AND p.[name] LIKE '%.view_module'
  AND p.[name] NOT IN (
    'observations.view_module',
    'action_plans.view_module',
    'reports.view_module',
    'notifications.view_module'
  );

;WITH Candidates AS (
  SELECT DISTINCT r.[id] AS [role_id], p.[id] AS [permission_id]
  FROM [dbo].[roles] AS r
  INNER JOIN [dbo].[permissions] AS p
    ON p.[name] IN (
      'observations.view',
      'observations.view_module',
      'action_plans.view',
      'action_plans.view_module',
      'reports.view',
      'reports.view_module',
      'notifications.view',
      'notifications.view_module'
    )
   AND p.[deleted_at] IS NULL
  WHERE r.[code] = 'AUDIT_CHIEF'
    AND r.[deleted_at] IS NULL
)
INSERT INTO [dbo].[role_permissions] ([id], [role_id], [permission_id], [created_at], [updated_at])
SELECT CONVERT(CHAR(36), NEWID()), candidate.[role_id], candidate.[permission_id], SYSUTCDATETIME(), SYSUTCDATETIME()
FROM Candidates AS candidate
WHERE NOT EXISTS (
  SELECT 1 FROM [dbo].[role_permissions] AS existing
  WHERE existing.[role_id] = candidate.[role_id]
    AND existing.[permission_id] = candidate.[permission_id]
);
