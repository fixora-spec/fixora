/*
    FIXORA
    Archivo: database/001_authentication_schema.sql

    Reinicia y crea el esquema de autenticación para desarrollo local.

    IMPORTANTE:
    - Elimina las cuentas, sesiones, códigos y notificaciones de prueba existentes.
    - Debe ejecutarse con una cuenta administradora de SQL Server.
    - La contraseña del login fixora_app debe coincidir con SQL_SERVER_PASSWORD
      dentro de .env.local.
*/

SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
SET QUOTED_IDENTIFIER ON;
GO

USE [master];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

IF DB_ID(N'Fixora') IS NULL
BEGIN
    CREATE DATABASE [Fixora];
END;
GO

DECLARE @LoginPassword NVARCHAR(128) =
    N'FixoraLocal_2026!Q7m#2vR9';

DECLARE @LoginSql NVARCHAR(MAX);

IF NOT EXISTS
(
    SELECT 1
    FROM sys.server_principals
    WHERE [name] = N'fixora_app'
)
BEGIN
    SET @LoginSql =
        N'CREATE LOGIN [fixora_app]
          WITH PASSWORD = N'''
        + REPLACE(@LoginPassword, N'''', N'''''')
        + N''',
          CHECK_POLICY = ON,
          CHECK_EXPIRATION = OFF,
          DEFAULT_DATABASE = [Fixora];';
END
ELSE
BEGIN
    SET @LoginSql =
        N'ALTER LOGIN [fixora_app]
          WITH PASSWORD = N'''
        + REPLACE(@LoginPassword, N'''', N'''''')
        + N''',
          CHECK_POLICY = ON,
          CHECK_EXPIRATION = OFF,
          DEFAULT_DATABASE = [Fixora];';
END;

EXEC sys.sp_executesql @LoginSql;
GO

USE [Fixora];
GO

IF DATABASE_PRINCIPAL_ID(N'fixora_app') IS NULL
BEGIN
    CREATE USER [fixora_app]
        FOR LOGIN [fixora_app]
        WITH DEFAULT_SCHEMA = [dbo];
END
ELSE
BEGIN
    ALTER USER [fixora_app]
        WITH LOGIN = [fixora_app];
