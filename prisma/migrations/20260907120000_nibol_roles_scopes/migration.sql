ALTER TABLE [dbo].[roles] ADD [code] NVARCHAR(64) NULL;

-- Defer binding the new code column until after ALTER TABLE has run.
EXEC sys.sp_executesql N'
UPDATE [dbo].[roles]
SET [code] = CASE
    WHEN [name] IN (N''Admin'', N''Administrador del sistema'') THEN ''SYSTEM_ADMIN''
    WHEN [name] IN (N''Auditoría'', N''Auditor'') THEN ''AUDITOR''
    WHEN [name] IN (N''Non Admin'', N''Ejecutor'') THEN ''EXECUTOR''
    WHEN [name] = N''Dueño del proceso'' THEN ''PROCESS_OWNER''
    WHEN [name] = N''Responsable de área'' THEN ''AREA_RESPONSIBLE''
    ELSE CONCAT(''LEGACY_'', [id])
END
WHERE [code] IS NULL;

UPDATE [dbo].[roles] SET [name] = N''Administrador del sistema'' WHERE [code] = ''SYSTEM_ADMIN'';
UPDATE [dbo].[roles] SET [name] = N''Auditor'' WHERE [code] = ''AUDITOR'';
UPDATE [dbo].[roles] SET [name] = N''Ejecutor'' WHERE [code] = ''EXECUTOR'';

';

ALTER TABLE [dbo].[roles] ALTER COLUMN [code] NVARCHAR(64) NOT NULL;
CREATE UNIQUE NONCLUSTERED INDEX [roles_code_key] ON [dbo].[roles]([code]);

DELETE duplicate_role
FROM [dbo].[user_roles] AS duplicate_role
INNER JOIN [dbo].[user_roles] AS kept_role
  ON kept_role.[user_id] = duplicate_role.[user_id]
 AND kept_role.[id] < duplicate_role.[id];

CREATE UNIQUE NONCLUSTERED INDEX [user_roles_user_id_key] ON [dbo].[user_roles]([user_id]);
