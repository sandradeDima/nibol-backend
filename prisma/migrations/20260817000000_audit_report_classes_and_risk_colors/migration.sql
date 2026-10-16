-- CreateTable
CREATE TABLE [dbo].[audit_report_classes] (
    [id] CHAR(36) NOT NULL,
    [name] NVARCHAR(191) NOT NULL,
    [description] NVARCHAR(500),
    [active] BIT NOT NULL CONSTRAINT [audit_report_classes_active_df] DEFAULT 1,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [audit_report_classes_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    [deleted_at] DATETIME2,
    CONSTRAINT [audit_report_classes_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [audit_report_classes_name_key] UNIQUE NONCLUSTERED ([name])
);

CREATE NONCLUSTERED INDEX [audit_report_classes_active_deleted_at_idx] ON [dbo].[audit_report_classes]([active], [deleted_at]);
CREATE NONCLUSTERED INDEX [audit_report_classes_deleted_at_idx] ON [dbo].[audit_report_classes]([deleted_at]);

ALTER TABLE [dbo].[audit_reports] ADD [report_class_id] CHAR(36) NULL;
CREATE NONCLUSTERED INDEX [audit_reports_report_class_id_idx] ON [dbo].[audit_reports]([report_class_id]);
ALTER TABLE [dbo].[audit_reports] ADD CONSTRAINT [audit_reports_report_class_id_fkey] FOREIGN KEY ([report_class_id]) REFERENCES [dbo].[audit_report_classes]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;

UPDATE [dbo].[risk_levels]
SET [color_token] = CASE [color_token]
    WHEN 'critical' THEN '#B42318'
    WHEN 'high' THEN '#D92D20'
    WHEN 'medium' THEN '#DC6803'
    WHEN 'low' THEN '#027A48'
    ELSE [color_token]
END
WHERE [color_token] IN ('critical', 'high', 'medium', 'low');
