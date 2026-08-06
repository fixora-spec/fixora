/*
    FIXORA
    Archivo: database/002_admin_access_expiration.sql

    Agrega y valida la ventana temporal de acceso administrativo.

    SEGURIDAD:
    - No elimina tablas, cuentas ni datos.
    - No cambia roles, estados ni fechas existentes.
    - No concede automáticamente acceso a administradores incompletos.
    - Puede ejecutarse varias veces.
    - Si encuentra datos incompatibles, revierte toda la migración.

    ORDEN:
    1. database/000_create_fixora_database.sql
    2. database/001_authentication_schema.sql
    3. database/002_admin_access_expiration.sql

    EJECUCIÓN:
    - Ejecutar con una cuenta administradora de la base Fixora.
    - No ejecutar con el usuario técnico fixora_app.
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
    THROW 50020,
        N'No existe la base de datos Fixora. Ejecute primero database/000_create_fixora_database.sql.',
        1;
END;
GO

USE [Fixora];
GO

IF OBJECT_ID(N'dbo.accounts', N'U') IS NULL
BEGIN
    THROW 50021,
        N'No existe la tabla dbo.accounts. Ejecute primero database/001_authentication_schema.sql.',
        1;
END;
GO

IF
    COL_LENGTH(N'dbo.accounts', N'account_id') IS NULL
    OR COL_LENGTH(N'dbo.accounts', N'role') IS NULL
    OR COL_LENGTH(N'dbo.accounts', N'status') IS NULL
    OR COL_LENGTH(N'dbo.accounts', N'email_normalized') IS NULL
    OR COL_LENGTH(N'dbo.accounts', N'username') IS NULL
BEGIN
    THROW 50022,
        N'La tabla dbo.accounts no tiene la estructura base esperada.',
        1;
END;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    /* ========================================================
       1. AGREGAR LAS COLUMNAS SIN MODIFICAR DATOS EXISTENTES
       ======================================================== */

    IF COL_LENGTH(N'dbo.accounts', N'access_started_at') IS NULL
    BEGIN
        ALTER TABLE dbo.accounts
            ADD access_started_at DATETIME2(7) NULL;
    END;

    IF COL_LENGTH(N'dbo.accounts', N'access_expires_at') IS NULL
    BEGIN
        ALTER TABLE dbo.accounts
            ADD access_expires_at DATETIME2(7) NULL;
    END;

    /* ========================================================
       2. VALIDAR LOS DATOS ANTES DE ACTIVAR LA RESTRICCIÓN
       ======================================================== */

    DECLARE @InvalidUserCount BIGINT;
    DECLARE @InvalidAdministratorCount BIGINT;
    DECLARE @UnsupportedRoleCount BIGINT;

    SELECT
        @InvalidUserCount = COUNT_BIG(*)
    FROM dbo.accounts
    WHERE
        role = 'USER'
        AND
        (
            access_started_at IS NOT NULL
            OR access_expires_at IS NOT NULL
        );

    SELECT
        @InvalidAdministratorCount = COUNT_BIG(*)
    FROM dbo.accounts
    WHERE
        role = 'ADMIN'
        AND
        (
            access_started_at IS NULL
            OR access_expires_at IS NULL
            OR access_expires_at <= access_started_at
        );

    SELECT
        @UnsupportedRoleCount = COUNT_BIG(*)
    FROM dbo.accounts
    WHERE role NOT IN ('USER', 'ADMIN');

    IF @UnsupportedRoleCount > 0
    BEGIN
        THROW 50023,
            N'Existen cuentas con un rol no compatible con la vigencia administrativa.',
            1;
    END;

    IF @InvalidUserCount > 0
    BEGIN
        THROW 50024,
            N'Existen cuentas USER con fechas administrativas. Corrija esos registros antes de ejecutar la migración.',
            1;
    END;

    IF @InvalidAdministratorCount > 0
    BEGIN
        THROW 50025,
            N'Existen cuentas ADMIN sin una ventana de acceso válida. Asigne explícitamente access_started_at y access_expires_at antes de ejecutar la migración.',
            1;
    END;

    /* ========================================================
       3. CREAR O REACTIVAR LA RESTRICCIÓN DE INTEGRIDAD
       ======================================================== */

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
    END
    ELSE IF EXISTS
    (
        SELECT 1
        FROM sys.check_constraints
        WHERE
            parent_object_id = OBJECT_ID(N'dbo.accounts')
            AND [name] = N'CK_accounts_access_window'
            AND
            (
                UPPER([definition]) NOT LIKE N'%ROLE%'
                OR UPPER([definition]) NOT LIKE N'%USER%'
                OR UPPER([definition]) NOT LIKE N'%ADMIN%'
                OR UPPER([definition]) NOT LIKE N'%ACCESS_STARTED_AT%'
                OR UPPER([definition]) NOT LIKE N'%ACCESS_EXPIRES_AT%'
            )
    )
    BEGIN
        THROW 50028,
            N'Existe CK_accounts_access_window, pero su definición no coincide con la estructura esperada.',
            1;
    END;

    ALTER TABLE dbo.accounts WITH CHECK
        CHECK CONSTRAINT CK_accounts_access_window;

    IF EXISTS
    (
        SELECT 1
        FROM sys.check_constraints
        WHERE
            parent_object_id = OBJECT_ID(N'dbo.accounts')
            AND [name] = N'CK_accounts_access_window'
            AND
            (
                is_disabled = 1
                OR is_not_trusted = 1
            )
    )
    BEGIN
        THROW 50026,
            N'La restricción CK_accounts_access_window no pudo quedar habilitada y validada.',
            1;
    END;

    /* ========================================================
       4. CREAR O REACTIVAR EL ÍNDICE DE EXPIRACIÓN
       ======================================================== */

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
    END
    ELSE
    BEGIN
        IF EXISTS
        (
            SELECT 1
            FROM sys.indexes
            WHERE
                object_id = OBJECT_ID(N'dbo.accounts')
                AND [name] = N'IX_accounts_admin_access_expiration'
                AND
                (
                    has_filter = 0
                    OR filter_definition IS NULL
                    OR UPPER(filter_definition) NOT LIKE N'%ROLE%'
                    OR UPPER(filter_definition) NOT LIKE N'%ADMIN%'
                    OR UPPER(filter_definition) NOT LIKE N'%ACCESS_EXPIRES_AT%'
                )
        )
        BEGIN
            THROW 50029,
                N'Existe IX_accounts_admin_access_expiration, pero su filtro no coincide con la estructura esperada.',
                1;
        END;

        IF NOT EXISTS
        (
            SELECT 1
            FROM sys.index_columns AS index_columns
            INNER JOIN sys.columns AS columns
                ON columns.object_id = index_columns.object_id
                AND columns.column_id = index_columns.column_id
            WHERE
                index_columns.object_id = OBJECT_ID(N'dbo.accounts')
                AND index_columns.index_id = INDEXPROPERTY
                (
                    OBJECT_ID(N'dbo.accounts'),
                    N'IX_accounts_admin_access_expiration',
                    N'IndexId'
                )
                AND index_columns.key_ordinal = 1
                AND columns.[name] = N'access_expires_at'
        )
        OR NOT EXISTS
        (
            SELECT 1
            FROM sys.index_columns AS index_columns
            INNER JOIN sys.columns AS columns
                ON columns.object_id = index_columns.object_id
                AND columns.column_id = index_columns.column_id
            WHERE
                index_columns.object_id = OBJECT_ID(N'dbo.accounts')
                AND index_columns.index_id = INDEXPROPERTY
                (
                    OBJECT_ID(N'dbo.accounts'),
                    N'IX_accounts_admin_access_expiration',
                    N'IndexId'
                )
                AND index_columns.key_ordinal = 2
                AND columns.[name] = N'status'
        )
        BEGIN
            THROW 50030,
                N'Existe IX_accounts_admin_access_expiration, pero sus columnas clave no coinciden con la estructura esperada.',
                1;
        END;

        IF EXISTS
        (
            SELECT 1
            FROM sys.indexes
            WHERE
                object_id = OBJECT_ID(N'dbo.accounts')
                AND [name] = N'IX_accounts_admin_access_expiration'
                AND is_disabled = 1
        )
        BEGIN
            ALTER INDEX IX_accounts_admin_access_expiration
                ON dbo.accounts
                REBUILD;
        END;
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
    BEGIN
        ROLLBACK TRANSACTION;
    END;

    THROW;
