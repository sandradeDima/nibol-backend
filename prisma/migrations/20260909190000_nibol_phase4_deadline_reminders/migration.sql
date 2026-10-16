ALTER TABLE [dbo].[notification_deliveries] ADD [payload_json] NVARCHAR(MAX) NULL;

ALTER TABLE [dbo].[scheduled_job_executions]
  ADD [run_type] NVARCHAR(16) NULL,
      [cadence_key] NVARCHAR(32) NULL,
      [period_key] NVARCHAR(16) NULL,
      [dedupe_key] NVARCHAR(255) NULL,
      [scheduled_for] DATETIME2 NULL;

EXEC sys.sp_executesql N'CREATE UNIQUE NONCLUSTERED INDEX [scheduled_job_executions_dedupe_key_key] ON [dbo].[scheduled_job_executions]([dedupe_key]) WHERE ([dedupe_key] IS NOT NULL);';
CREATE NONCLUSTERED INDEX [scheduled_job_executions_job_name_cadence_key_period_key_idx] ON [dbo].[scheduled_job_executions]([job_name], [cadence_key], [period_key]);
