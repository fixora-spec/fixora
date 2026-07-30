USE [Fixora];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

IF OBJECT_ID(N'dbo.accounts', N'U') IS NULL
BEGIN
    THROW 50020,
        N'No existe la tabla dbo.accounts.',
        1;
END;
GO

IF COL_LENGTH(N'dbo.accounts', N'access_started_at') IS NULL
BEGIN
    ALTER TABLE dbo.accounts
        ADD access_started_at DATETIME2(7) NULL;
END;
GO

IF COL_LENGTH(N'dbo.accounts', N'access_expires_at') IS NULL
BEGIN
    ALTER TABLE dbo.accounts
        ADD access_expires_at DATETIME2(7) NULL;
END;
GO

IF NOT EXISTS
(
    SELECT 1
    FROM sys.check_constraints
    WHERE
        parent_object_id = OBJECT_ID(N'dbo.accounts')
        AND [name] = N'CK_accounts_access_window'
)
BEGIN
    ALTER TABLE dbo.accounts WITH CHECK
        ADD CONSTRAINT CK_accounts_access_window
        CHECK
        (
            (
                role = 'USER'
                AND access_started_at IS NULL
                AND access_expires_at IS NULL
            )
            OR
            (
                role = 'ADMIN'
                AND access_started_at IS NOT NULL
                AND access_expires_at IS NOT NULL
                AND access_expires_at > access_started_at
            )
        );

    ALTER TABLE dbo.accounts
        CHECK CONSTRAINT CK_accounts_access_window;
END;
GO

IF NOT EXISTS
(
    SELECT 1
    FROM sys.indexes
    WHERE
        object_id = OBJECT_ID(N'dbo.accounts')
        AND [name] = N'IX_accounts_admin_access_expiration'
)
BEGIN
    CREATE INDEX IX_accounts_admin_access_expiration
        ON dbo.accounts
        (
            access_expires_at,
            status
        )
        INCLUDE
        (
            account_id,
            email_normalized,
            username
        )
        WHERE
            role = 'ADMIN'
            AND access_expires_at IS NOT NULL;
END;
GO

PRINT N'FIXORA: vigencia administrativa agregada correctamente.';
GO

SELECT
    COL_LENGTH(N'dbo.accounts', N'access_started_at')
        AS access_started_at_length,

    COL_LENGTH(N'dbo.accounts', N'access_expires_at')
        AS access_expires_at_length;
GO