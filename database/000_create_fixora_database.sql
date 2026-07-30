/*
    FIXORA
    Archivo: 000_create_fixora_database.sql

    Responsabilidades:
    - Crear la base de datos Fixora.
    - Crear el inicio de sesión técnico fixora_app.
    - Vincular el inicio de sesión con un usuario de la base.

    Este archivo debe ejecutarse desde SQL Server Management Studio
    utilizando una cuenta con permisos administrativos.

    IMPORTANTE:
    - Cambiar CHANGE_ME_WITH_A_LONG_RANDOM_PASSWORD antes de ejecutarlo.
    - Utilizar la misma contraseña en SQL_SERVER_PASSWORD de .env.local.
    - No guardar la contraseña real en el repositorio.
*/

USE [master];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

/* ============================================================
   1. CREAR LA BASE DE DATOS
   ============================================================ */

IF DB_ID(N'Fixora') IS NULL
BEGIN
    PRINT N'Creando la base de datos Fixora...';

    CREATE DATABASE [Fixora];

    PRINT N'Base de datos Fixora creada correctamente.';
END
ELSE
BEGIN
    PRINT N'La base de datos Fixora ya existe. No se realizará ningún cambio.';
END;
GO

/* ============================================================
   2. CREAR EL LOGIN UTILIZADO POR LA APLICACIÓN
   ============================================================ */

DECLARE @LoginPassword NVARCHAR(128) =
    N'CHANGE_ME_WITH_A_LONG_RANDOM_PASSWORD';

IF
    @LoginPassword = N'CHANGE_ME_WITH_A_LONG_RANDOM_PASSWORD'
    OR LEN(@LoginPassword) < 16
BEGIN
    THROW 50001,
        N'Debe reemplazar la contraseña de ejemplo por una contraseña segura de al menos 16 caracteres.',
        1;
END;

IF NOT EXISTS
(
    SELECT 1
    FROM sys.server_principals
    WHERE [name] = N'fixora_app'
)
BEGIN
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
    PRINT N'El login fixora_app ya existe. No se modificará su contraseña.';
END;
GO

/* ============================================================
   3. CREAR EL USUARIO DENTRO DE LA BASE DE DATOS
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

    PRINT N'El usuario fixora_app ya existía y fue vinculado nuevamente al login.';
END;
GO

/* ============================================================
   4. RESULTADO
   ============================================================ */

PRINT N'Primera configuración de la base de datos completada.';
PRINT N'Las tablas y los permisos específicos se crearán en el archivo 001_authentication_schema.sql.';
GO