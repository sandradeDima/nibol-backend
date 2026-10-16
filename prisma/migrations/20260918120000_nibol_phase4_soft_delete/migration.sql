ALTER TABLE [dbo].[observations] ADD [deleted_by_id] CHAR(36) NULL;
CREATE NONCLUSTERED INDEX [observations_deleted_by_id_idx] ON [dbo].[observations]([deleted_by_id]);
ALTER TABLE [dbo].[observations] ADD CONSTRAINT [observations_deleted_by_id_fkey] FOREIGN KEY ([deleted_by_id]) REFERENCES [dbo].[users]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE [dbo].[remediation_plans] ADD [deleted_by_id] CHAR(36) NULL;
CREATE NONCLUSTERED INDEX [remediation_plans_deleted_by_id_idx] ON [dbo].[remediation_plans]([deleted_by_id]);
ALTER TABLE [dbo].[remediation_plans] ADD CONSTRAINT [remediation_plans_deleted_by_id_fkey] FOREIGN KEY ([deleted_by_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[action_plans] ADD [deleted_by_id] CHAR(36) NULL;
CREATE NONCLUSTERED INDEX [action_plans_deleted_by_id_idx] ON [dbo].[action_plans]([deleted_by_id]);
ALTER TABLE [dbo].[action_plans] ADD CONSTRAINT [action_plans_deleted_by_id_fkey] FOREIGN KEY ([deleted_by_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
