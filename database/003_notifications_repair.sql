/*
    FIXORA
    Archivo: database/003_notifications_repair.sql

    Repara el almacenamiento de notificaciones sin eliminar datos.

    ACCIONES:
    - Crea dbo.notifications cuando todavía no existe.
    - Valida que una tabla existente tenga todas las columnas requeridas.
    - Crea las restricciones e índices faltantes.
    - Restablece los permisos mínimos de fixora_app.
    - Crea una notificación inicial para cuentas activas y verificadas que
      todavía no tengan un saludo de bienvenida.

    EJECUCIÓN:
    - Ejecutar desde SQL Server Management Studio con una cuenta administradora
      de la base Fixora.
    - El script es idempotente: puede repetirse sin duplicar saludos.
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
    THROW 50300,
        N'No existe la base de datos Fixora.',
        1;
END;
GO

USE [Fixora];
GO

IF OBJECT_ID(N'dbo.accounts', N'U') IS NULL
BEGIN
    THROW 50301,
        N'No existe dbo.accounts. Ejecute primero el esquema de autenticación.',
        1;
END;
GO

IF
    COL_LENGTH(N'dbo.accounts', N'account_id') IS NULL
    OR COL_LENGTH(N'dbo.accounts', N'role') IS NULL
    OR COL_LENGTH(N'dbo.accounts', N'status') IS NULL
    OR COL_LENGTH(N'dbo.accounts', N'email_verified_at') IS NULL
    OR COL_LENGTH(N'dbo.accounts', N'created_at') IS NULL
BEGIN
    THROW 50302,
        N'dbo.accounts no tiene las columnas necesarias para reparar notificaciones.',
        1;
END;
GO

BEGIN TRY
    BEGIN TRANSACTION;

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

    DECLARE @MissingColumns NVARCHAR(MAX) = NULL;

    DECLARE @RequiredColumns TABLE
    (
        column_name SYSNAME NOT NULL
    );

    INSERT INTO @RequiredColumns
    (
        column_name
    )
    VALUES
        (N'notification_id'),
        (N'account_id'),
        (N'notification_type'),
        (N'title_key'),
        (N'message_key'),
        (N'metadata_json'),
        (N'created_at'),
        (N'read_at');

    SELECT
        @MissingColumns =
            CONCAT(
                COALESCE(@MissingColumns + N', ', N''),
                QUOTENAME(required.column_name)
            )
    FROM @RequiredColumns AS required
    WHERE COL_LENGTH(
        N'dbo.notifications',
        required.column_name
    ) IS NULL;

    IF @MissingColumns IS NOT NULL
    BEGIN
        DECLARE @MissingColumnsMessage NVARCHAR(2048) =
            LEFT(
                N'dbo.notifications está incompleta. Faltan columnas: '
                + @MissingColumns
                + N'. No se modificaron ni eliminaron datos.',
                2048
            );

        THROW 50303,
            @MissingColumnsMessage,
            1;
    END;

    IF NOT EXISTS
    (
        SELECT 1
        FROM sys.foreign_keys
        WHERE
            parent_object_id = OBJECT_ID(N'dbo.notifications')
            AND [name] = N'FK_notifications_account'
    )
    BEGIN
        ALTER TABLE dbo.notifications WITH CHECK
        ADD CONSTRAINT FK_notifications_account
            FOREIGN KEY (account_id)
            REFERENCES dbo.accounts(account_id);

        ALTER TABLE dbo.notifications
            CHECK CONSTRAINT FK_notifications_account;
    END;

    IF NOT EXISTS
    (
        SELECT 1
        FROM sys.check_constraints
        WHERE
            parent_object_id = OBJECT_ID(N'dbo.notifications')
            AND [name] = N'CK_notifications_metadata_json'
    )
    BEGIN
        ALTER TABLE dbo.notifications WITH CHECK
        ADD CONSTRAINT CK_notifications_metadata_json
            CHECK
            (
                metadata_json IS NULL
                OR ISJSON(metadata_json) = 1
            );

        ALTER TABLE dbo.notifications
            CHECK CONSTRAINT CK_notifications_metadata_json;
    END;

    IF NOT EXISTS
    (
        SELECT 1
        FROM sys.check_constraints
        WHERE
            parent_object_id = OBJECT_ID(N'dbo.notifications')
            AND [name] = N'CK_notifications_dates'
    )
    BEGIN
        ALTER TABLE dbo.notifications WITH CHECK
        ADD CONSTRAINT CK_notifications_dates
            CHECK
            (
                read_at IS NULL
                OR read_at >= created_at
            );

        ALTER TABLE dbo.notifications
            CHECK CONSTRAINT CK_notifications_dates;
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

    IF DATABASE_PRINCIPAL_ID(N'fixora_app') IS NOT NULL
    BEGIN
        GRANT SELECT, INSERT, UPDATE
            ON OBJECT::dbo.notifications
            TO [fixora_app];
    END;

    INSERT INTO dbo.notifications
    (
        notification_id,
        account_id,
        notification_type,
        title_key,
        message_key,
        metadata_json,
        created_at,
        read_at
    )
    SELECT
        NEWID(),
        account.account_id,
        CASE
            WHEN account.role = N'ADMIN'
                THEN 'ADMIN_ACCOUNT_ACTIVATED'
            ELSE 'USER_ACCOUNT_CREATED'
        END,
        CASE
            WHEN account.role = N'ADMIN'
                THEN N'auth.notifications.adminActivated.title'
            ELSE N'auth.notifications.accountCreated.title'
        END,
        CASE
            WHEN account.role = N'ADMIN'
                THEN N'auth.notifications.adminActivated.message'
            ELSE N'auth.notifications.accountCreated.message'
        END,
        N'{"source":"database/003_notifications_repair.sql"}',
        COALESCE(
            account.email_verified_at,
            account.created_at,
            SYSUTCDATETIME()
        ),
        NULL
    FROM dbo.accounts AS account WITH (UPDLOCK, HOLDLOCK)
    WHERE
        account.status = N'ACTIVE'
        AND account.email_verified_at IS NOT NULL
        AND account.role IN (N'USER', N'ADMIN')
        AND NOT EXISTS
        (
            SELECT 1
            FROM dbo.notifications AS notification WITH (UPDLOCK, HOLDLOCK)
            WHERE
                notification.account_id = account.account_id
                AND notification.notification_type IN
                (
                    'USER_ACCOUNT_CREATED',
                    'ADMIN_ACCOUNT_ACTIVATED'
                )
        );

    DECLARE @InsertedGreetings INT = @@ROWCOUNT;

    COMMIT TRANSACTION;

    PRINT CONCAT(
        N'FIXORA: almacenamiento de notificaciones reparado. Saludos creados: ',
        @InsertedGreetings,
        N'.'
    );
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
    BEGIN
        ROLLBACK TRANSACTION;
    END;

    THROW;
END CATCH;
GO
