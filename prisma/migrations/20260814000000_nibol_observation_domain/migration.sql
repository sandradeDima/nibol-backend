-- CreateTable
CREATE TABLE [dbo].[users] (
    [id] CHAR(36) NOT NULL,
    [name] NVARCHAR(191) NOT NULL,
    [email] NVARCHAR(191) NOT NULL,
    [password] NVARCHAR(255) NULL,
    [avatar] NVARCHAR(255) NULL,
    [job_title] NVARCHAR(191) NULL,
    [is_active] BIT NOT NULL CONSTRAINT [users_is_active_df] DEFAULT 1,
    [email_verified] BIT NOT NULL CONSTRAINT [users_email_verified_df] DEFAULT 0,
    [last_login_at] DATETIME2 NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [users_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    [deleted_at] DATETIME2 NULL,
    CONSTRAINT [users_email_key] UNIQUE NONCLUSTERED ([email]),
    CONSTRAINT [users_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[roles] (
    [id] CHAR(36) NOT NULL,
    [name] NVARCHAR(191) NOT NULL,
    [description] NVARCHAR(255) NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [roles_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    [deleted_at] DATETIME2 NULL,
    CONSTRAINT [roles_name_key] UNIQUE NONCLUSTERED ([name]),
    CONSTRAINT [roles_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[permissions] (
    [id] CHAR(36) NOT NULL,
    [name] NVARCHAR(191) NOT NULL,
    [description] NVARCHAR(255) NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [permissions_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    [deleted_at] DATETIME2 NULL,
    CONSTRAINT [permissions_name_key] UNIQUE NONCLUSTERED ([name]),
    CONSTRAINT [permissions_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[user_roles] (
    [id] CHAR(36) NOT NULL,
    [user_id] CHAR(36) NOT NULL,
    [role_id] CHAR(36) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [user_roles_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [user_roles_user_id_role_id_key] UNIQUE NONCLUSTERED ([user_id], [role_id]),
    CONSTRAINT [user_roles_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[role_permissions] (
    [id] CHAR(36) NOT NULL,
    [role_id] CHAR(36) NOT NULL,
    [permission_id] CHAR(36) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [role_permissions_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [role_permissions_role_id_permission_id_key] UNIQUE NONCLUSTERED ([role_id], [permission_id]),
    CONSTRAINT [role_permissions_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[invitations] (
    [id] CHAR(36) NOT NULL,
    [email] NVARCHAR(191) NOT NULL,
    [token] NVARCHAR(191) NOT NULL,
    [role_id] CHAR(36) NOT NULL,
    [expires_at] DATETIME2 NOT NULL,
    [accepted_at] DATETIME2 NULL,
    [created_by] CHAR(36) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [invitations_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    [deleted_at] DATETIME2 NULL,
    CONSTRAINT [invitations_token_key] UNIQUE NONCLUSTERED ([token]),
    CONSTRAINT [invitations_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[settings] (
    [id] CHAR(36) NOT NULL,
    [app_name] NVARCHAR(191) NOT NULL,
    [logo] NVARCHAR(255) NULL,
    [primary_color] NVARCHAR(32) NULL,
    [support_email] NVARCHAR(191) NOT NULL,
    [timezone] NVARCHAR(100) NOT NULL,
    [date_format] NVARCHAR(50) NOT NULL,
    [sender_name] NVARCHAR(191) NOT NULL,
    [sender_email] NVARCHAR(191) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [settings_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    [deleted_at] DATETIME2 NULL,
    CONSTRAINT [settings_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[notifications] (
    [id] CHAR(36) NOT NULL,
    [user_id] CHAR(36) NOT NULL,
    [title] NVARCHAR(191) NOT NULL,
    [message] NVARCHAR(MAX) NOT NULL,
    [type] NVARCHAR(64) NOT NULL CONSTRAINT [notifications_type_df] DEFAULT 'info',
    [priority] NVARCHAR(64) NOT NULL CONSTRAINT [notifications_priority_df] DEFAULT 'NORMAL',
    [event_type] NVARCHAR(100) NULL,
    [entity_type] NVARCHAR(100) NULL,
    [entity_id] CHAR(36) NULL,
    [target_url] NVARCHAR(500) NULL,
    [dedupe_key] NVARCHAR(255) NULL,
    [is_read] BIT NOT NULL CONSTRAINT [notifications_is_read_df] DEFAULT 0,
    [read_at] DATETIME2 NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [notifications_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    [deleted_at] DATETIME2 NULL,
    CONSTRAINT [notifications_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE UNIQUE NONCLUSTERED INDEX [notifications_dedupe_key_key] ON [dbo].[notifications]([dedupe_key]) WHERE ([dedupe_key] IS NOT NULL);

-- CreateTable
CREATE TABLE [dbo].[notification_deliveries] (
    [id] CHAR(36) NOT NULL,
    [notification_id] CHAR(36) NULL,
    [dedupe_key] NVARCHAR(255) NULL,
    [channel] NVARCHAR(64) NOT NULL,
    [recipient_user_id] CHAR(36) NULL,
    [recipient_email] NVARCHAR(191) NULL,
    [status] NVARCHAR(64) NOT NULL CONSTRAINT [notification_deliveries_status_df] DEFAULT 'PENDING',
    [attempts] INT NOT NULL CONSTRAINT [notification_deliveries_attempts_df] DEFAULT 0,
    [last_attempt_at] DATETIME2 NULL,
    [sent_at] DATETIME2 NULL,
    [error_message] NVARCHAR(MAX) NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [notification_deliveries_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [notification_deliveries_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE UNIQUE NONCLUSTERED INDEX [notification_deliveries_dedupe_key_key] ON [dbo].[notification_deliveries]([dedupe_key]) WHERE ([dedupe_key] IS NOT NULL);

-- CreateTable
CREATE TABLE [dbo].[entity_activities] (
    [id] CHAR(36) NOT NULL,
    [observation_id] CHAR(36) NULL,
    [entity_type] NVARCHAR(64) NOT NULL,
    [entity_id] NVARCHAR(191) NOT NULL,
    [activity_type] NVARCHAR(100) NOT NULL,
    [action] NVARCHAR(100) NOT NULL,
    [actor_user_id] CHAR(36) NULL,
    [actor_type] NVARCHAR(32) NOT NULL CONSTRAINT [entity_activities_actor_type_df] DEFAULT 'USER',
    [title] NVARCHAR(191) NOT NULL,
    [description] NVARCHAR(MAX) NULL,
    [previous_data_json] NVARCHAR(MAX) NULL,
    [new_data_json] NVARCHAR(MAX) NULL,
    [metadata_json] NVARCHAR(MAX) NULL,
    [visibility] NVARCHAR(32) NOT NULL CONSTRAINT [entity_activities_visibility_df] DEFAULT 'ALL_AUTHORIZED',
    [target_url] NVARCHAR(500) NULL,
    [dedupe_key] NVARCHAR(255) NULL,
    [related_audit_log_id] CHAR(36) NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [entity_activities_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [entity_activities_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE UNIQUE NONCLUSTERED INDEX [entity_activities_dedupe_key_key] ON [dbo].[entity_activities]([dedupe_key]) WHERE ([dedupe_key] IS NOT NULL);

-- CreateTable
CREATE TABLE [dbo].[scheduled_job_executions] (
    [id] CHAR(36) NOT NULL,
    [job_name] NVARCHAR(100) NOT NULL,
    [started_at] DATETIME2 NOT NULL,
    [finished_at] DATETIME2 NULL,
    [status] NVARCHAR(64) NOT NULL,
    [processed_count] INT NOT NULL CONSTRAINT [scheduled_job_executions_processed_count_df] DEFAULT 0,
    [notifications_created] INT NOT NULL CONSTRAINT [scheduled_job_executions_notifications_created_df] DEFAULT 0,
    [emails_sent] INT NOT NULL CONSTRAINT [scheduled_job_executions_emails_sent_df] DEFAULT 0,
    [failures_count] INT NOT NULL CONSTRAINT [scheduled_job_executions_failures_count_df] DEFAULT 0,
    [details_json] NVARCHAR(MAX) NULL,
    [error_message] NVARCHAR(MAX) NULL,
    [triggered_by] NVARCHAR(64) NOT NULL,
    [triggered_by_user_id] CHAR(36) NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [scheduled_job_executions_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [scheduled_job_executions_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[scheduled_job_locks] (
    [job_name] NVARCHAR(100) NOT NULL,
    [lock_token] CHAR(36) NOT NULL,
    [acquired_at] DATETIME2 NOT NULL,
    [expires_at] DATETIME2 NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [scheduled_job_locks_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [scheduled_job_locks_lock_token_key] UNIQUE NONCLUSTERED ([lock_token]),
    CONSTRAINT [scheduled_job_locks_pkey] PRIMARY KEY CLUSTERED ([job_name])
);

-- CreateTable
CREATE TABLE [dbo].[module_records] (
    [id] CHAR(36) NOT NULL,
    [module_key] NVARCHAR(100) NOT NULL,
    [name] NVARCHAR(191) NOT NULL,
    [description] NVARCHAR(MAX) NULL,
    [is_active] BIT NOT NULL CONSTRAINT [module_records_is_active_df] DEFAULT 1,
    [metadata] NVARCHAR(MAX) NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [module_records_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    [deleted_at] DATETIME2 NULL,
    CONSTRAINT [module_records_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[activity_logs] (
    [id] CHAR(36) NOT NULL,
    [user_id] CHAR(36) NULL,
    [action] NVARCHAR(191) NOT NULL,
    [entity_type] NVARCHAR(191) NOT NULL,
    [entity_id] CHAR(36) NULL,
    [metadata] NVARCHAR(MAX) NULL,
    [ip_address] NVARCHAR(45) NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [activity_logs_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [activity_logs_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[audit_logs] (
    [id] CHAR(36) NOT NULL,
    [entity_type] NVARCHAR(191) NOT NULL,
    [entity_id] CHAR(36) NULL,
    [old_values] NVARCHAR(MAX) NULL,
    [new_values] NVARCHAR(MAX) NULL,
    [changed_by] CHAR(36) NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [audit_logs_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [audit_logs_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[risk_levels] (
    [id] CHAR(36) NOT NULL,
    [name] NVARCHAR(100) NOT NULL,
    [key] NVARCHAR(100) NOT NULL,
    [description] NVARCHAR(500) NULL,
    [color_token] NVARCHAR(64) NULL,
    [severity_order] INT NOT NULL,
    [default_deadline_days] INT NULL,
    [active] BIT NOT NULL CONSTRAINT [risk_levels_active_df] DEFAULT 1,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [risk_levels_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    [deleted_at] DATETIME2 NULL,
    CONSTRAINT [risk_levels_name_key] UNIQUE NONCLUSTERED ([name]),
    CONSTRAINT [risk_levels_key_key] UNIQUE NONCLUSTERED ([key]),
    CONSTRAINT [risk_levels_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[observation_statuses] (
    [id] CHAR(36) NOT NULL,
    [name] NVARCHAR(100) NOT NULL,
    [key] NVARCHAR(100) NOT NULL,
    [description] NVARCHAR(500) NULL,
    [sort_order] INT NOT NULL,
    [is_initial] BIT NOT NULL CONSTRAINT [observation_statuses_is_initial_df] DEFAULT 0,
    [is_final] BIT NOT NULL CONSTRAINT [observation_statuses_is_final_df] DEFAULT 0,
    [counts_as_overdue] BIT NOT NULL CONSTRAINT [observation_statuses_counts_as_overdue_df] DEFAULT 0,
    [active] BIT NOT NULL CONSTRAINT [observation_statuses_active_df] DEFAULT 1,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [observation_statuses_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    [deleted_at] DATETIME2 NULL,
    CONSTRAINT [observation_statuses_key_key] UNIQUE NONCLUSTERED ([key]),
    CONSTRAINT [observation_statuses_name_key] UNIQUE NONCLUSTERED ([name]),
    CONSTRAINT [observation_statuses_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[areas] (
    [id] CHAR(36) NOT NULL,
    [name] NVARCHAR(191) NOT NULL,
    [code] NVARCHAR(100) NULL,
    [description] NVARCHAR(500) NULL,
    [manager_user_id] CHAR(36) NULL,
    [active] BIT NOT NULL CONSTRAINT [areas_active_df] DEFAULT 1,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [areas_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    [deleted_at] DATETIME2 NULL,
    CONSTRAINT [areas_name_key] UNIQUE NONCLUSTERED ([name]),
    CONSTRAINT [areas_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE UNIQUE NONCLUSTERED INDEX [areas_code_key] ON [dbo].[areas]([code]) WHERE ([code] IS NOT NULL);

-- CreateTable
CREATE TABLE [dbo].[audit_reports] (
    [id] CHAR(36) NOT NULL,
    [report_number] NVARCHAR(64) NOT NULL,
    [title] NVARCHAR(191) NOT NULL,
    [report_date] DATE NOT NULL,
    [created_by_user_id] CHAR(36) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [audit_reports_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    [deleted_at] DATETIME2 NULL,
    CONSTRAINT [audit_reports_report_number_key] UNIQUE NONCLUSTERED ([report_number]),
    CONSTRAINT [audit_reports_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[observation_dictionary] (
    [id] CHAR(36) NOT NULL,
    [name] NVARCHAR(191) NOT NULL,
    [description] NVARCHAR(MAX) NULL,
    [is_active] BIT NOT NULL CONSTRAINT [observation_dictionary_is_active_df] DEFAULT 1,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [observation_dictionary_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [observation_dictionary_name_key] UNIQUE NONCLUSTERED ([name]),
    CONSTRAINT [observation_dictionary_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[risks] (
    [id] CHAR(36) NOT NULL,
    [name] NVARCHAR(191) NOT NULL,
    [description] NVARCHAR(MAX) NULL,
    [is_active] BIT NOT NULL CONSTRAINT [risks_is_active_df] DEFAULT 1,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [risks_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [risks_name_key] UNIQUE NONCLUSTERED ([name]),
    CONSTRAINT [risks_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[system_parameters] (
    [id] CHAR(36) NOT NULL,
    [key] NVARCHAR(191) NOT NULL,
    [name] NVARCHAR(191) NOT NULL,
    [value] NVARCHAR(MAX) NOT NULL,
    [value_type] NVARCHAR(32) NOT NULL,
    [group_name] NVARCHAR(100) NOT NULL,
    [description] NVARCHAR(500) NULL,
    [editable] BIT NOT NULL CONSTRAINT [system_parameters_editable_df] DEFAULT 1,
    [active] BIT NOT NULL CONSTRAINT [system_parameters_active_df] DEFAULT 1,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [system_parameters_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    [deleted_at] DATETIME2 NULL,
    CONSTRAINT [system_parameters_key_key] UNIQUE NONCLUSTERED ([key]),
    CONSTRAINT [system_parameters_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[catalogs] (
    [id] CHAR(36) NOT NULL,
    [type] NVARCHAR(100) NOT NULL,
    [name] NVARCHAR(191) NOT NULL,
    [key] NVARCHAR(100) NULL,
    [description] NVARCHAR(500) NULL,
    [active] BIT NOT NULL CONSTRAINT [catalogs_active_df] DEFAULT 1,
    [sort_order] INT NOT NULL CONSTRAINT [catalogs_sort_order_df] DEFAULT 0,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [catalogs_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    [deleted_at] DATETIME2 NULL,
    CONSTRAINT [catalogs_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[observations] (
    [id] CHAR(36) NOT NULL,
    [audit_report_id] CHAR(36) NOT NULL,
    [observation_number] INT NOT NULL,
    [main_observation_id] CHAR(36) NOT NULL,
    [title] NVARCHAR(191) NOT NULL,
    [description] NVARCHAR(MAX) NOT NULL,
    [audit_recommendation] NVARCHAR(MAX) NOT NULL,
    [risk_level_id] CHAR(36) NOT NULL,
    [status_id] CHAR(36) NOT NULL,
    [auditor_user_id] CHAR(36) NOT NULL,
    [original_due_date] DATE NOT NULL,
    [current_due_date] DATE NOT NULL,
    [source] NVARCHAR(191) NULL,
    [process_name] NVARCHAR(191) NULL,
    [category] NVARCHAR(191) NULL,
    [progress_percent] INT NOT NULL CONSTRAINT [observations_progress_percent_df] DEFAULT 0,
    [current_stage] NVARCHAR(191) NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [observations_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    [deleted_at] DATETIME2 NULL,
    CONSTRAINT [observations_audit_report_id_observation_number_key] UNIQUE NONCLUSTERED ([audit_report_id], [observation_number]),
    CONSTRAINT [observations_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[observation_risks] (
    [id] CHAR(36) NOT NULL,
    [observation_id] CHAR(36) NOT NULL,
    [risk_id] CHAR(36) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [observation_risks_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [observation_risks_observation_id_risk_id_key] UNIQUE NONCLUSTERED ([observation_id], [risk_id]),
    CONSTRAINT [observation_risks_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[observation_areas] (
    [id] CHAR(36) NOT NULL,
    [observation_id] CHAR(36) NOT NULL,
    [area_id] CHAR(36) NOT NULL,
    [process_owner_user_id] CHAR(36) NOT NULL,
    [area_responsible_user_id] CHAR(36) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [observation_areas_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [observation_areas_observation_id_area_id_key] UNIQUE NONCLUSTERED ([observation_id], [area_id]),
    CONSTRAINT [observation_areas_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[remediation_plans] (
    [id] CHAR(36) NOT NULL,
    [observation_id] CHAR(36) NOT NULL,
    [area_id] CHAR(36) NOT NULL,
    [owner_user_id] CHAR(36) NULL,
    [strategy_text] NVARCHAR(MAX) NOT NULL,
    [mitigation_text] NVARCHAR(MAX) NULL,
    [additional_comments] NVARCHAR(MAX) NULL,
    [status] NVARCHAR(64) NOT NULL CONSTRAINT [remediation_plans_status_df] DEFAULT 'DRAFT',
    [sent_to_audit_at] DATETIME2 NULL,
    [approved_at] DATETIME2 NULL,
    [approved_by_user_id] CHAR(36) NULL,
    [returned_at] DATETIME2 NULL,
    [returned_by_user_id] CHAR(36) NULL,
    [return_reason] NVARCHAR(MAX) NULL,
    [created_by_user_id] CHAR(36) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [remediation_plans_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    [deleted_at] DATETIME2 NULL,
    [workflow_instance_id] CHAR(36) NULL,
    CONSTRAINT [remediation_plans_observation_id_area_id_key] UNIQUE NONCLUSTERED ([observation_id], [area_id]),
    CONSTRAINT [remediation_plans_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[action_plans] (
    [id] CHAR(36) NOT NULL,
    [remediation_plan_id] CHAR(36) NULL,
    [observation_id] CHAR(36) NOT NULL,
    [observation_area_id] CHAR(36) NOT NULL,
    [responsible_user_id] CHAR(36) NOT NULL,
    [title] NVARCHAR(191) NOT NULL,
    [description] NVARCHAR(MAX) NOT NULL,
    [original_due_date] DATE NOT NULL,
    [current_due_date] DATE NOT NULL,
    [completed_at] DATETIME2 NULL,
    [progress_percent] INT NOT NULL CONSTRAINT [action_plans_progress_percent_df] DEFAULT 0,
    [status] NVARCHAR(64) NOT NULL CONSTRAINT [action_plans_status_df] DEFAULT 'NOT_STARTED',
    [sort_order] INT NOT NULL CONSTRAINT [action_plans_sort_order_df] DEFAULT 0,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [action_plans_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    [deleted_at] DATETIME2 NULL,
    CONSTRAINT [action_plans_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[deadline_extension_requests] (
    [id] CHAR(36) NOT NULL,
    [target_type] NVARCHAR(64) NOT NULL,
    [observation_id] CHAR(36) NULL,
    [action_plan_id] CHAR(36) NULL,
    [observation_area_id] CHAR(36) NULL,
    [requested_by_user_id] CHAR(36) NOT NULL,
    [previous_due_date] DATE NOT NULL,
    [proposed_due_date] DATE NOT NULL,
    [reason] NVARCHAR(MAX) NOT NULL,
    [status] NVARCHAR(64) NOT NULL CONSTRAINT [deadline_extension_requests_status_df] DEFAULT 'DRAFT',
    [manager_reviewer_id] CHAR(36) NULL,
    [manager_reviewed_at] DATETIME2 NULL,
    [manager_comment] NVARCHAR(MAX) NULL,
    [audit_reviewer_id] CHAR(36) NULL,
    [audit_reviewed_at] DATETIME2 NULL,
    [audit_comment] NVARCHAR(MAX) NULL,
    [final_approved_at] DATETIME2 NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [deadline_extension_requests_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    [deleted_at] DATETIME2 NULL,
    [workflow_instance_id] CHAR(36) NULL,
    CONSTRAINT [deadline_extension_requests_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[deadline_extension_attachments] (
    [id] CHAR(36) NOT NULL,
    [extension_request_id] CHAR(36) NOT NULL,
    [evidence_file_id] CHAR(36) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [deadline_extension_attachments_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [dea_extension_request_id_evidence_file_id_key] UNIQUE NONCLUSTERED ([extension_request_id], [evidence_file_id]),
    CONSTRAINT [deadline_extension_attachments_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[sessions] (
    [id] CHAR(36) NOT NULL,
    [expires_at] DATETIME2 NOT NULL,
    [token] NVARCHAR(255) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [sessions_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    [ip_address] NVARCHAR(45) NULL,
    [user_agent] NVARCHAR(255) NULL,
    [user_id] CHAR(36) NOT NULL,
    CONSTRAINT [sessions_token_key] UNIQUE NONCLUSTERED ([token]),
    CONSTRAINT [sessions_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[accounts] (
    [id] CHAR(36) NOT NULL,
    [account_id] NVARCHAR(191) NOT NULL,
    [provider_id] NVARCHAR(191) NOT NULL,
    [user_id] CHAR(36) NOT NULL,
    [access_token] NVARCHAR(MAX) NULL,
    [refresh_token] NVARCHAR(MAX) NULL,
    [id_token] NVARCHAR(MAX) NULL,
    [access_token_expires_at] DATETIME2 NULL,
    [refresh_token_expires_at] DATETIME2 NULL,
    [scope] NVARCHAR(255) NULL,
    [password] NVARCHAR(255) NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [accounts_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [accounts_provider_id_account_id_key] UNIQUE NONCLUSTERED ([provider_id], [account_id]),
    CONSTRAINT [accounts_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[verifications] (
    [id] CHAR(36) NOT NULL,
    [identifier] NVARCHAR(255) NOT NULL,
    [value] NVARCHAR(MAX) NOT NULL,
    [expires_at] DATETIME2 NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [verifications_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [verifications_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[progress_evaluations] (
    [id] CHAR(36) NOT NULL,
    [action_plan_id] CHAR(36) NOT NULL,
    [submitted_by_user_id] CHAR(36) NOT NULL,
    [type] NVARCHAR(64) NOT NULL CONSTRAINT [progress_evaluations_type_df] DEFAULT 'ADVANCE',
    [progress_percent] INT NOT NULL,
    [action_plan_status] NVARCHAR(64) NOT NULL,
    [comment] NVARCHAR(MAX) NOT NULL,
    [review_status] NVARCHAR(64) NOT NULL CONSTRAINT [progress_evaluations_review_status_df] DEFAULT 'DRAFT',
    [reviewed_by_user_id] CHAR(36) NULL,
    [submitted_at] DATETIME2 NOT NULL CONSTRAINT [progress_evaluations_submitted_at_df] DEFAULT CURRENT_TIMESTAMP,
    [reviewed_at] DATETIME2 NULL,
    [review_comment] NVARCHAR(MAX) NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [progress_evaluations_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    [deleted_at] DATETIME2 NULL,
    [workflow_instance_id] CHAR(36) NULL,
    CONSTRAINT [progress_evaluations_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[evidence_files] (
    [id] CHAR(36) NOT NULL,
    [observation_id] CHAR(36) NOT NULL,
    [context] NVARCHAR(64) NOT NULL,
    [action_plan_id] CHAR(36) NULL,
    [progress_evaluation_id] CHAR(36) NULL,
    [uploaded_by_user_id] CHAR(36) NOT NULL,
    [original_name] NVARCHAR(255) NOT NULL,
    [stored_name] NVARCHAR(255) NOT NULL,
    [relative_path] NVARCHAR(500) NOT NULL,
    [mime_type] NVARCHAR(191) NOT NULL,
    [size_bytes] BIGINT NOT NULL,
    [checksum] NVARCHAR(128) NULL,
    [description] NVARCHAR(MAX) NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [evidence_files_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [deleted_at] DATETIME2 NULL,
    CONSTRAINT [evidence_files_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[observation_comments] (
    [id] CHAR(36) NOT NULL,
    [observation_id] CHAR(36) NOT NULL,
    [remediation_plan_id] CHAR(36) NULL,
    [action_plan_id] CHAR(36) NULL,
    [progress_evaluation_id] CHAR(36) NULL,
    [author_user_id] CHAR(36) NOT NULL,
    [visibility] NVARCHAR(64) NOT NULL CONSTRAINT [observation_comments_visibility_df] DEFAULT 'AREA_VISIBLE',
    [body] NVARCHAR(MAX) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [observation_comments_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    [deleted_at] DATETIME2 NULL,
    CONSTRAINT [observation_comments_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[progress_review_history] (
    [id] CHAR(36) NOT NULL,
    [progress_evaluation_id] CHAR(36) NOT NULL,
    [action] NVARCHAR(64) NOT NULL,
    [from_status] NVARCHAR(64) NULL,
    [to_status] NVARCHAR(64) NOT NULL,
    [user_id] CHAR(36) NOT NULL,
    [comment] NVARCHAR(MAX) NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [progress_review_history_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [progress_review_history_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[workflow_definitions] (
    [id] CHAR(36) NOT NULL,
    [name] NVARCHAR(191) NOT NULL,
    [description] NVARCHAR(MAX) NULL,
    [process_type] NVARCHAR(100) NOT NULL,
    [status] NVARCHAR(64) NOT NULL CONSTRAINT [workflow_definitions_status_df] DEFAULT 'DRAFT',
    [active_version_id] CHAR(36) NULL,
    [created_by_id] CHAR(36) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [workflow_definitions_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    [archived_at] DATETIME2 NULL,
    CONSTRAINT [workflow_definitions_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE UNIQUE NONCLUSTERED INDEX [workflow_definitions_active_version_id_key] ON [dbo].[workflow_definitions]([active_version_id]) WHERE ([active_version_id] IS NOT NULL);

-- CreateTable
CREATE TABLE [dbo].[workflow_versions] (
    [id] CHAR(36) NOT NULL,
    [workflow_definition_id] CHAR(36) NOT NULL,
    [version_number] INT NOT NULL,
    [status] NVARCHAR(64) NOT NULL CONSTRAINT [workflow_versions_status_df] DEFAULT 'DRAFT',
    [change_description] NVARCHAR(MAX) NULL,
    [created_by_id] CHAR(36) NOT NULL,
    [published_by_id] CHAR(36) NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [workflow_versions_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [published_at] DATETIME2 NULL,
    CONSTRAINT [workflow_versions_workflow_definition_id_version_number_key] UNIQUE NONCLUSTERED ([workflow_definition_id], [version_number]),
    CONSTRAINT [workflow_versions_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[workflow_nodes] (
    [id] CHAR(36) NOT NULL,
    [workflow_version_id] CHAR(36) NOT NULL,
    [node_key] NVARCHAR(100) NOT NULL,
    [name] NVARCHAR(191) NOT NULL,
    [description] NVARCHAR(MAX) NULL,
    [type] NVARCHAR(64) NOT NULL,
    [assignment_strategy] NVARCHAR(64) NULL,
    [position_x] FLOAT(53) NOT NULL,
    [position_y] FLOAT(53) NOT NULL,
    [configuration_json] NVARCHAR(MAX) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [workflow_nodes_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [workflow_nodes_workflow_version_id_node_key_key] UNIQUE NONCLUSTERED ([workflow_version_id], [node_key]),
    CONSTRAINT [workflow_nodes_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[workflow_transitions] (
    [id] CHAR(36) NOT NULL,
    [workflow_version_id] CHAR(36) NOT NULL,
    [source_node_id] CHAR(36) NOT NULL,
    [target_node_id] CHAR(36) NOT NULL,
    [label] NVARCHAR(191) NULL,
    [priority] INT NOT NULL CONSTRAINT [workflow_transitions_priority_df] DEFAULT 0,
    [transition_type] NVARCHAR(64) NULL,
    [condition_group_id] CHAR(36) NULL,
    CONSTRAINT [workflow_transitions_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[workflow_condition_groups] (
    [id] CHAR(36) NOT NULL,
    [workflow_version_id] CHAR(36) NOT NULL,
    [logic_operator] NVARCHAR(64) NOT NULL,
    [description] NVARCHAR(MAX) NULL,
    CONSTRAINT [workflow_condition_groups_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[workflow_conditions] (
    [id] CHAR(36) NOT NULL,
    [condition_group_id] CHAR(36) NOT NULL,
    [field] NVARCHAR(100) NOT NULL,
    [operator] NVARCHAR(64) NOT NULL,
    [value_json] NVARCHAR(MAX) NULL,
    [sequence] INT NOT NULL,
    [description] NVARCHAR(MAX) NULL,
    CONSTRAINT [workflow_conditions_condition_group_id_sequence_key] UNIQUE NONCLUSTERED ([condition_group_id], [sequence]),
    CONSTRAINT [workflow_conditions_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[workflow_instances] (
    [id] CHAR(36) NOT NULL,
    [workflow_definition_id] CHAR(36) NOT NULL,
    [workflow_version_id] CHAR(36) NOT NULL,
    [process_type] NVARCHAR(100) NOT NULL,
    [entity_type] NVARCHAR(100) NOT NULL,
    [entity_id] NVARCHAR(191) NOT NULL,
    [current_node_id] CHAR(36) NULL,
    [status] NVARCHAR(64) NOT NULL CONSTRAINT [workflow_instances_status_df] DEFAULT 'PENDING',
    [started_by_id] CHAR(36) NOT NULL,
    [started_at] DATETIME2 NOT NULL CONSTRAINT [workflow_instances_started_at_df] DEFAULT CURRENT_TIMESTAMP,
    [completed_at] DATETIME2 NULL,
    [final_result] NVARCHAR(64) NULL,
    [runtime_error_code] NVARCHAR(100) NULL,
    [runtime_error_message] NVARCHAR(MAX) NULL,
    [last_execution_at] DATETIME2 NULL,
    [context_json] NVARCHAR(MAX) NOT NULL,
    CONSTRAINT [workflow_instances_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[workflow_tasks] (
    [id] CHAR(36) NOT NULL,
    [workflow_instance_id] CHAR(36) NOT NULL,
    [node_id] CHAR(36) NOT NULL,
    [assigned_user_id] CHAR(36) NULL,
    [assigned_role_id] CHAR(36) NULL,
    [assigned_area_id] CHAR(36) NULL,
    [status] NVARCHAR(64) NOT NULL CONSTRAINT [workflow_tasks_status_df] DEFAULT 'PENDING',
    [entry_sequence] INT NOT NULL CONSTRAINT [workflow_tasks_entry_sequence_df] DEFAULT 1,
    [due_at] DATETIME2 NULL,
    [completed_at] DATETIME2 NULL,
    [decision] NVARCHAR(100) NULL,
    [comments] NVARCHAR(MAX) NULL,
    [assignment_snapshot_json] NVARCHAR(MAX) NULL,
    [assignment_history_json] NVARCHAR(MAX) NULL,
    [evidence_references_json] NVARCHAR(MAX) NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [workflow_tasks_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [workflow_tasks_instance_node_entry_key] UNIQUE NONCLUSTERED ([workflow_instance_id], [node_id], [entry_sequence]),
    CONSTRAINT [workflow_tasks_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[workflow_transition_logs] (
    [id] CHAR(36) NOT NULL,
    [workflow_instance_id] CHAR(36) NOT NULL,
    [source_node_id] CHAR(36) NULL,
    [target_node_id] CHAR(36) NULL,
    [trigger_type] NVARCHAR(64) NOT NULL,
    [performed_by_id] CHAR(36) NULL,
    [decision] NVARCHAR(100) NULL,
    [event_type] NVARCHAR(64) NULL,
    [details_json] NVARCHAR(MAX) NULL,
    [context_snapshot_json] NVARCHAR(MAX) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [workflow_transition_logs_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [workflow_transition_logs_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[workflow_timers] (
    [id] CHAR(36) NOT NULL,
    [workflow_instance_id] CHAR(36) NOT NULL,
    [workflow_task_id] CHAR(36) NULL,
    [timer_type] NVARCHAR(64) NOT NULL,
    [execute_at] DATETIME2 NOT NULL,
    [status] NVARCHAR(64) NOT NULL CONSTRAINT [workflow_timers_status_df] DEFAULT 'PENDING',
    [executed_at] DATETIME2 NULL,
    [configuration_json] NVARCHAR(MAX) NOT NULL,
    [attempts] INT NOT NULL CONSTRAINT [workflow_timers_attempts_df] DEFAULT 0,
    [last_error] NVARCHAR(MAX) NULL,
    [last_attempt_at] DATETIME2 NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [workflow_timers_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [workflow_timers_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE UNIQUE NONCLUSTERED INDEX [workflow_timers_task_type_key] ON [dbo].[workflow_timers]([workflow_task_id], [timer_type]) WHERE ([workflow_task_id] IS NOT NULL);

CREATE NONCLUSTERED INDEX [users_deleted_at_idx] ON [dbo].[users]([deleted_at]);

CREATE NONCLUSTERED INDEX [roles_deleted_at_idx] ON [dbo].[roles]([deleted_at]);

CREATE NONCLUSTERED INDEX [permissions_deleted_at_idx] ON [dbo].[permissions]([deleted_at]);

CREATE NONCLUSTERED INDEX [user_roles_role_id_idx] ON [dbo].[user_roles]([role_id]);

CREATE NONCLUSTERED INDEX [role_permissions_permission_id_idx] ON [dbo].[role_permissions]([permission_id]);

CREATE NONCLUSTERED INDEX [invitations_email_idx] ON [dbo].[invitations]([email]);

CREATE NONCLUSTERED INDEX [invitations_role_id_idx] ON [dbo].[invitations]([role_id]);

CREATE NONCLUSTERED INDEX [invitations_created_by_idx] ON [dbo].[invitations]([created_by]);

CREATE NONCLUSTERED INDEX [invitations_deleted_at_idx] ON [dbo].[invitations]([deleted_at]);

CREATE NONCLUSTERED INDEX [settings_deleted_at_idx] ON [dbo].[settings]([deleted_at]);

CREATE NONCLUSTERED INDEX [notifications_user_id_is_read_idx] ON [dbo].[notifications]([user_id], [is_read]);

CREATE NONCLUSTERED INDEX [notifications_user_id_created_at_idx] ON [dbo].[notifications]([user_id], [created_at]);

CREATE NONCLUSTERED INDEX [notifications_event_type_entity_type_entity_id_idx] ON [dbo].[notifications]([event_type], [entity_type], [entity_id]);

CREATE NONCLUSTERED INDEX [notifications_priority_created_at_idx] ON [dbo].[notifications]([priority], [created_at]);

CREATE NONCLUSTERED INDEX [notifications_deleted_at_idx] ON [dbo].[notifications]([deleted_at]);

CREATE NONCLUSTERED INDEX [notification_deliveries_notification_id_channel_idx] ON [dbo].[notification_deliveries]([notification_id], [channel]);

CREATE NONCLUSTERED INDEX [notification_deliveries_recipient_user_id_channel_status_idx] ON [dbo].[notification_deliveries]([recipient_user_id], [channel], [status]);

CREATE NONCLUSTERED INDEX [notification_deliveries_status_last_attempt_at_idx] ON [dbo].[notification_deliveries]([status], [last_attempt_at]);

CREATE NONCLUSTERED INDEX [entity_activities_observation_id_idx] ON [dbo].[entity_activities]([observation_id]);

CREATE NONCLUSTERED INDEX [entity_activities_entity_type_entity_id_idx] ON [dbo].[entity_activities]([entity_type], [entity_id]);

CREATE NONCLUSTERED INDEX [entity_activities_actor_user_id_idx] ON [dbo].[entity_activities]([actor_user_id]);

CREATE NONCLUSTERED INDEX [entity_activities_activity_type_idx] ON [dbo].[entity_activities]([activity_type]);

CREATE NONCLUSTERED INDEX [entity_activities_created_at_idx] ON [dbo].[entity_activities]([created_at]);

CREATE NONCLUSTERED INDEX [entity_activities_visibility_idx] ON [dbo].[entity_activities]([visibility]);

CREATE NONCLUSTERED INDEX [scheduled_job_executions_job_name_started_at_idx] ON [dbo].[scheduled_job_executions]([job_name], [started_at]);

CREATE NONCLUSTERED INDEX [scheduled_job_executions_job_name_status_idx] ON [dbo].[scheduled_job_executions]([job_name], [status]);

CREATE NONCLUSTERED INDEX [scheduled_job_executions_triggered_by_user_id_idx] ON [dbo].[scheduled_job_executions]([triggered_by_user_id]);

CREATE NONCLUSTERED INDEX [scheduled_job_locks_expires_at_idx] ON [dbo].[scheduled_job_locks]([expires_at]);

CREATE NONCLUSTERED INDEX [module_records_module_key_deleted_at_idx] ON [dbo].[module_records]([module_key], [deleted_at]);

CREATE NONCLUSTERED INDEX [module_records_module_key_is_active_idx] ON [dbo].[module_records]([module_key], [is_active]);

CREATE NONCLUSTERED INDEX [module_records_module_key_created_at_idx] ON [dbo].[module_records]([module_key], [created_at]);

CREATE NONCLUSTERED INDEX [activity_logs_user_id_idx] ON [dbo].[activity_logs]([user_id]);

CREATE NONCLUSTERED INDEX [activity_logs_entity_type_entity_id_idx] ON [dbo].[activity_logs]([entity_type], [entity_id]);

CREATE NONCLUSTERED INDEX [activity_logs_created_at_idx] ON [dbo].[activity_logs]([created_at]);

CREATE NONCLUSTERED INDEX [audit_logs_changed_by_idx] ON [dbo].[audit_logs]([changed_by]);

CREATE NONCLUSTERED INDEX [audit_logs_entity_type_entity_id_idx] ON [dbo].[audit_logs]([entity_type], [entity_id]);

CREATE NONCLUSTERED INDEX [audit_logs_created_at_idx] ON [dbo].[audit_logs]([created_at]);

CREATE NONCLUSTERED INDEX [risk_levels_active_deleted_at_idx] ON [dbo].[risk_levels]([active], [deleted_at]);

CREATE NONCLUSTERED INDEX [risk_levels_deleted_at_idx] ON [dbo].[risk_levels]([deleted_at]);

CREATE NONCLUSTERED INDEX [risk_levels_severity_order_idx] ON [dbo].[risk_levels]([severity_order]);

CREATE NONCLUSTERED INDEX [observation_statuses_active_deleted_at_idx] ON [dbo].[observation_statuses]([active], [deleted_at]);

CREATE NONCLUSTERED INDEX [observation_statuses_deleted_at_idx] ON [dbo].[observation_statuses]([deleted_at]);

CREATE NONCLUSTERED INDEX [observation_statuses_sort_order_idx] ON [dbo].[observation_statuses]([sort_order]);

CREATE NONCLUSTERED INDEX [areas_active_deleted_at_idx] ON [dbo].[areas]([active], [deleted_at]);

CREATE NONCLUSTERED INDEX [areas_deleted_at_idx] ON [dbo].[areas]([deleted_at]);

CREATE NONCLUSTERED INDEX [areas_manager_user_id_idx] ON [dbo].[areas]([manager_user_id]);

CREATE NONCLUSTERED INDEX [audit_reports_created_by_user_id_idx] ON [dbo].[audit_reports]([created_by_user_id]);

CREATE NONCLUSTERED INDEX [audit_reports_report_date_idx] ON [dbo].[audit_reports]([report_date]);

CREATE NONCLUSTERED INDEX [audit_reports_deleted_at_idx] ON [dbo].[audit_reports]([deleted_at]);

CREATE NONCLUSTERED INDEX [observation_dictionary_is_active_idx] ON [dbo].[observation_dictionary]([is_active]);

CREATE NONCLUSTERED INDEX [risks_is_active_idx] ON [dbo].[risks]([is_active]);

CREATE NONCLUSTERED INDEX [system_parameters_active_deleted_at_idx] ON [dbo].[system_parameters]([active], [deleted_at]);

CREATE NONCLUSTERED INDEX [system_parameters_deleted_at_idx] ON [dbo].[system_parameters]([deleted_at]);

CREATE NONCLUSTERED INDEX [system_parameters_group_name_active_deleted_at_idx] ON [dbo].[system_parameters]([group_name], [active], [deleted_at]);

CREATE NONCLUSTERED INDEX [catalogs_active_deleted_at_idx] ON [dbo].[catalogs]([active], [deleted_at]);

CREATE NONCLUSTERED INDEX [catalogs_deleted_at_idx] ON [dbo].[catalogs]([deleted_at]);

CREATE NONCLUSTERED INDEX [catalogs_type_sort_order_idx] ON [dbo].[catalogs]([type], [sort_order]);

CREATE NONCLUSTERED INDEX [catalogs_type_active_deleted_at_idx] ON [dbo].[catalogs]([type], [active], [deleted_at]);

CREATE UNIQUE NONCLUSTERED INDEX [catalogs_type_key_key] ON [dbo].[catalogs]([type], [key]) WHERE ([key] IS NOT NULL);

CREATE NONCLUSTERED INDEX [observations_audit_report_id_idx] ON [dbo].[observations]([audit_report_id]);

CREATE NONCLUSTERED INDEX [observations_auditor_user_id_idx] ON [dbo].[observations]([auditor_user_id]);

CREATE NONCLUSTERED INDEX [observations_deleted_at_idx] ON [dbo].[observations]([deleted_at]);

CREATE NONCLUSTERED INDEX [observations_current_due_date_idx] ON [dbo].[observations]([current_due_date]);

CREATE NONCLUSTERED INDEX [observations_main_observation_id_idx] ON [dbo].[observations]([main_observation_id]);

CREATE NONCLUSTERED INDEX [observations_original_due_date_idx] ON [dbo].[observations]([original_due_date]);

CREATE NONCLUSTERED INDEX [observations_risk_level_id_idx] ON [dbo].[observations]([risk_level_id]);

CREATE NONCLUSTERED INDEX [observations_status_id_idx] ON [dbo].[observations]([status_id]);

CREATE NONCLUSTERED INDEX [observation_risks_risk_id_idx] ON [dbo].[observation_risks]([risk_id]);

CREATE NONCLUSTERED INDEX [observation_areas_area_id_idx] ON [dbo].[observation_areas]([area_id]);

CREATE NONCLUSTERED INDEX [observation_areas_observation_id_idx] ON [dbo].[observation_areas]([observation_id]);

CREATE NONCLUSTERED INDEX [observation_areas_process_owner_user_id_idx] ON [dbo].[observation_areas]([process_owner_user_id]);

CREATE NONCLUSTERED INDEX [observation_areas_area_responsible_user_id_idx] ON [dbo].[observation_areas]([area_responsible_user_id]);

CREATE NONCLUSTERED INDEX [remediation_plans_area_id_idx] ON [dbo].[remediation_plans]([area_id]);

CREATE NONCLUSTERED INDEX [remediation_plans_created_by_user_id_idx] ON [dbo].[remediation_plans]([created_by_user_id]);

CREATE NONCLUSTERED INDEX [remediation_plans_deleted_at_idx] ON [dbo].[remediation_plans]([deleted_at]);

CREATE NONCLUSTERED INDEX [remediation_plans_observation_id_idx] ON [dbo].[remediation_plans]([observation_id]);

CREATE NONCLUSTERED INDEX [remediation_plans_owner_user_id_idx] ON [dbo].[remediation_plans]([owner_user_id]);

CREATE NONCLUSTERED INDEX [remediation_plans_status_idx] ON [dbo].[remediation_plans]([status]);

CREATE NONCLUSTERED INDEX [remediation_plans_approved_by_user_id_idx] ON [dbo].[remediation_plans]([approved_by_user_id]);

CREATE NONCLUSTERED INDEX [remediation_plans_returned_by_user_id_idx] ON [dbo].[remediation_plans]([returned_by_user_id]);

CREATE NONCLUSTERED INDEX [remediation_plans_workflow_instance_id_idx] ON [dbo].[remediation_plans]([workflow_instance_id]);

CREATE NONCLUSTERED INDEX [action_plans_completed_at_idx] ON [dbo].[action_plans]([completed_at]);

CREATE NONCLUSTERED INDEX [action_plans_deleted_at_idx] ON [dbo].[action_plans]([deleted_at]);

CREATE NONCLUSTERED INDEX [action_plans_current_due_date_idx] ON [dbo].[action_plans]([current_due_date]);

CREATE NONCLUSTERED INDEX [action_plans_original_due_date_idx] ON [dbo].[action_plans]([original_due_date]);

CREATE NONCLUSTERED INDEX [action_plans_observation_id_idx] ON [dbo].[action_plans]([observation_id]);

CREATE NONCLUSTERED INDEX [action_plans_progress_percent_idx] ON [dbo].[action_plans]([progress_percent]);

CREATE NONCLUSTERED INDEX [action_plans_remediation_plan_id_idx] ON [dbo].[action_plans]([remediation_plan_id]);

CREATE NONCLUSTERED INDEX [action_plans_observation_area_id_idx] ON [dbo].[action_plans]([observation_area_id]);

CREATE NONCLUSTERED INDEX [action_plans_responsible_user_id_idx] ON [dbo].[action_plans]([responsible_user_id]);

CREATE NONCLUSTERED INDEX [action_plans_sort_order_idx] ON [dbo].[action_plans]([sort_order]);

CREATE NONCLUSTERED INDEX [action_plans_status_idx] ON [dbo].[action_plans]([status]);

CREATE NONCLUSTERED INDEX [deadline_extension_requests_observation_area_id_idx] ON [dbo].[deadline_extension_requests]([observation_area_id]);

CREATE NONCLUSTERED INDEX [deadline_extension_requests_audit_reviewer_id_idx] ON [dbo].[deadline_extension_requests]([audit_reviewer_id]);

CREATE NONCLUSTERED INDEX [deadline_extension_requests_action_plan_id_idx] ON [dbo].[deadline_extension_requests]([action_plan_id]);

CREATE NONCLUSTERED INDEX [deadline_extension_requests_deleted_at_idx] ON [dbo].[deadline_extension_requests]([deleted_at]);

CREATE NONCLUSTERED INDEX [deadline_extension_requests_manager_reviewer_id_idx] ON [dbo].[deadline_extension_requests]([manager_reviewer_id]);

CREATE NONCLUSTERED INDEX [der_observation_action_plan_status_deleted_idx] ON [dbo].[deadline_extension_requests]([observation_id], [action_plan_id], [status], [deleted_at]);

CREATE NONCLUSTERED INDEX [deadline_extension_requests_requested_by_user_id_idx] ON [dbo].[deadline_extension_requests]([requested_by_user_id]);

CREATE NONCLUSTERED INDEX [deadline_extension_requests_status_updated_at_idx] ON [dbo].[deadline_extension_requests]([status], [updated_at]);

CREATE NONCLUSTERED INDEX [deadline_extension_requests_workflow_instance_id_idx] ON [dbo].[deadline_extension_requests]([workflow_instance_id]);

CREATE NONCLUSTERED INDEX [deadline_extension_attachments_evidence_file_id_idx] ON [dbo].[deadline_extension_attachments]([evidence_file_id]);

CREATE NONCLUSTERED INDEX [sessions_user_id_idx] ON [dbo].[sessions]([user_id]);

CREATE NONCLUSTERED INDEX [sessions_expires_at_idx] ON [dbo].[sessions]([expires_at]);

CREATE NONCLUSTERED INDEX [accounts_user_id_idx] ON [dbo].[accounts]([user_id]);

CREATE NONCLUSTERED INDEX [verifications_identifier_idx] ON [dbo].[verifications]([identifier]);

CREATE NONCLUSTERED INDEX [progress_evaluations_action_plan_id_submitted_at_idx] ON [dbo].[progress_evaluations]([action_plan_id], [submitted_at]);

CREATE NONCLUSTERED INDEX [progress_evaluations_deleted_at_idx] ON [dbo].[progress_evaluations]([deleted_at]);

CREATE NONCLUSTERED INDEX [progress_evaluations_review_status_deleted_at_idx] ON [dbo].[progress_evaluations]([review_status], [deleted_at]);

CREATE NONCLUSTERED INDEX [progress_evaluations_reviewed_by_user_id_idx] ON [dbo].[progress_evaluations]([reviewed_by_user_id]);

CREATE NONCLUSTERED INDEX [progress_evaluations_review_status_idx] ON [dbo].[progress_evaluations]([review_status]);

CREATE NONCLUSTERED INDEX [progress_evaluations_submitted_by_user_id_idx] ON [dbo].[progress_evaluations]([submitted_by_user_id]);

CREATE NONCLUSTERED INDEX [progress_evaluations_workflow_instance_id_idx] ON [dbo].[progress_evaluations]([workflow_instance_id]);

CREATE NONCLUSTERED INDEX [evidence_files_action_plan_id_idx] ON [dbo].[evidence_files]([action_plan_id]);

CREATE NONCLUSTERED INDEX [evidence_files_context_idx] ON [dbo].[evidence_files]([context]);

CREATE NONCLUSTERED INDEX [evidence_files_deleted_at_idx] ON [dbo].[evidence_files]([deleted_at]);

CREATE NONCLUSTERED INDEX [evidence_files_observation_id_created_at_idx] ON [dbo].[evidence_files]([observation_id], [created_at]);

CREATE NONCLUSTERED INDEX [evidence_files_progress_evaluation_id_idx] ON [dbo].[evidence_files]([progress_evaluation_id]);

CREATE NONCLUSTERED INDEX [evidence_files_uploaded_by_user_id_idx] ON [dbo].[evidence_files]([uploaded_by_user_id]);

CREATE NONCLUSTERED INDEX [observation_comments_author_user_id_idx] ON [dbo].[observation_comments]([author_user_id]);

CREATE NONCLUSTERED INDEX [observation_comments_action_plan_id_idx] ON [dbo].[observation_comments]([action_plan_id]);

CREATE NONCLUSTERED INDEX [observation_comments_deleted_at_idx] ON [dbo].[observation_comments]([deleted_at]);

CREATE NONCLUSTERED INDEX [observation_comments_observation_id_created_at_idx] ON [dbo].[observation_comments]([observation_id], [created_at]);

CREATE NONCLUSTERED INDEX [observation_comments_progress_evaluation_id_idx] ON [dbo].[observation_comments]([progress_evaluation_id]);

CREATE NONCLUSTERED INDEX [observation_comments_remediation_plan_id_idx] ON [dbo].[observation_comments]([remediation_plan_id]);

CREATE NONCLUSTERED INDEX [observation_comments_visibility_idx] ON [dbo].[observation_comments]([visibility]);

CREATE NONCLUSTERED INDEX [progress_review_history_created_at_idx] ON [dbo].[progress_review_history]([created_at]);

CREATE NONCLUSTERED INDEX [progress_review_history_progress_evaluation_id_created_at_idx] ON [dbo].[progress_review_history]([progress_evaluation_id], [created_at]);

CREATE NONCLUSTERED INDEX [progress_review_history_user_id_idx] ON [dbo].[progress_review_history]([user_id]);

CREATE NONCLUSTERED INDEX [workflow_definitions_process_type_status_idx] ON [dbo].[workflow_definitions]([process_type], [status]);

CREATE NONCLUSTERED INDEX [workflow_definitions_status_updated_at_idx] ON [dbo].[workflow_definitions]([status], [updated_at]);

CREATE NONCLUSTERED INDEX [workflow_definitions_created_by_id_idx] ON [dbo].[workflow_definitions]([created_by_id]);

CREATE NONCLUSTERED INDEX [workflow_versions_workflow_definition_id_status_idx] ON [dbo].[workflow_versions]([workflow_definition_id], [status]);

CREATE NONCLUSTERED INDEX [workflow_versions_status_published_at_idx] ON [dbo].[workflow_versions]([status], [published_at]);

CREATE NONCLUSTERED INDEX [workflow_versions_created_by_id_idx] ON [dbo].[workflow_versions]([created_by_id]);

CREATE NONCLUSTERED INDEX [workflow_versions_published_by_id_idx] ON [dbo].[workflow_versions]([published_by_id]);

CREATE NONCLUSTERED INDEX [workflow_nodes_workflow_version_id_type_idx] ON [dbo].[workflow_nodes]([workflow_version_id], [type]);

CREATE NONCLUSTERED INDEX [workflow_transitions_workflow_version_id_priority_idx] ON [dbo].[workflow_transitions]([workflow_version_id], [priority]);

CREATE NONCLUSTERED INDEX [workflow_transitions_source_node_id_priority_idx] ON [dbo].[workflow_transitions]([source_node_id], [priority]);

CREATE NONCLUSTERED INDEX [workflow_transitions_target_node_id_idx] ON [dbo].[workflow_transitions]([target_node_id]);

CREATE NONCLUSTERED INDEX [workflow_transitions_condition_group_id_idx] ON [dbo].[workflow_transitions]([condition_group_id]);

CREATE NONCLUSTERED INDEX [workflow_condition_groups_workflow_version_id_idx] ON [dbo].[workflow_condition_groups]([workflow_version_id]);

CREATE NONCLUSTERED INDEX [workflow_conditions_condition_group_id_sequence_idx] ON [dbo].[workflow_conditions]([condition_group_id], [sequence]);

CREATE NONCLUSTERED INDEX [workflow_instances_workflow_definition_id_status_idx] ON [dbo].[workflow_instances]([workflow_definition_id], [status]);

CREATE NONCLUSTERED INDEX [workflow_instances_workflow_version_id_status_idx] ON [dbo].[workflow_instances]([workflow_version_id], [status]);

CREATE NONCLUSTERED INDEX [workflow_instances_process_type_status_idx] ON [dbo].[workflow_instances]([process_type], [status]);

CREATE NONCLUSTERED INDEX [workflow_instances_entity_type_entity_id_idx] ON [dbo].[workflow_instances]([entity_type], [entity_id]);

CREATE NONCLUSTERED INDEX [workflow_instances_current_node_id_status_idx] ON [dbo].[workflow_instances]([current_node_id], [status]);

CREATE NONCLUSTERED INDEX [workflow_instances_started_by_id_idx] ON [dbo].[workflow_instances]([started_by_id]);

CREATE NONCLUSTERED INDEX [workflow_tasks_assigned_user_id_status_due_at_idx] ON [dbo].[workflow_tasks]([assigned_user_id], [status], [due_at]);

CREATE NONCLUSTERED INDEX [workflow_tasks_assigned_role_id_status_idx] ON [dbo].[workflow_tasks]([assigned_role_id], [status]);

CREATE NONCLUSTERED INDEX [workflow_tasks_assigned_area_id_status_idx] ON [dbo].[workflow_tasks]([assigned_area_id], [status]);

CREATE NONCLUSTERED INDEX [workflow_tasks_workflow_instance_id_status_idx] ON [dbo].[workflow_tasks]([workflow_instance_id], [status]);

CREATE NONCLUSTERED INDEX [workflow_tasks_node_id_idx] ON [dbo].[workflow_tasks]([node_id]);

CREATE NONCLUSTERED INDEX [workflow_tasks_status_due_at_idx] ON [dbo].[workflow_tasks]([status], [due_at]);

CREATE NONCLUSTERED INDEX [workflow_transition_logs_workflow_instance_id_created_at_idx] ON [dbo].[workflow_transition_logs]([workflow_instance_id], [created_at]);

CREATE NONCLUSTERED INDEX [workflow_transition_logs_source_node_id_idx] ON [dbo].[workflow_transition_logs]([source_node_id]);

CREATE NONCLUSTERED INDEX [workflow_transition_logs_target_node_id_idx] ON [dbo].[workflow_transition_logs]([target_node_id]);

CREATE NONCLUSTERED INDEX [workflow_transition_logs_performed_by_id_idx] ON [dbo].[workflow_transition_logs]([performed_by_id]);

CREATE NONCLUSTERED INDEX [workflow_transition_logs_workflow_instance_id_event_type_cre_idx] ON [dbo].[workflow_transition_logs]([workflow_instance_id], [event_type], [created_at]);

CREATE NONCLUSTERED INDEX [workflow_timers_status_execute_at_idx] ON [dbo].[workflow_timers]([status], [execute_at]);

CREATE NONCLUSTERED INDEX [workflow_timers_workflow_instance_id_status_idx] ON [dbo].[workflow_timers]([workflow_instance_id], [status]);

CREATE NONCLUSTERED INDEX [workflow_timers_workflow_task_id_status_idx] ON [dbo].[workflow_timers]([workflow_task_id], [status]);

ALTER TABLE [dbo].[user_roles] ADD CONSTRAINT [user_roles_user_id_fkey] FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE [dbo].[user_roles] ADD CONSTRAINT [user_roles_role_id_fkey] FOREIGN KEY ([role_id]) REFERENCES [dbo].[roles]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE [dbo].[role_permissions] ADD CONSTRAINT [role_permissions_role_id_fkey] FOREIGN KEY ([role_id]) REFERENCES [dbo].[roles]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE [dbo].[role_permissions] ADD CONSTRAINT [role_permissions_permission_id_fkey] FOREIGN KEY ([permission_id]) REFERENCES [dbo].[permissions]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE [dbo].[invitations] ADD CONSTRAINT [invitations_role_id_fkey] FOREIGN KEY ([role_id]) REFERENCES [dbo].[roles]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[invitations] ADD CONSTRAINT [invitations_created_by_fkey] FOREIGN KEY ([created_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[notifications] ADD CONSTRAINT [notifications_user_id_fkey] FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[notification_deliveries] ADD CONSTRAINT [notification_deliveries_notification_id_fkey] FOREIGN KEY ([notification_id]) REFERENCES [dbo].[notifications]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE [dbo].[notification_deliveries] ADD CONSTRAINT [notification_deliveries_recipient_user_id_fkey] FOREIGN KEY ([recipient_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE [dbo].[entity_activities] ADD CONSTRAINT [entity_activities_observation_id_fkey] FOREIGN KEY ([observation_id]) REFERENCES [dbo].[observations]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE [dbo].[entity_activities] ADD CONSTRAINT [entity_activities_actor_user_id_fkey] FOREIGN KEY ([actor_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[scheduled_job_executions] ADD CONSTRAINT [scheduled_job_executions_triggered_by_user_id_fkey] FOREIGN KEY ([triggered_by_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE [dbo].[activity_logs] ADD CONSTRAINT [activity_logs_user_id_fkey] FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE [dbo].[audit_logs] ADD CONSTRAINT [audit_logs_changed_by_fkey] FOREIGN KEY ([changed_by]) REFERENCES [dbo].[users]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE [dbo].[areas] ADD CONSTRAINT [areas_manager_user_id_fkey] FOREIGN KEY ([manager_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE [dbo].[audit_reports] ADD CONSTRAINT [audit_reports_created_by_user_id_fkey] FOREIGN KEY ([created_by_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[observations] ADD CONSTRAINT [observations_audit_report_id_fkey] FOREIGN KEY ([audit_report_id]) REFERENCES [dbo].[audit_reports]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[observations] ADD CONSTRAINT [observations_main_observation_id_fkey] FOREIGN KEY ([main_observation_id]) REFERENCES [dbo].[observation_dictionary]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[observations] ADD CONSTRAINT [observations_risk_level_id_fkey] FOREIGN KEY ([risk_level_id]) REFERENCES [dbo].[risk_levels]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[observations] ADD CONSTRAINT [observations_status_id_fkey] FOREIGN KEY ([status_id]) REFERENCES [dbo].[observation_statuses]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[observations] ADD CONSTRAINT [observations_auditor_user_id_fkey] FOREIGN KEY ([auditor_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[observation_risks] ADD CONSTRAINT [observation_risks_observation_id_fkey] FOREIGN KEY ([observation_id]) REFERENCES [dbo].[observations]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE [dbo].[observation_risks] ADD CONSTRAINT [observation_risks_risk_id_fkey] FOREIGN KEY ([risk_id]) REFERENCES [dbo].[risks]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[observation_areas] ADD CONSTRAINT [observation_areas_observation_id_fkey] FOREIGN KEY ([observation_id]) REFERENCES [dbo].[observations]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE [dbo].[observation_areas] ADD CONSTRAINT [observation_areas_area_id_fkey] FOREIGN KEY ([area_id]) REFERENCES [dbo].[areas]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[observation_areas] ADD CONSTRAINT [observation_areas_process_owner_user_id_fkey] FOREIGN KEY ([process_owner_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[observation_areas] ADD CONSTRAINT [observation_areas_area_responsible_user_id_fkey] FOREIGN KEY ([area_responsible_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[remediation_plans] ADD CONSTRAINT [remediation_plans_observation_id_fkey] FOREIGN KEY ([observation_id]) REFERENCES [dbo].[observations]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE [dbo].[remediation_plans] ADD CONSTRAINT [remediation_plans_area_id_fkey] FOREIGN KEY ([area_id]) REFERENCES [dbo].[areas]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[remediation_plans] ADD CONSTRAINT [remediation_plans_owner_user_id_fkey] FOREIGN KEY ([owner_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[remediation_plans] ADD CONSTRAINT [remediation_plans_approved_by_user_id_fkey] FOREIGN KEY ([approved_by_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[remediation_plans] ADD CONSTRAINT [remediation_plans_returned_by_user_id_fkey] FOREIGN KEY ([returned_by_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[remediation_plans] ADD CONSTRAINT [remediation_plans_created_by_user_id_fkey] FOREIGN KEY ([created_by_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[action_plans] ADD CONSTRAINT [action_plans_remediation_plan_id_fkey] FOREIGN KEY ([remediation_plan_id]) REFERENCES [dbo].[remediation_plans]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[action_plans] ADD CONSTRAINT [action_plans_observation_id_fkey] FOREIGN KEY ([observation_id]) REFERENCES [dbo].[observations]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE [dbo].[action_plans] ADD CONSTRAINT [action_plans_observation_area_id_fkey] FOREIGN KEY ([observation_area_id]) REFERENCES [dbo].[observation_areas]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[action_plans] ADD CONSTRAINT [action_plans_responsible_user_id_fkey] FOREIGN KEY ([responsible_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[deadline_extension_requests] ADD CONSTRAINT [deadline_extension_requests_observation_id_fkey] FOREIGN KEY ([observation_id]) REFERENCES [dbo].[observations]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE [dbo].[deadline_extension_requests] ADD CONSTRAINT [deadline_extension_requests_action_plan_id_fkey] FOREIGN KEY ([action_plan_id]) REFERENCES [dbo].[action_plans]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[deadline_extension_requests] ADD CONSTRAINT [deadline_extension_requests_observation_area_id_fkey] FOREIGN KEY ([observation_area_id]) REFERENCES [dbo].[observation_areas]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[deadline_extension_requests] ADD CONSTRAINT [deadline_extension_requests_requested_by_user_id_fkey] FOREIGN KEY ([requested_by_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[deadline_extension_requests] ADD CONSTRAINT [deadline_extension_requests_manager_reviewer_id_fkey] FOREIGN KEY ([manager_reviewer_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[deadline_extension_requests] ADD CONSTRAINT [deadline_extension_requests_audit_reviewer_id_fkey] FOREIGN KEY ([audit_reviewer_id]) REFERENCES [dbo].[users]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE [dbo].[deadline_extension_attachments] ADD CONSTRAINT [deadline_extension_attachments_extension_request_id_fkey] FOREIGN KEY ([extension_request_id]) REFERENCES [dbo].[deadline_extension_requests]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE [dbo].[deadline_extension_attachments] ADD CONSTRAINT [deadline_extension_attachments_evidence_file_id_fkey] FOREIGN KEY ([evidence_file_id]) REFERENCES [dbo].[evidence_files]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[sessions] ADD CONSTRAINT [sessions_user_id_fkey] FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE [dbo].[accounts] ADD CONSTRAINT [accounts_user_id_fkey] FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE [dbo].[progress_evaluations] ADD CONSTRAINT [progress_evaluations_action_plan_id_fkey] FOREIGN KEY ([action_plan_id]) REFERENCES [dbo].[action_plans]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE [dbo].[progress_evaluations] ADD CONSTRAINT [progress_evaluations_submitted_by_user_id_fkey] FOREIGN KEY ([submitted_by_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[progress_evaluations] ADD CONSTRAINT [progress_evaluations_reviewed_by_user_id_fkey] FOREIGN KEY ([reviewed_by_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[evidence_files] ADD CONSTRAINT [evidence_files_observation_id_fkey] FOREIGN KEY ([observation_id]) REFERENCES [dbo].[observations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[evidence_files] ADD CONSTRAINT [evidence_files_action_plan_id_fkey] FOREIGN KEY ([action_plan_id]) REFERENCES [dbo].[action_plans]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE [dbo].[evidence_files] ADD CONSTRAINT [evidence_files_progress_evaluation_id_fkey] FOREIGN KEY ([progress_evaluation_id]) REFERENCES [dbo].[progress_evaluations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[evidence_files] ADD CONSTRAINT [evidence_files_uploaded_by_user_id_fkey] FOREIGN KEY ([uploaded_by_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[observation_comments] ADD CONSTRAINT [observation_comments_observation_id_fkey] FOREIGN KEY ([observation_id]) REFERENCES [dbo].[observations]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE [dbo].[observation_comments] ADD CONSTRAINT [observation_comments_remediation_plan_id_fkey] FOREIGN KEY ([remediation_plan_id]) REFERENCES [dbo].[remediation_plans]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[observation_comments] ADD CONSTRAINT [observation_comments_action_plan_id_fkey] FOREIGN KEY ([action_plan_id]) REFERENCES [dbo].[action_plans]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[observation_comments] ADD CONSTRAINT [observation_comments_progress_evaluation_id_fkey] FOREIGN KEY ([progress_evaluation_id]) REFERENCES [dbo].[progress_evaluations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[observation_comments] ADD CONSTRAINT [observation_comments_author_user_id_fkey] FOREIGN KEY ([author_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[progress_review_history] ADD CONSTRAINT [progress_review_history_progress_evaluation_id_fkey] FOREIGN KEY ([progress_evaluation_id]) REFERENCES [dbo].[progress_evaluations]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE [dbo].[progress_review_history] ADD CONSTRAINT [progress_review_history_user_id_fkey] FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[workflow_definitions] ADD CONSTRAINT [workflow_definitions_active_version_id_fkey] FOREIGN KEY ([active_version_id]) REFERENCES [dbo].[workflow_versions]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE [dbo].[workflow_definitions] ADD CONSTRAINT [workflow_definitions_created_by_id_fkey] FOREIGN KEY ([created_by_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[workflow_versions] ADD CONSTRAINT [workflow_versions_workflow_definition_id_fkey] FOREIGN KEY ([workflow_definition_id]) REFERENCES [dbo].[workflow_definitions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[workflow_versions] ADD CONSTRAINT [workflow_versions_created_by_id_fkey] FOREIGN KEY ([created_by_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[workflow_versions] ADD CONSTRAINT [workflow_versions_published_by_id_fkey] FOREIGN KEY ([published_by_id]) REFERENCES [dbo].[users]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE [dbo].[workflow_nodes] ADD CONSTRAINT [workflow_nodes_workflow_version_id_fkey] FOREIGN KEY ([workflow_version_id]) REFERENCES [dbo].[workflow_versions]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE [dbo].[workflow_transitions] ADD CONSTRAINT [workflow_transitions_workflow_version_id_fkey] FOREIGN KEY ([workflow_version_id]) REFERENCES [dbo].[workflow_versions]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE [dbo].[workflow_transitions] ADD CONSTRAINT [workflow_transitions_source_node_id_fkey] FOREIGN KEY ([source_node_id]) REFERENCES [dbo].[workflow_nodes]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[workflow_transitions] ADD CONSTRAINT [workflow_transitions_target_node_id_fkey] FOREIGN KEY ([target_node_id]) REFERENCES [dbo].[workflow_nodes]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[workflow_transitions] ADD CONSTRAINT [workflow_transitions_condition_group_id_fkey] FOREIGN KEY ([condition_group_id]) REFERENCES [dbo].[workflow_condition_groups]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[workflow_condition_groups] ADD CONSTRAINT [workflow_condition_groups_workflow_version_id_fkey] FOREIGN KEY ([workflow_version_id]) REFERENCES [dbo].[workflow_versions]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE [dbo].[workflow_conditions] ADD CONSTRAINT [workflow_conditions_condition_group_id_fkey] FOREIGN KEY ([condition_group_id]) REFERENCES [dbo].[workflow_condition_groups]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE [dbo].[workflow_instances] ADD CONSTRAINT [workflow_instances_workflow_definition_id_fkey] FOREIGN KEY ([workflow_definition_id]) REFERENCES [dbo].[workflow_definitions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[workflow_instances] ADD CONSTRAINT [workflow_instances_workflow_version_id_fkey] FOREIGN KEY ([workflow_version_id]) REFERENCES [dbo].[workflow_versions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[workflow_instances] ADD CONSTRAINT [workflow_instances_current_node_id_fkey] FOREIGN KEY ([current_node_id]) REFERENCES [dbo].[workflow_nodes]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE [dbo].[workflow_instances] ADD CONSTRAINT [workflow_instances_started_by_id_fkey] FOREIGN KEY ([started_by_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[workflow_tasks] ADD CONSTRAINT [workflow_tasks_workflow_instance_id_fkey] FOREIGN KEY ([workflow_instance_id]) REFERENCES [dbo].[workflow_instances]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[workflow_tasks] ADD CONSTRAINT [workflow_tasks_node_id_fkey] FOREIGN KEY ([node_id]) REFERENCES [dbo].[workflow_nodes]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[workflow_tasks] ADD CONSTRAINT [workflow_tasks_assigned_user_id_fkey] FOREIGN KEY ([assigned_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE [dbo].[workflow_tasks] ADD CONSTRAINT [workflow_tasks_assigned_role_id_fkey] FOREIGN KEY ([assigned_role_id]) REFERENCES [dbo].[roles]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE [dbo].[workflow_tasks] ADD CONSTRAINT [workflow_tasks_assigned_area_id_fkey] FOREIGN KEY ([assigned_area_id]) REFERENCES [dbo].[areas]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[workflow_transition_logs] ADD CONSTRAINT [workflow_transition_logs_workflow_instance_id_fkey] FOREIGN KEY ([workflow_instance_id]) REFERENCES [dbo].[workflow_instances]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[workflow_transition_logs] ADD CONSTRAINT [workflow_transition_logs_source_node_id_fkey] FOREIGN KEY ([source_node_id]) REFERENCES [dbo].[workflow_nodes]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[workflow_transition_logs] ADD CONSTRAINT [workflow_transition_logs_target_node_id_fkey] FOREIGN KEY ([target_node_id]) REFERENCES [dbo].[workflow_nodes]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[workflow_transition_logs] ADD CONSTRAINT [workflow_transition_logs_performed_by_id_fkey] FOREIGN KEY ([performed_by_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[workflow_timers] ADD CONSTRAINT [workflow_timers_workflow_instance_id_fkey] FOREIGN KEY ([workflow_instance_id]) REFERENCES [dbo].[workflow_instances]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[workflow_timers] ADD CONSTRAINT [workflow_timers_workflow_task_id_fkey] FOREIGN KEY ([workflow_task_id]) REFERENCES [dbo].[workflow_tasks]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;
