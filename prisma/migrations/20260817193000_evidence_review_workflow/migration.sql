ALTER TABLE [dbo].[evidence_files]
  ADD [review_status] NVARCHAR(64) NOT NULL CONSTRAINT [evidence_files_review_status_df] DEFAULT 'DRAFT',
      [submitted_at] DATETIME2 NULL,
      [reviewed_at] DATETIME2 NULL,
      [reviewed_by_user_id] CHAR(36) NULL,
      [review_comment] NVARCHAR(MAX) NULL,
      [workflow_instance_id] CHAR(36) NULL;

CREATE NONCLUSTERED INDEX [evidence_files_review_status_idx] ON [dbo].[evidence_files]([review_status]);
CREATE NONCLUSTERED INDEX [evidence_files_workflow_instance_id_idx] ON [dbo].[evidence_files]([workflow_instance_id]);
