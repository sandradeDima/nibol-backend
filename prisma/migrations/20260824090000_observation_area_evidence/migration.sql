-- Add observation-area ownership to existing evidence.
ALTER TABLE [dbo].[evidence_files] ADD [observation_area_id] CHAR(36) NULL;

-- Defer binding the new column until after the ALTER TABLE statement.
EXEC sys.sp_executesql N'
UPDATE evidence
SET [observation_area_id] = action_plan.[observation_area_id]
FROM [dbo].[evidence_files] AS evidence
INNER JOIN [dbo].[action_plans] AS action_plan
    ON action_plan.[id] = evidence.[action_plan_id]
WHERE evidence.[action_plan_id] IS NOT NULL;
';

CREATE NONCLUSTERED INDEX [evidence_files_observation_area_id_idx] ON [dbo].[evidence_files]([observation_area_id]);
ALTER TABLE [dbo].[evidence_files] ADD CONSTRAINT [evidence_files_observation_area_id_fkey] FOREIGN KEY ([observation_area_id]) REFERENCES [dbo].[observation_areas]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