END CATCH;
GO

/* ============================================================
   5. COMPROBACIÓN FINAL SIN EXPONER DATOS DE CUENTAS
   ============================================================ */

DECLARE @ConstraintTrusted BIT;
DECLARE @IndexEnabled BIT;
DECLARE @AdministratorCount BIGINT;
DECLARE @ExpiredAdministratorCount BIGINT;

SELECT
    @ConstraintTrusted =
        CASE
            WHEN EXISTS
            (
                SELECT 1
                FROM sys.check_constraints
                WHERE
                    parent_object_id = OBJECT_ID(N'dbo.accounts')
                    AND [name] = N'CK_accounts_access_window'
                    AND is_disabled = 0
                    AND is_not_trusted = 0
            )
            THEN 1
            ELSE 0
        END;

SELECT
    @IndexEnabled =
        CASE
            WHEN EXISTS
            (
                SELECT 1
                FROM sys.indexes
                WHERE
                    object_id = OBJECT_ID(N'dbo.accounts')
                    AND [name] = N'IX_accounts_admin_access_expiration'
                    AND is_disabled = 0
            )
            THEN 1
            ELSE 0
        END;

SELECT
    @AdministratorCount = COUNT_BIG(*),
    @ExpiredAdministratorCount =
        COALESCE
        (
            SUM
            (
                CASE
                    WHEN access_expires_at <= SYSUTCDATETIME()
                    THEN CONVERT(BIGINT, 1)
                    ELSE CONVERT(BIGINT, 0)
                END
            ),
            0
        )
FROM dbo.accounts
WHERE role = 'ADMIN';

IF
    @ConstraintTrusted <> 1
    OR @IndexEnabled <> 1
BEGIN
    THROW 50027,
        N'La migración terminó sin dejar todos los objetos de seguridad habilitados.',
        1;
END;

PRINT N'FIXORA: vigencia administrativa validada correctamente.';

SELECT
    CAST(COL_LENGTH(N'dbo.accounts', N'access_started_at') AS INT)
        AS access_started_at_length,
    CAST(COL_LENGTH(N'dbo.accounts', N'access_expires_at') AS INT)
        AS access_expires_at_length,
    @ConstraintTrusted
        AS constraint_trusted,
    @IndexEnabled
        AS expiration_index_enabled,
    @AdministratorCount
        AS administrator_count,
    @ExpiredAdministratorCount
        AS expired_administrator_count;
GO