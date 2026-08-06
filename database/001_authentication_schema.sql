/*
    FIXORA
    Archivo: database/001_authentication_schema.sql

    Crea y valida el esquema base de autenticación.

    SEGURIDAD:
    - No contiene ni modifica contraseñas.
    - No elimina tablas ni datos existentes.
    - Puede ejecutarse varias veces.
    - Si una tabla existente tiene una estructura incompleta, detiene la
      ejecución en lugar de destruirla o reconstruirla automáticamente.

    REQUISITOS:
    - Ejecutar antes database/000_create_fixora_database.sql.
    - Ejecutar con una cuenta administradora de la base Fixora.
    - Ejecutar después database/002_admin_access_expiration.sql cuando se
      necesite la vigencia de acceso para administradores.
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
    THROW 50010,
        N'No existe la base de datos Fixora. Ejecute primero database/000_create_fixora_database.sql.',
        1;
END;
GO

USE [Fixora];
GO

IF DATABASE_PRINCIPAL_ID(N'fixora_app') IS NULL
BEGIN
    THROW 50011,
        N'No existe el usuario fixora_app en Fixora. Ejecute primero database/000_create_fixora_database.sql.',
        1;
END;
GO

IF
    IS_ROLEMEMBER(N'db_owner', N'fixora_app') = 1
    OR IS_ROLEMEMBER(N'db_securityadmin', N'fixora_app') = 1
    OR IS_ROLEMEMBER(N'db_accessadmin', N'fixora_app') = 1
    OR IS_ROLEMEMBER(N'db_ddladmin', N'fixora_app') = 1
BEGIN
    THROW 50012,
        N'El usuario fixora_app no debe pertenecer a roles administrativos de la base de datos.',
        1;
END;
GO

/* ============================================================
   VALIDAR TABLAS EXISTENTES ANTES DE CAMBIAR EL ESQUEMA
   ============================================================ */

DECLARE @RequiredColumns TABLE
(
    table_name SYSNAME NOT NULL,
    column_name SYSNAME NOT NULL
);

INSERT INTO @RequiredColumns
(
    table_name,
    column_name
)
VALUES
    (N'accounts', N'account_id'),
    (N'accounts', N'role'),
    (N'accounts', N'status'),
    (N'accounts', N'first_names'),
    (N'accounts', N'last_names'),
    (N'accounts', N'username'),
    (N'accounts', N'username_normalized'),
    (N'accounts', N'username_skeleton'),
    (N'accounts', N'email'),
    (N'accounts', N'email_normalized'),
    (N'accounts', N'password_hash'),
    (N'accounts', N'avatar_url'),
    (N'accounts', N'email_verified_at'),
    (N'accounts', N'failed_sign_in_attempts'),
    (N'accounts', N'locked_until'),
    (N'accounts', N'last_sign_in_at'),
    (N'accounts', N'created_at'),
    (N'accounts', N'updated_at'),
    (N'accounts', N'row_version'),

    (N'auth_verification_codes', N'verification_id'),
    (N'auth_verification_codes', N'account_id'),
    (N'auth_verification_codes', N'purpose'),
    (N'auth_verification_codes', N'code_hash'),
    (N'auth_verification_codes', N'attempts_used'),
    (N'auth_verification_codes', N'maximum_attempts'),
    (N'auth_verification_codes', N'resend_available_at'),
    (N'auth_verification_codes', N'created_at'),
    (N'auth_verification_codes', N'expires_at'),
    (N'auth_verification_codes', N'consumed_at'),

    (N'auth_sessions', N'session_id'),
    (N'auth_sessions', N'account_id'),
    (N'auth_sessions', N'token_hash'),
    (N'auth_sessions', N'ip_address'),
    (N'auth_sessions', N'user_agent'),
    (N'auth_sessions', N'created_at'),
    (N'auth_sessions', N'expires_at'),
    (N'auth_sessions', N'last_seen_at'),
    (N'auth_sessions', N'revoked_at'),
    (N'auth_sessions', N'revocation_reason'),

    (N'notifications', N'notification_id'),
    (N'notifications', N'account_id'),
    (N'notifications', N'notification_type'),
    (N'notifications', N'title_key'),
    (N'notifications', N'message_key'),
    (N'notifications', N'metadata_json'),
    (N'notifications', N'created_at'),
    (N'notifications', N'read_at'),

    (N'auth_rate_limits', N'rate_limit_id'),
    (N'auth_rate_limits', N'action_name'),
    (N'auth_rate_limits', N'identifier_hash'),
    (N'auth_rate_limits', N'attempt_count'),
    (N'auth_rate_limits', N'window_started_at'),
    (N'auth_rate_limits', N'blocked_until'),
    (N'auth_rate_limits', N'created_at'),
    (N'auth_rate_limits', N'updated_at'),

    (N'auth_audit_events', N'audit_event_id'),
    (N'auth_audit_events', N'account_id'),
    (N'auth_audit_events', N'event_type'),
    (N'auth_audit_events', N'successful'),
    (N'auth_audit_events', N'ip_address'),
    (N'auth_audit_events', N'user_agent'),
    (N'auth_audit_events', N'metadata_json'),
    (N'auth_audit_events', N'created_at');

