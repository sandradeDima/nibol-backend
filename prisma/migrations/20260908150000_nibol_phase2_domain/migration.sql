EXEC sp_rename N'dbo.risk_levels.default_deadline_days', N'max_remediation_days', N'COLUMN';
ALTER TABLE [dbo].[risk_levels] ALTER COLUMN [max_remediation_days] INT NULL;

ALTER TABLE [dbo].[observations]
  ADD [deleted_observation_number] INT NULL,
      [sent_at] DATETIME2 NULL;
ALTER TABLE [dbo].[observations] ALTER COLUMN [auditor_user_id] CHAR(36) NULL;

CREATE TABLE [dbo].[deadline_extension_classifications] (
  [id] CHAR(36) NOT NULL,
  [code] NVARCHAR(64) NOT NULL,
  [name] NVARCHAR(191) NOT NULL,
  [description] NVARCHAR(500) NOT NULL,
  [max_additional_days] INT NOT NULL,
  [active] BIT NOT NULL CONSTRAINT [deadline_extension_classifications_active_df] DEFAULT 1,
  [created_at] DATETIME2 NOT NULL CONSTRAINT [deadline_extension_classifications_created_at_df] DEFAULT CURRENT_TIMESTAMP,
  [updated_at] DATETIME2 NOT NULL,
  CONSTRAINT [deadline_extension_classifications_pkey] PRIMARY KEY CLUSTERED ([id]),
  CONSTRAINT [deadline_extension_classifications_code_key] UNIQUE NONCLUSTERED ([code]),
  CONSTRAINT [deadline_extension_classifications_name_key] UNIQUE NONCLUSTERED ([name])
);
CREATE NONCLUSTERED INDEX [deadline_extension_classifications_active_idx] ON [dbo].[deadline_extension_classifications]([active]);

ALTER TABLE [dbo].[deadline_extension_requests]
  ADD [classification_id] CHAR(36) NULL,
      [max_additional_days] INT NULL,
      [max_allowed_date] DATE NULL;

UPDATE [dbo].[deadline_extension_requests]
SET [status] = CASE [status]
  WHEN 'SENT_TO_AUDIT' THEN 'SENT_TO_MANAGER'
  WHEN 'AUDIT_APPROVED' THEN 'MANAGER_APPROVED'
  WHEN 'AUDIT_REJECTED' THEN 'MANAGER_REJECTED'
  ELSE [status]
END;

ALTER TABLE [dbo].[deadline_extension_requests] DROP CONSTRAINT [deadline_extension_requests_audit_reviewer_id_fkey];
DROP INDEX [deadline_extension_requests_audit_reviewer_id_idx] ON [dbo].[deadline_extension_requests];
ALTER TABLE [dbo].[deadline_extension_requests]
  DROP COLUMN [audit_reviewer_id],
              [audit_reviewed_at],
              [audit_comment];
ALTER TABLE [dbo].[deadline_extension_requests] ALTER COLUMN [status] NVARCHAR(64) NOT NULL;

UPDATE [dbo].[progress_evaluations] SET [type] = 'ADVANCE' WHERE [type] = 'CORRECTION';
UPDATE [dbo].[progress_evaluations] SET [review_status] = 'RETURNED' WHERE [review_status] = 'REJECTED';
UPDATE [dbo].[progress_review_history] SET [action] = 'RETURNED' WHERE [action] = 'REJECTED';
UPDATE [dbo].[progress_review_history] SET [from_status] = 'RETURNED' WHERE [from_status] = 'REJECTED';
UPDATE [dbo].[progress_review_history] SET [to_status] = 'RETURNED' WHERE [to_status] = 'REJECTED';

ALTER TABLE [dbo].[progress_evaluations]
  ALTER COLUMN [type] NVARCHAR(64) NOT NULL;
ALTER TABLE [dbo].[progress_evaluations]
  ALTER COLUMN [review_status] NVARCHAR(64) NOT NULL;
ALTER TABLE [dbo].[progress_review_history]
  ALTER COLUMN [action] NVARCHAR(64) NOT NULL;
ALTER TABLE [dbo].[progress_review_history]
  ALTER COLUMN [from_status] NVARCHAR(64) NULL;
ALTER TABLE [dbo].[progress_review_history]
  ALTER COLUMN [to_status] NVARCHAR(64) NOT NULL;

EXEC sp_rename N'dbo.progress_evaluations.progress_percent', N'reported_progress_percent', N'COLUMN';
ALTER TABLE [dbo].[progress_evaluations] ALTER COLUMN [reported_progress_percent] INT NULL;
ALTER TABLE [dbo].[progress_evaluations]
  ADD [evaluated_status] NVARCHAR(64) NULL;
ALTER TABLE [dbo].[progress_evaluations] DROP COLUMN [action_plan_status];

CREATE UNIQUE NONCLUSTERED INDEX [deadline_extension_one_per_action_plan_key] ON [dbo].[deadline_extension_requests]([action_plan_id]) WHERE ([action_plan_id] IS NOT NULL);
CREATE NONCLUSTERED INDEX [deadline_extension_requests_classification_id_idx] ON [dbo].[deadline_extension_requests]([classification_id]);
ALTER TABLE [dbo].[deadline_extension_requests] ADD CONSTRAINT [deadline_extension_requests_classification_id_fkey] FOREIGN KEY ([classification_id]) REFERENCES [dbo].[deadline_extension_classifications]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
