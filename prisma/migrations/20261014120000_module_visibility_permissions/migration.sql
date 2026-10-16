INSERT INTO [dbo].[permissions] ([id], [name], [description], [created_at], [updated_at], [deleted_at])
SELECT CONVERT(CHAR(36), NEWID()),
       CONCAT(resource.[name], '.view_module'),
       N'Permission to view a module.',
       SYSUTCDATETIME(),
       SYSUTCDATETIME(),
       NULL
FROM [dbo].[permissions] AS resource
WHERE RIGHT(resource.[name], LEN('.view')) = '.view'
  AND LEN(resource.[name]) > LEN('.view')
  AND resource.[name] NOT LIKE '%[^a-z0-9_.]%'
  AND resource.[deleted_at] IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM [dbo].[permissions] AS existing
    WHERE existing.[name] = CONCAT(LEFT(resource.[name], LEN(resource.[name]) - LEN('.view')), '.view_module')
  );