DECLARE @MissingColumns NVARCHAR(MAX) = NULL;

SELECT
    @MissingColumns =
        CONCAT(
            COALESCE(@MissingColumns + N', ', N''),
            N'dbo.',
            QUOTENAME(required.table_name),
            N'.',
            QUOTENAME(required.column_name)
        )
FROM @RequiredColumns AS required
WHERE
    OBJECT_ID(N'dbo.' + required.table_name, N'U') IS NOT NULL
    AND COL_LENGTH(
        N'dbo.' + required.table_name,
        required.column_name
    ) IS NULL;

IF @MissingColumns IS NOT NULL
BEGIN
    DECLARE @MissingColumnsMessage NVARCHAR(2048) =
        LEFT(
            N'El esquema existente está incompleto. Faltan columnas: '
            + @MissingColumns
            + N'. Realice una copia de seguridad y cree una migración específica; este archivo no eliminará datos.',
            2048
        );

    THROW 50013,
        @MissingColumnsMessage,
        1;
END;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    /* ========================================================
       1. CUENTAS
       ======================================================== */

    IF OBJECT_ID(N'dbo.accounts', N'U') IS NULL
    BEGIN
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
                CHECK (role IN ('USER', 'ADMIN')),

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
                CHECK (failed_sign_in_attempts >= 0),

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
                ),

            CONSTRAINT CK_accounts_lock_state
                CHECK
                (
                    locked_until IS NULL
                    OR status IN ('LOCKED', 'ACTIVE')
                )
        );
    END;

    IF NOT EXISTS
    (
        SELECT 1
        FROM sys.indexes
        WHERE
            object_id = OBJECT_ID(N'dbo.accounts')
            AND [name] = N'UX_accounts_username_normalized'
    )
    BEGIN
        CREATE UNIQUE INDEX UX_accounts_username_normalized
            ON dbo.accounts(username_normalized);
    END;

    IF NOT EXISTS
    (
        SELECT 1
        FROM sys.indexes
        WHERE
            object_id = OBJECT_ID(N'dbo.accounts')
            AND [name] = N'UX_accounts_username_skeleton'
    )
    BEGIN
        CREATE UNIQUE INDEX UX_accounts_username_skeleton
            ON dbo.accounts(username_skeleton);
    END;

    IF NOT EXISTS
    (
        SELECT 1
        FROM sys.indexes
        WHERE
            object_id = OBJECT_ID(N'dbo.accounts')
            AND [name] = N'UX_accounts_email_normalized'
    )
    BEGIN
        CREATE UNIQUE INDEX UX_accounts_email_normalized
            ON dbo.accounts(email_normalized);
    END;

    IF NOT EXISTS
    (
        SELECT 1
        FROM sys.indexes
        WHERE
            object_id = OBJECT_ID(N'dbo.accounts')
            AND [name] = N'IX_accounts_role_status'
    )
    BEGIN
        CREATE INDEX IX_accounts_role_status
            ON dbo.accounts(role, status);
    END;

    /* ========================================================
       2. CÓDIGOS DE VERIFICACIÓN
       ======================================================== */

    IF OBJECT_ID(N'dbo.auth_verification_codes', N'U') IS NULL
    BEGIN
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
                    AND maximum_attempts BETWEEN 1 AND 20
                    AND attempts_used <= maximum_attempts
                ),

            CONSTRAINT CK_auth_verification_codes_dates
                CHECK
                (
                    expires_at > created_at
                    AND resend_available_at >= created_at
                    AND
                    (
                        consumed_at IS NULL
                        OR consumed_at >= created_at
                    )
                )
        );
    END;

    IF NOT EXISTS
    (
        SELECT 1
        FROM sys.indexes
        WHERE
            object_id = OBJECT_ID(N'dbo.auth_verification_codes')
            AND [name] = N'UX_auth_verification_codes_hash'
    )
    BEGIN
        CREATE UNIQUE INDEX UX_auth_verification_codes_hash
            ON dbo.auth_verification_codes(code_hash);
    END;

    IF NOT EXISTS
    (
        SELECT 1
        FROM sys.indexes
        WHERE
            object_id = OBJECT_ID(N'dbo.auth_verification_codes')
            AND [name] = N'IX_auth_verification_codes_account_purpose_created'
    )
    BEGIN
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
    END;

    /* ========================================================
       3. SESIONES
       ======================================================== */

    IF OBJECT_ID(N'dbo.auth_sessions', N'U') IS NULL
    BEGIN
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
                    AND last_seen_at >= created_at
                    AND
                    (
                        revoked_at IS NULL
                        OR revoked_at >= created_at
                    )
                ),

            CONSTRAINT CK_auth_sessions_revocation
                CHECK
                (
                    (
                        revoked_at IS NULL
                        AND revocation_reason IS NULL
                    )
                    OR
                    (
                        revoked_at IS NOT NULL
                        AND revocation_reason IS NOT NULL
                    )
                )
        );
    END;

    IF NOT EXISTS
    (
        SELECT 1
        FROM sys.indexes
        WHERE
            object_id = OBJECT_ID(N'dbo.auth_sessions')
            AND [name] = N'UX_auth_sessions_token_hash'
    )
    BEGIN
        CREATE UNIQUE INDEX UX_auth_sessions_token_hash
            ON dbo.auth_sessions(token_hash);
    END;

    IF NOT EXISTS
    (
        SELECT 1
        FROM sys.indexes
        WHERE
            object_id = OBJECT_ID(N'dbo.auth_sessions')
            AND [name] = N'IX_auth_sessions_account_expires'
    )
    BEGIN
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
    END;

    /* ========================================================
       4. NOTIFICACIONES
       ======================================================== */

    IF OBJECT_ID(N'dbo.notifications', N'U') IS NULL
    BEGIN
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
                ),

            CONSTRAINT CK_notifications_dates
                CHECK
                (
                    read_at IS NULL
                    OR read_at >= created_at
                )
        );
    END;

    IF NOT EXISTS
    (
        SELECT 1
        FROM sys.indexes
        WHERE
            object_id = OBJECT_ID(N'dbo.notifications')
            AND [name] = N'IX_notifications_account_created'
    )
    BEGIN
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
    END;

    IF NOT EXISTS
    (
        SELECT 1
        FROM sys.indexes
        WHERE
            object_id = OBJECT_ID(N'dbo.notifications')
            AND [name] = N'IX_notifications_account_unread'
    )
    BEGIN
        CREATE INDEX IX_notifications_account_unread
            ON dbo.notifications
            (
                account_id,
                created_at DESC
            )
            WHERE read_at IS NULL;
    END;

    /* ========================================================
       5. LÍMITES DE INTENTOS
       ======================================================== */

    IF OBJECT_ID(N'dbo.auth_rate_limits', N'U') IS NULL
    BEGIN
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
                CHECK (attempt_count >= 0),

            CONSTRAINT CK_auth_rate_limits_dates
                CHECK
                (
                    updated_at >= created_at
                    AND
                    (
                        blocked_until IS NULL
                        OR blocked_until >= window_started_at
                    )
                )
        );
    END;

    IF NOT EXISTS
    (
        SELECT 1
        FROM sys.indexes
        WHERE
            object_id = OBJECT_ID(N'dbo.auth_rate_limits')
            AND [name] = N'UX_auth_rate_limits_action_identifier'
    )
    BEGIN
        CREATE UNIQUE INDEX UX_auth_rate_limits_action_identifier
            ON dbo.auth_rate_limits
            (
                action_name,
                identifier_hash
            );
    END;

    IF NOT EXISTS
    (
        SELECT 1
        FROM sys.indexes
        WHERE
            object_id = OBJECT_ID(N'dbo.auth_rate_limits')
            AND [name] = N'IX_auth_rate_limits_cleanup'
    )
    BEGIN
        CREATE INDEX IX_auth_rate_limits_cleanup
            ON dbo.auth_rate_limits
            (
                window_started_at,
                blocked_until
            );
    END;

    /* ========================================================
       6. AUDITORÍA
       ======================================================== */

    IF OBJECT_ID(N'dbo.auth_audit_events', N'U') IS NULL
    BEGIN
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
    END;

    IF NOT EXISTS
    (
        SELECT 1
        FROM sys.indexes
        WHERE
            object_id = OBJECT_ID(N'dbo.auth_audit_events')
            AND [name] = N'IX_auth_audit_events_account_created'
    )
    BEGIN
        CREATE INDEX IX_auth_audit_events_account_created
            ON dbo.auth_audit_events
            (
                account_id,
                created_at DESC
            );
    END;

    IF NOT EXISTS
    (
        SELECT 1
        FROM sys.indexes
        WHERE
            object_id = OBJECT_ID(N'dbo.auth_audit_events')
            AND [name] = N'IX_auth_audit_events_type_created'
    )
    BEGIN
        CREATE INDEX IX_auth_audit_events_type_created
            ON dbo.auth_audit_events
            (
                event_type,
                created_at DESC
            );
    END;

    /* ========================================================
       7. PERMISOS MÍNIMOS DE LA APLICACIÓN
       ======================================================== */

    REVOKE DELETE
        ON OBJECT::dbo.auth_verification_codes
        FROM [fixora_app];

    REVOKE DELETE
        ON OBJECT::dbo.auth_sessions
        FROM [fixora_app];

    REVOKE SELECT
        ON OBJECT::dbo.auth_audit_events
        FROM [fixora_app];

    GRANT SELECT, INSERT, UPDATE
        ON OBJECT::dbo.accounts
        TO [fixora_app];

    GRANT SELECT, INSERT, UPDATE
        ON OBJECT::dbo.auth_verification_codes
        TO [fixora_app];

    GRANT SELECT, INSERT, UPDATE
        ON OBJECT::dbo.auth_sessions
        TO [fixora_app];

    GRANT SELECT, INSERT, UPDATE
        ON OBJECT::dbo.notifications
        TO [fixora_app];

    GRANT SELECT, INSERT, UPDATE, DELETE
        ON OBJECT::dbo.auth_rate_limits
        TO [fixora_app];

    GRANT INSERT
        ON OBJECT::dbo.auth_audit_events
        TO [fixora_app];

    COMMIT TRANSACTION;

    PRINT N'FIXORA: esquema de autenticación creado o validado sin eliminar datos.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
    BEGIN
        ROLLBACK TRANSACTION;
    END;

    THROW;
END CATCH;
GO