/*
    FIXORA
    Archivo: database/000_create_fixora_database.sql

    Responsabilidades:
    - Crear la base de datos Fixora cuando todavía no existe.
    - Crear el login técnico fixora_app únicamente cuando no existe.
    - Crear o volver a vincular el usuario fixora_app dentro de Fixora.
    - Verificar que la cuenta técnica no tenga privilegios administrativos.

    EJECUCIÓN:
    - Ejecutar desde SQL Server Management Studio con una cuenta administradora.
    - Si el login fixora_app ya existe, el script NO modifica su contraseña.
    - En una instalación nueva, reemplazar temporalmente el marcador de
      @LoginPassword en una copia local no versionada del archivo.
    - La contraseña utilizada debe coincidir con SQL_SERVER_PASSWORD de
      .env.local.
    - Nunca guardar una contraseña real en Git.
*/

USE [master];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

/* ============================================================
   1. CREAR Y ENDURECER LA BASE DE DATOS
   ============================================================ */

IF DB_ID(N'Fixora') IS NULL
BEGIN
    PRINT N'Creando la base de datos Fixora...';

    CREATE DATABASE [Fixora];

    PRINT N'Base de datos Fixora creada correctamente.';
END
ELSE
BEGIN
    PRINT N'La base de datos Fixora ya existe.';
END;
GO

ALTER DATABASE [Fixora]
    SET TRUSTWORTHY OFF;
GO

ALTER DATABASE [Fixora]
    SET DB_CHAINING OFF;
GO

/* ============================================================
   2. CREAR EL LOGIN TÉCNICO CUANDO NO EXISTA
   ============================================================ */

IF NOT EXISTS
(
    SELECT 1
    FROM sys.server_principals
    WHERE [name] = N'fixora_app'
)
BEGIN
    DECLARE @LoginPassword NVARCHAR(128) =
        N'CHANGE_ME_WITH_A_LONG_RANDOM_PASSWORD';

    IF
        @LoginPassword = N'CHANGE_ME_WITH_A_LONG_RANDOM_PASSWORD'
        OR LEN(@LoginPassword) < 16
        OR LEN(@LoginPassword) > 128
        OR @LoginPassword LIKE N'%' + NCHAR(0) + N'%'
        OR @LoginPassword LIKE N'%' + NCHAR(10) + N'%'
        OR @LoginPassword LIKE N'%' + NCHAR(13) + N'%'
    BEGIN
        THROW 50001,
            N'Para una instalación nueva debe usar una contraseña segura de 16 a 128 caracteres en una copia local no versionada del script.',
            1;
    END;

    DECLARE @CreateLoginSql NVARCHAR(MAX);

    SET @CreateLoginSql =
        N'CREATE LOGIN [fixora_app]
          WITH PASSWORD = N'''
        + REPLACE(@LoginPassword, N'''', N'''''')
        + N''',
          CHECK_POLICY = ON,
          CHECK_EXPIRATION = OFF,
          DEFAULT_DATABASE = [Fixora];';

    EXEC sys.sp_executesql @CreateLoginSql;

    PRINT N'Login fixora_app creado correctamente.';
END
ELSE
BEGIN
    IF NOT EXISTS
    (
        SELECT 1
        FROM sys.server_principals
        WHERE
            [name] = N'fixora_app'
            AND [type_desc] = N'SQL_LOGIN'
    )
    BEGIN
        THROW 50002,
            N'Existe un principal llamado fixora_app, pero no es un login SQL válido.',
            1;
    END;

    IF EXISTS
    (
        SELECT 1
        FROM sys.server_principals
        WHERE
            [name] = N'fixora_app'
            AND [is_disabled] = 1
    )
    BEGIN
        THROW 50003,
            N'El login fixora_app existe, pero está deshabilitado.',
            1;
    END;

    ALTER LOGIN [fixora_app]
        WITH
            CHECK_POLICY = ON,
            CHECK_EXPIRATION = OFF,
            DEFAULT_DATABASE = [Fixora];

    PRINT N'El login fixora_app ya existe. Su contraseña no fue modificada.';
END;
GO

/* ============================================================
   3. VERIFICAR PRIVILEGIOS DEL LOGIN
   ============================================================ */

IF
    IS_SRVROLEMEMBER(N'sysadmin', N'fixora_app') = 1
    OR IS_SRVROLEMEMBER(N'serveradmin', N'fixora_app') = 1
    OR IS_SRVROLEMEMBER(N'securityadmin', N'fixora_app') = 1
    OR IS_SRVROLEMEMBER(N'processadmin', N'fixora_app') = 1
    OR IS_SRVROLEMEMBER(N'setupadmin', N'fixora_app') = 1
    OR IS_SRVROLEMEMBER(N'bulkadmin', N'fixora_app') = 1
    OR IS_SRVROLEMEMBER(N'diskadmin', N'fixora_app') = 1
    OR IS_SRVROLEMEMBER(N'dbcreator', N'fixora_app') = 1
BEGIN
    THROW 50004,
        N'El login fixora_app pertenece a un rol administrativo del servidor. Retire esos privilegios antes de continuar.',
        1;
END;
GO

/* ============================================================
   4. CREAR O VOLVER A VINCULAR EL USUARIO DE LA BASE
   ============================================================ */

USE [Fixora];
GO

IF DATABASE_PRINCIPAL_ID(N'fixora_app') IS NULL
BEGIN
    CREATE USER [fixora_app]
        FOR LOGIN [fixora_app]
        WITH DEFAULT_SCHEMA = [dbo];

    PRINT N'Usuario fixora_app creado dentro de la base Fixora.';
END
ELSE
BEGIN
    ALTER USER [fixora_app]
        WITH LOGIN = [fixora_app];

    ALTER USER [fixora_app]
        WITH DEFAULT_SCHEMA = [dbo];

    PRINT N'El usuario fixora_app fue vinculado nuevamente al login.';
END;
GO

GRANT CONNECT
    TO [fixora_app];
GO

IF
    IS_ROLEMEMBER(N'db_owner', N'fixora_app') = 1
    OR IS_ROLEMEMBER(N'db_securityadmin', N'fixora_app') = 1
    OR IS_ROLEMEMBER(N'db_accessadmin', N'fixora_app') = 1
    OR IS_ROLEMEMBER(N'db_ddladmin', N'fixora_app') = 1
    OR IS_ROLEMEMBER(N'db_backupoperator', N'fixora_app') = 1
BEGIN
    THROW 50005,
        N'El usuario fixora_app pertenece a un rol administrativo de la base de datos. Retire esos privilegios antes de continuar.',
        1;
END;
GO

PRINT N'FIXORA: configuración inicial de base de datos completada.';
PRINT N'Ejecute database/001_authentication_schema.sql para crear o validar el esquema de autenticación.';
GO