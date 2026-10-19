;WITH StandardRoleModulePermissions AS (
  SELECT DISTINCT
    role_permission.[role_id],
    module_permission.[id] AS [permission_id]
  FROM [dbo].[role_permissions] AS role_permission
  INNER JOIN [dbo].[roles] AS role
    ON role.[id] = role_permission.[role_id]
  INNER JOIN [dbo].[permissions] AS resource_permission
    ON resource_permission.[id] = role_permission.[permission_id]
  INNER JOIN [dbo].[permissions] AS module_permission
    ON module_permission.[name] = CONCAT(
      LEFT(resource_permission.[name], LEN(resource_permission.[name]) - LEN('.view')),
      '.view_module'
    )
   AND module_permission.[deleted_at] IS NULL
  WHERE role.[code] IN (
    'AUDITOR',
    'PROCESS_OWNER',
    'AREA_RESPONSIBLE',
    'EXECUTOR'
  )
    AND RIGHT(resource_permission.[name], LEN('.view')) = '.view'
    AND resource_permission.[name] <> 'activity.view'
    AND resource_permission.[deleted_at] IS NULL
)
INSERT INTO [dbo].[role_permissions] ([id], [role_id], [permission_id], [created_at], [updated_at])
SELECT CONVERT(CHAR(36), NEWID()), candidate.[role_id], candidate.[permission_id], SYSUTCDATETIME(), SYSUTCDATETIME()
FROM StandardRoleModulePermissions AS candidate
WHERE NOT EXISTS (
  SELECT 1
  FROM [dbo].[role_permissions] AS existing
  WHERE existing.[role_id] = candidate.[role_id]
    AND existing.[permission_id] = candidate.[permission_id]
);

;WITH ModuleViewPermissions AS (
  SELECT DISTINCT
    role_permission.[role_id],
    view_permission.[id] AS [permission_id]
  FROM [dbo].[role_permissions] AS role_permission
  INNER JOIN [dbo].[permissions] AS module_permission
    ON module_permission.[id] = role_permission.[permission_id]
  INNER JOIN [dbo].[permissions] AS view_permission
    ON view_permission.[name] = CONCAT(
      LEFT(module_permission.[name], LEN(module_permission.[name]) - LEN('.view_module')),
      '.view'
    )
   AND view_permission.[deleted_at] IS NULL
  WHERE RIGHT(module_permission.[name], LEN('.view_module')) = '.view_module'
    AND module_permission.[deleted_at] IS NULL
)
INSERT INTO [dbo].[role_permissions] ([id], [role_id], [permission_id], [created_at], [updated_at])
SELECT CONVERT(CHAR(36), NEWID()), candidate.[role_id], candidate.[permission_id], SYSUTCDATETIME(), SYSUTCDATETIME()
FROM ModuleViewPermissions AS candidate
WHERE NOT EXISTS (
  SELECT 1
  FROM [dbo].[role_permissions] AS existing
  WHERE existing.[role_id] = candidate.[role_id]
    AND existing.[permission_id] = candidate.[permission_id]
);

DELETE role_permission
FROM [dbo].[role_permissions] AS role_permission
INNER JOIN [dbo].[roles] AS role
  ON role.[id] = role_permission.[role_id]
INNER JOIN [dbo].[permissions] AS permission
  ON permission.[id] = role_permission.[permission_id]
WHERE role.[code] <> 'SYSTEM_ADMIN'
  AND permission.[name] LIKE 'activity.%'
  AND NOT EXISTS (
    SELECT 1
    FROM [dbo].[role_permissions] AS module_role_permission
    INNER JOIN [dbo].[permissions] AS module_permission
      ON module_permission.[id] = module_role_permission.[permission_id]
    WHERE module_role_permission.[role_id] = role_permission.[role_id]
      AND module_permission.[name] = 'activity.view_module'
      AND module_permission.[deleted_at] IS NULL
  );
