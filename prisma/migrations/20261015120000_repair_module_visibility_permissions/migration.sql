UPDATE module_permission
SET [deleted_at] = NULL,
    [updated_at] = SYSUTCDATETIME()
FROM [dbo].[permissions] AS module_permission
INNER JOIN [dbo].[permissions] AS resource
  ON module_permission.[name] = CONCAT(LEFT(resource.[name], LEN(resource.[name]) - LEN('.view')), '.view_module')
WHERE RIGHT(resource.[name], LEN('.view')) = '.view'
  AND resource.[deleted_at] IS NULL
  AND module_permission.[deleted_at] IS NOT NULL;

UPDATE module_permission
SET [deleted_at] = NULL,
    [updated_at] = SYSUTCDATETIME()
FROM [dbo].[permissions] AS module_permission
INNER JOIN [dbo].[permissions] AS malformed
  ON module_permission.[name] = CONCAT(LEFT(malformed.[name], LEN(malformed.[name]) - LEN('.view.view_module')), '.view_module')
WHERE RIGHT(malformed.[name], LEN('.view.view_module')) = '.view.view_module'
  AND malformed.[deleted_at] IS NULL
  AND module_permission.[deleted_at] IS NOT NULL;

INSERT INTO [dbo].[permissions] ([id], [name], [description], [created_at], [updated_at], [deleted_at])
SELECT CONVERT(CHAR(36), NEWID()), candidate.[name], N'Permission to view a module.', SYSUTCDATETIME(), SYSUTCDATETIME(), NULL
FROM (
  SELECT CONCAT(LEFT(resource.[name], LEN(resource.[name]) - LEN('.view')), '.view_module') AS [name]
  FROM [dbo].[permissions] AS resource
  WHERE RIGHT(resource.[name], LEN('.view')) = '.view'
    AND resource.[deleted_at] IS NULL
  UNION
  SELECT CONCAT(LEFT(malformed.[name], LEN(malformed.[name]) - LEN('.view.view_module')), '.view_module') AS [name]
  FROM [dbo].[permissions] AS malformed
  WHERE RIGHT(malformed.[name], LEN('.view.view_module')) = '.view.view_module'
    AND malformed.[deleted_at] IS NULL
) AS candidate
WHERE NOT EXISTS (
  SELECT 1 FROM [dbo].[permissions] AS existing
  WHERE existing.[name] = candidate.[name]
);

;WITH Candidates AS (
  SELECT DISTINCT role_permission.[role_id], module_permission.[id] AS [permission_id]
  FROM [dbo].[role_permissions] AS role_permission
  INNER JOIN [dbo].[permissions] AS malformed
    ON malformed.[id] = role_permission.[permission_id]
  INNER JOIN [dbo].[permissions] AS module_permission
    ON module_permission.[name] = CONCAT(LEFT(malformed.[name], LEN(malformed.[name]) - LEN('.view.view_module')), '.view_module')
   AND module_permission.[deleted_at] IS NULL
  WHERE RIGHT(malformed.[name], LEN('.view.view_module')) = '.view.view_module'
    AND malformed.[deleted_at] IS NULL
)
INSERT INTO [dbo].[role_permissions] ([id], [role_id], [permission_id], [created_at], [updated_at])
SELECT CONVERT(CHAR(36), NEWID()), candidate.[role_id], candidate.[permission_id], SYSUTCDATETIME(), SYSUTCDATETIME()
FROM Candidates AS candidate
WHERE NOT EXISTS (
  SELECT 1 FROM [dbo].[role_permissions] AS existing
  WHERE existing.[role_id] = candidate.[role_id]
    AND existing.[permission_id] = candidate.[permission_id]
);

DELETE role_permission
FROM [dbo].[role_permissions] AS role_permission
INNER JOIN [dbo].[permissions] AS malformed
  ON malformed.[id] = role_permission.[permission_id]
WHERE RIGHT(malformed.[name], LEN('.view.view_module')) = '.view.view_module'
  AND malformed.[deleted_at] IS NULL;

UPDATE [dbo].[permissions]
SET [deleted_at] = SYSUTCDATETIME(),
    [updated_at] = SYSUTCDATETIME()
WHERE RIGHT([name], LEN('.view.view_module')) = '.view.view_module'
  AND [deleted_at] IS NULL;