END;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    /* ========================================================
       REINICIO DEL ESQUEMA DE AUTENTICACIÓN
       ======================================================== */

    IF OBJECT_ID(N'dbo.auth_sessions', N'U') IS NOT NULL
        DROP TABLE dbo.auth_sessions;

    IF OBJECT_ID(N'dbo.auth_verification_codes', N'U') IS NOT NULL
        DROP TABLE dbo.auth_verification_codes;

    IF OBJECT_ID(N'dbo.notifications', N'U') IS NOT NULL
        DROP TABLE dbo.notifications;

    IF OBJECT_ID(N'dbo.auth_audit_events', N'U') IS NOT NULL
        DROP TABLE dbo.auth_audit_events;

    IF OBJECT_ID(N'dbo.auth_rate_limits', N'U') IS NOT NULL
        DROP TABLE dbo.auth_rate_limits;

    IF OBJECT_ID(N'dbo.accounts', N'U') IS NOT NULL
        DROP TABLE dbo.accounts;

    /* ========================================================
       1. CUENTAS
       ======================================================== */

    CREATE TABLE dbo.accounts
    (
        account_id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_accounts PRIMARY KEY,

        role VARCHAR(20) NOT NULL
            CONSTRAINT DF_accounts_role DEFAULT 'USER',

        status VARCHAR(30) NOT NULL
            CONSTRAINT DF_accounts_status
            DEFAULT 'PENDING_VERIFICATION',

        first_names NVARCHAR(100) NOT NULL,
        last_names NVARCHAR(150) NOT NULL,

        username NVARCHAR(40) NOT NULL,
        username_normalized NVARCHAR(40) NOT NULL,
        username_skeleton NVARCHAR(40) NOT NULL,

        email NVARCHAR(320) NOT NULL,
        email_normalized NVARCHAR(320) NOT NULL,

        password_hash VARCHAR(512) NOT NULL,
        avatar_url NVARCHAR(2048) NULL,

        email_verified_at DATETIME2(7) NULL,

        failed_sign_in_attempts INT NOT NULL
            CONSTRAINT DF_accounts_failed_sign_in_attempts
            DEFAULT 0,

        locked_until DATETIME2(7) NULL,
        last_sign_in_at DATETIME2(7) NULL,

        created_at DATETIME2(7) NOT NULL
            CONSTRAINT DF_accounts_created_at
            DEFAULT SYSUTCDATETIME(),

        updated_at DATETIME2(7) NOT NULL
            CONSTRAINT DF_accounts_updated_at
            DEFAULT SYSUTCDATETIME(),

        row_version ROWVERSION NOT NULL,

        CONSTRAINT CK_accounts_role
            CHECK
            (
                role IN
                (
                    'USER',
                    'ADMIN'
                )
            ),

        CONSTRAINT CK_accounts_status
            CHECK
            (
                status IN
                (
                    'PENDING_VERIFICATION',
                    'ACTIVE',
                    'DISABLED',
                    'LOCKED'
                )
            ),

        CONSTRAINT CK_accounts_failed_sign_in_attempts
            CHECK
            (
                failed_sign_in_attempts >= 0
            ),

        CONSTRAINT CK_accounts_username_length
            CHECK
            (
                LEN(username_normalized)
                BETWEEN 3 AND 40
            ),

        CONSTRAINT CK_accounts_username_skeleton_length
            CHECK
            (
                LEN(username_skeleton)
                BETWEEN 1 AND 40
            ),

        CONSTRAINT CK_accounts_email_length
            CHECK
            (
                LEN(email_normalized)
                BETWEEN 5 AND 320
            )
    );

    CREATE UNIQUE INDEX UX_accounts_username_normalized
        ON dbo.accounts(username_normalized);

    CREATE UNIQUE INDEX UX_accounts_username_skeleton
        ON dbo.accounts(username_skeleton);

    CREATE UNIQUE INDEX UX_accounts_email_normalized
        ON dbo.accounts(email_normalized);

    CREATE INDEX IX_accounts_role_status
        ON dbo.accounts(role, status);

    /* ========================================================
       2. CÓDIGOS DE VERIFICACIÓN
       ======================================================== */

    CREATE TABLE dbo.auth_verification_codes
    (
        verification_id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_auth_verification_codes
            PRIMARY KEY,

        account_id UNIQUEIDENTIFIER NOT NULL,

        purpose VARCHAR(40) NOT NULL,
        code_hash CHAR(64) NOT NULL,

        attempts_used INT NOT NULL
            CONSTRAINT DF_auth_verification_attempts_used
            DEFAULT 0,

        maximum_attempts INT NOT NULL,

        resend_available_at DATETIME2(7) NOT NULL,
        created_at DATETIME2(7) NOT NULL,
        expires_at DATETIME2(7) NOT NULL,
        consumed_at DATETIME2(7) NULL,

        CONSTRAINT FK_auth_verification_codes_account
            FOREIGN KEY (account_id)
            REFERENCES dbo.accounts(account_id),

        CONSTRAINT CK_auth_verification_codes_purpose
            CHECK
            (
                purpose IN
                (
                    'EMAIL_VERIFICATION',
                    'PASSWORD_RESET',
                    'ADMIN_ACTIVATION'
                )
            ),

        CONSTRAINT CK_auth_verification_codes_attempts
            CHECK
            (
                attempts_used >= 0
                AND maximum_attempts
                    BETWEEN 1 AND 20
                AND attempts_used
                    <= maximum_attempts
            ),

        CONSTRAINT CK_auth_verification_codes_dates
            CHECK
            (
                expires_at > created_at
                AND resend_available_at
                    >= created_at
            )
    );

    CREATE UNIQUE INDEX UX_auth_verification_codes_hash
        ON dbo.auth_verification_codes(code_hash);

    CREATE INDEX IX_auth_verification_codes_account_purpose_created
        ON dbo.auth_verification_codes
        (
            account_id,
            purpose,
            created_at DESC
        )
        INCLUDE
        (
            verification_id,
            code_hash,
            attempts_used,
            maximum_attempts,
            resend_available_at,
            expires_at,
            consumed_at
        );

    /* ========================================================
       3. SESIONES
       ======================================================== */

    CREATE TABLE dbo.auth_sessions
    (
        session_id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_auth_sessions
            PRIMARY KEY,

        account_id UNIQUEIDENTIFIER NOT NULL,
        token_hash CHAR(64) NOT NULL,

        ip_address NVARCHAR(45) NULL,
        user_agent NVARCHAR(512) NULL,

        created_at DATETIME2(7) NOT NULL,
        expires_at DATETIME2(7) NOT NULL,
        last_seen_at DATETIME2(7) NOT NULL,

        revoked_at DATETIME2(7) NULL,
        revocation_reason NVARCHAR(100) NULL,

        CONSTRAINT FK_auth_sessions_account
            FOREIGN KEY (account_id)
            REFERENCES dbo.accounts(account_id),

        CONSTRAINT CK_auth_sessions_dates
            CHECK
            (
                expires_at > created_at
            )
    );

    CREATE UNIQUE INDEX UX_auth_sessions_token_hash
        ON dbo.auth_sessions(token_hash);

    CREATE INDEX IX_auth_sessions_account_expires
        ON dbo.auth_sessions
        (
            account_id,
            expires_at
        )
        INCLUDE
        (
            session_id,
            last_seen_at,
            revoked_at,
            revocation_reason
        );

    /* ========================================================
       4. NOTIFICACIONES
       ======================================================== */

    CREATE TABLE dbo.notifications
    (
        notification_id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_notifications
            PRIMARY KEY,

        account_id UNIQUEIDENTIFIER NOT NULL,

        notification_type VARCHAR(80) NOT NULL,
        title_key NVARCHAR(200) NOT NULL,
        message_key NVARCHAR(200) NOT NULL,

        metadata_json NVARCHAR(MAX) NULL,
        created_at DATETIME2(7) NOT NULL,
        read_at DATETIME2(7) NULL,

        CONSTRAINT FK_notifications_account
            FOREIGN KEY (account_id)
            REFERENCES dbo.accounts(account_id),

        CONSTRAINT CK_notifications_metadata_json
            CHECK
            (
                metadata_json IS NULL
                OR ISJSON(metadata_json) = 1
            )
    );

    CREATE INDEX IX_notifications_account_created
        ON dbo.notifications
        (
            account_id,
            created_at DESC
        )
        INCLUDE
        (
            notification_id,
            notification_type,
            title_key,
            message_key,
            read_at
        );

    CREATE INDEX IX_notifications_account_unread
        ON dbo.notifications
        (
            account_id,
            created_at DESC
        )
        WHERE read_at IS NULL;

    /* ========================================================
       5. LÍMITES DE INTENTOS
       ======================================================== */

    CREATE TABLE dbo.auth_rate_limits
    (
        rate_limit_id BIGINT IDENTITY(1, 1) NOT NULL
            CONSTRAINT PK_auth_rate_limits
            PRIMARY KEY,

        action_name NVARCHAR(80) NOT NULL,
        identifier_hash CHAR(64) NOT NULL,

        attempt_count INT NOT NULL,
        window_started_at DATETIME2(7) NOT NULL,
        blocked_until DATETIME2(7) NULL,

        created_at DATETIME2(7) NOT NULL,
        updated_at DATETIME2(7) NOT NULL,

        CONSTRAINT CK_auth_rate_limits_attempt_count
            CHECK
            (
                attempt_count >= 0
            )
    );

    CREATE UNIQUE INDEX UX_auth_rate_limits_action_identifier
        ON dbo.auth_rate_limits
        (
            action_name,
            identifier_hash
        );

    CREATE INDEX IX_auth_rate_limits_cleanup
        ON dbo.auth_rate_limits
        (
            window_started_at,
            blocked_until
        );

    /* ========================================================
       6. AUDITORÍA
       ======================================================== */

    CREATE TABLE dbo.auth_audit_events
    (
        audit_event_id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_auth_audit_events
            PRIMARY KEY,

        account_id UNIQUEIDENTIFIER NULL,
        event_type VARCHAR(100) NOT NULL,
        successful BIT NOT NULL,

        ip_address NVARCHAR(45) NULL,
        user_agent NVARCHAR(512) NULL,
        metadata_json NVARCHAR(MAX) NULL,

        created_at DATETIME2(7) NOT NULL,

        CONSTRAINT FK_auth_audit_events_account
            FOREIGN KEY (account_id)
            REFERENCES dbo.accounts(account_id),

        CONSTRAINT CK_auth_audit_events_metadata_json
            CHECK
            (
                metadata_json IS NULL
                OR ISJSON(metadata_json) = 1
            )
    );

    CREATE INDEX IX_auth_audit_events_account_created
        ON dbo.auth_audit_events
        (
            account_id,
            created_at DESC
        );

    CREATE INDEX IX_auth_audit_events_type_created
        ON dbo.auth_audit_events
        (
            event_type,
            created_at DESC
        );

    /* ========================================================
       7. PERMISOS
       ======================================================== */

    GRANT SELECT, INSERT, UPDATE
        ON dbo.accounts
        TO fixora_app;

    GRANT SELECT, INSERT, UPDATE, DELETE
        ON dbo.auth_verification_codes
        TO fixora_app;

    GRANT SELECT, INSERT, UPDATE, DELETE
        ON dbo.auth_sessions
        TO fixora_app;

    GRANT SELECT, INSERT, UPDATE
        ON dbo.notifications
        TO fixora_app;

    GRANT SELECT, INSERT, UPDATE, DELETE
        ON dbo.auth_rate_limits
        TO fixora_app;

    GRANT SELECT, INSERT
        ON dbo.auth_audit_events
        TO fixora_app;

    COMMIT TRANSACTION;

    PRINT N'FIXORA: base de datos y esquema de autenticación creados correctamente.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
    BEGIN
        ROLLBACK TRANSACTION;
    END;

    THROW;
END CATCH;
GO