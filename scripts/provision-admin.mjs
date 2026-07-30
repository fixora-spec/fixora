import { existsSync, readFileSync } from "node:fs";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { resolve } from "node:path";
import process from "node:process";
import readline from "node:readline";

const PROJECT_ROOT = process.cwd();
const ORIGINAL_ENV_KEYS = new Set(Object.keys(process.env));

const DEFAULT_ACCESS_YEARS = 5;
const MIN_ACCESS_YEARS = 1;
const MAX_ACCESS_YEARS = 10;

const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;

const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_SALT_LENGTH = 32;
const SCRYPT_KEY_LENGTH = 64;

const VISUAL_EQUIVALENCES = Object.freeze({
  "0": "o",
  "1": "l",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
});

function parseEnvironmentLine(line) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const separator = trimmed.indexOf("=");

  if (separator <= 0) {
    return null;
  }

  const key = trimmed
    .slice(0, separator)
    .trim();

  let value = trimmed
    .slice(separator + 1)
    .trim();

  if (
    (
      value.startsWith('"')
      && value.endsWith('"')
    )
    || (
      value.startsWith("'")
      && value.endsWith("'")
    )
  ) {
    value = value.slice(1, -1);
  }

  return {
    key,
    value,
  };
}

function loadEnvironmentFile(
  fileName,
  allowOverride,
) {
  const filePath = resolve(
    PROJECT_ROOT,
    fileName,
  );

  if (!existsSync(filePath)) {
    return false;
  }

  const content = readFileSync(
    filePath,
    "utf8",
  ).replace(
    /^\uFEFF/u,
    "",
  );

  for (
    const line
    of content.split(/\r?\n/u)
  ) {
    const parsed = parseEnvironmentLine(
      line,
    );

    if (!parsed) {
      continue;
    }

    const {
      key,
      value,
    } = parsed;

    if (ORIGINAL_ENV_KEYS.has(key)) {
      continue;
    }

    if (
      allowOverride
      || typeof process.env[key]
        === "undefined"
    ) {
      process.env[key] = value;
    }
  }

  return true;
}

function requireEnvironmentValue(name) {
  const value = process.env[name]
    ?.trim();

  if (!value) {
    throw new Error(
      `Falta la variable obligatoria ${name}.`,
    );
  }

  return value;
}

function readIntegerEnvironmentValue(
  name,
  fallback,
  minimum,
  maximum,
) {
  const raw = process.env[name]
    ?.trim();

  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(
    raw,
    10,
  );

  if (
    !Number.isSafeInteger(value)
    || value < minimum
    || value > maximum
  ) {
    throw new Error(
      `${name} debe estar entre ${minimum} y ${maximum}.`,
    );
  }

  return value;
}

function readBooleanEnvironmentValue(
  name,
  fallback,
) {
  const raw = process.env[name]
    ?.trim()
    .toLowerCase();

  if (!raw) {
    return fallback;
  }

  if (raw === "true") {
    return true;
  }

  if (raw === "false") {
    return false;
  }

  throw new Error(
    `${name} debe tener el valor true o false.`,
  );
}

function buildSqlConfiguration() {
  const instanceName =
    process.env
      .SQL_SERVER_INSTANCE
      ?.trim()
    ?? "";

  const portValue =
    process.env
      .SQL_SERVER_PORT
      ?.trim()
    ?? "";

  if (
    instanceName
    && portValue
  ) {
    throw new Error(
      "Configura SQL_SERVER_INSTANCE o SQL_SERVER_PORT, pero no ambos.",
    );
  }

  if (
    !instanceName
    && !portValue
  ) {
    throw new Error(
      "Debes configurar SQL_SERVER_INSTANCE o SQL_SERVER_PORT.",
    );
  }

  const poolMin =
    readIntegerEnvironmentValue(
      "SQL_SERVER_POOL_MIN",
      0,
      0,
      100,
    );

  const poolMax =
    readIntegerEnvironmentValue(
      "SQL_SERVER_POOL_MAX",
      10,
      1,
      100,
    );

  if (poolMin > poolMax) {
    throw new Error(
      "SQL_SERVER_POOL_MIN no puede superar SQL_SERVER_POOL_MAX.",
    );
  }

  const configuration = {
    server:
      requireEnvironmentValue(
        "SQL_SERVER_HOST",
      ),

    database:
      requireEnvironmentValue(
        "SQL_SERVER_DATABASE",
      ),

    user:
      requireEnvironmentValue(
        "SQL_SERVER_USER",
      ),

    password:
      requireEnvironmentValue(
        "SQL_SERVER_PASSWORD",
      ),

    connectionTimeout:
      readIntegerEnvironmentValue(
        "SQL_SERVER_CONNECTION_TIMEOUT_MS",
        15_000,
        1_000,
        120_000,
      ),

    requestTimeout:
      readIntegerEnvironmentValue(
        "SQL_SERVER_REQUEST_TIMEOUT_MS",
        15_000,
        1_000,
        120_000,
      ),

    pool: {
      min:
        poolMin,

      max:
        poolMax,

      idleTimeoutMillis:
        readIntegerEnvironmentValue(
          "SQL_SERVER_POOL_IDLE_TIMEOUT_MS",
          30_000,
          1_000,
          600_000,
        ),
    },

    options: {
      encrypt:
        readBooleanEnvironmentValue(
          "SQL_SERVER_ENCRYPT",
          false,
        ),

      trustServerCertificate:
        readBooleanEnvironmentValue(
          "SQL_SERVER_TRUST_SERVER_CERTIFICATE",
          true,
        ),

      enableArithAbort:
        true,
    },
  };

  if (instanceName) {
    configuration.options.instanceName =
      instanceName;
  } else {
    configuration.port =
      readIntegerEnvironmentValue(
        "SQL_SERVER_PORT",
        1433,
        1,
        65_535,
      );
  }

  return configuration;
}

function parseArguments(
  argumentList,
) {
  const allowedKeys =
    new Set([
      "first-names",
      "last-names",
      "username",
      "email",
      "access-years",
    ]);

  const values = {};

  for (
    let index = 0;
    index < argumentList.length;
    index += 1
  ) {
    const argument =
      argumentList[index];

    if (
      argument === "--help"
      || argument === "-h"
    ) {
      values.help = true;
      continue;
    }

    if (
      !argument.startsWith("--")
    ) {
      throw new Error(
        `Argumento no reconocido: ${argument}`,
      );
    }

    const equalsIndex =
      argument.indexOf("=");

    let key;
    let value;

    if (equalsIndex > 2) {
      key =
        argument.slice(
          2,
          equalsIndex,
        );

      value =
        argument.slice(
          equalsIndex + 1,
        );
    } else {
      key =
        argument.slice(2);

      value =
        argumentList[index + 1];

      if (
        !value
        || value.startsWith("--")
      ) {
        throw new Error(
          `Falta el valor para --${key}.`,
        );
      }

      index += 1;
    }

    if (
      !allowedKeys.has(key)
    ) {
      throw new Error(
        `Argumento no permitido: --${key}.`,
      );
    }

    values[key] = value;
  }

  return values;
}

function printHelp() {
  console.log(`
Crear una cuenta administradora directamente en SQL Server.

No crea una ruta pública y no permite registrar administradores desde la web.

Uso:

  pnpm db:provision-admin -- \\
    --first-names "Christopher" \\
    --last-names "Silva Cruz" \\
    --username "christopher.admin" \\
    --email "cristophersilvacruz@gmail.com" \\
    --access-years 5

La contraseña se solicitará de forma oculta.

Argumentos obligatorios:
  --first-names
  --last-names
  --username
  --email

Argumento opcional:
  --access-years    Entre ${MIN_ACCESS_YEARS} y ${MAX_ACCESS_YEARS} años.
                    Predeterminado: ${DEFAULT_ACCESS_YEARS}.
`);
}

function requireArgument(
  argumentsObject,
  name,
) {
  const value =
    argumentsObject[name]
      ?.trim();

  if (!value) {
    throw new Error(
      `Falta el argumento obligatorio --${name}.`,
    );
  }

  return value.normalize("NFC");
}

function normalizeEmail(email) {
  return email
    .trim()
    .normalize("NFC")
    .toLowerCase();
}

function removeDiacritics(value) {
  return value
    .normalize("NFKD")
    .replace(
      /\p{M}/gu,
      "",
    );
}

function normalizeUsername(username) {
  return removeDiacritics(
    username.trim(),
  )
    .toLowerCase()
    .replace(
      /[\s._-]+/gu,
      "",
    )
    .replace(
      /[^a-z0-9]/gu,
      "",
    );
}

function createUsernameSkeleton(
  username,
) {
  return [
    ...normalizeUsername(
      username,
    ),
  ]
    .map(
      (character) =>
        VISUAL_EQUIVALENCES[
          character
        ]
        ?? character,
    )
    .join("");
}

function validateName(
  value,
  fieldName,
  maximumLength,
) {
  if (
    value.length < 2
    || value.length
      > maximumLength
  ) {
    throw new Error(
      `${fieldName} debe tener entre 2 y ${maximumLength} caracteres.`,
    );
  }

  if (
    !/^[\p{L}\p{M}' -]+$/u
      .test(value)
  ) {
    throw new Error(
      `${fieldName} contiene caracteres no permitidos.`,
    );
  }
}

function validateUsername(
  username,
  normalized,
  skeleton,
) {
  if (
    username.length < 3
    || username.length > 40
  ) {
    throw new Error(
      "El nombre de pila debe tener entre 3 y 40 caracteres.",
    );
  }

  if (
    !/^[\p{L}\p{N}._-]+$/u
      .test(username)
  ) {
    throw new Error(
      "El nombre de pila solo admite letras, números, puntos, guiones y guiones bajos.",
    );
  }

  if (
    normalized.length < 3
    || normalized.length > 40
  ) {
    throw new Error(
      "El nombre de pila normalizado no es válido.",
    );
  }

  if (
    skeleton.length < 1
    || skeleton.length > 40
  ) {
    throw new Error(
      "La comparación de seguridad del nombre de pila no es válida.",
    );
  }
}

function validateEmail(email) {
  if (
    email.length < 5
    || email.length > 320
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u
      .test(email)
  ) {
    throw new Error(
      "El correo electrónico no tiene un formato válido.",
    );
  }
}

function validateAccessYears(
  rawValue,
) {
  if (
    typeof rawValue
    === "undefined"
  ) {
    return DEFAULT_ACCESS_YEARS;
  }

  const trimmed =
    rawValue.trim();

  const value =
    Number.parseInt(
      trimmed,
      10,
    );

  if (
    !Number.isSafeInteger(value)
    || String(value) !== trimmed
    || value < MIN_ACCESS_YEARS
    || value > MAX_ACCESS_YEARS
  ) {
    throw new Error(
      `--access-years debe ser un entero entre ${MIN_ACCESS_YEARS} y ${MAX_ACCESS_YEARS}.`,
    );
  }

  return value;
}

function validatePassword(password) {
  if (
    password.length
      < PASSWORD_MIN_LENGTH
    || password.length
      > PASSWORD_MAX_LENGTH
  ) {
    throw new Error(
      `La contraseña debe tener entre ${PASSWORD_MIN_LENGTH} y ${PASSWORD_MAX_LENGTH} caracteres.`,
    );
  }

  if (/\s/u.test(password)) {
    throw new Error(
      "La contraseña no puede contener espacios.",
    );
  }

  const missing = [];

  if (
    !/[A-Z]/u.test(password)
  ) {
    missing.push(
      "una letra mayúscula",
    );
  }

  if (
    !/[a-z]/u.test(password)
  ) {
    missing.push(
      "una letra minúscula",
    );
  }

  if (
    !/\d/u.test(password)
  ) {
    missing.push(
      "un número",
    );
  }

  if (
    !/[^\p{L}\p{N}]/u
      .test(password)
  ) {
    missing.push(
      "un signo",
    );
  }

  if (missing.length > 0) {
    throw new Error(
      `La contraseña debe incluir ${missing.join(", ")}.`,
    );
  }
}

function hashPassword(password) {
  const salt =
    randomBytes(
      SCRYPT_SALT_LENGTH,
    );

  const derivedKey =
    scryptSync(
      password,
      salt,
      SCRYPT_KEY_LENGTH,
      {
        cost:
          SCRYPT_COST,

        blockSize:
          SCRYPT_BLOCK_SIZE,

        parallelization:
          SCRYPT_PARALLELIZATION,

        maxmem:
          64 * 1024 * 1024,
      },
    );

  return [
    "v1",
    "scrypt",
    String(SCRYPT_COST),
    String(SCRYPT_BLOCK_SIZE),
    String(
      SCRYPT_PARALLELIZATION,
    ),
    salt.toString(
      "base64url",
    ),
    derivedKey.toString(
      "base64url",
    ),
  ].join("$");
}

async function readHiddenValue(
  promptText,
) {
  const environmentPassword =
    process.env
      .FIXORA_ADMIN_PASSWORD;

  if (environmentPassword) {
    return environmentPassword;
  }

  if (
    !process.stdin.isTTY
    || !process.stdout.isTTY
    || typeof process.stdin
      .setRawMode
      !== "function"
  ) {
    throw new Error(
      "No se puede solicitar la contraseña de forma oculta. Usa una terminal interactiva.",
    );
  }

  readline.emitKeypressEvents(
    process.stdin,
  );

  const previousRawMode =
    process.stdin.isRaw;

  process.stdin.setRawMode(
    true,
  );

  process.stdin.resume();

  process.stdout.write(
    promptText,
  );

  return new Promise(
    (
      resolvePassword,
      rejectPassword,
    ) => {
      let value = "";

      const cleanup = () => {
        process.stdin.off(
          "keypress",
          onKeypress,
        );

        process.stdin.setRawMode(
          previousRawMode,
        );

        process.stdin.pause();
      };

      const onKeypress = (
        character,
        key,
      ) => {
        if (
          key?.ctrl
          && key.name === "c"
        ) {
          cleanup();

          process.stdout.write(
            "\n",
          );

          rejectPassword(
            new Error(
              "Operación cancelada.",
            ),
          );

          return;
        }

        if (
          key?.name === "return"
          || key?.name === "enter"
        ) {
          cleanup();

          process.stdout.write(
            "\n",
          );

          resolvePassword(
            value,
          );

          return;
        }

        if (
          key?.name
          === "backspace"
        ) {
          if (value.length > 0) {
            value =
              value.slice(
                0,
                -1,
              );

            process.stdout.write(
              "\b \b",
            );
          }

          return;
        }

        if (
          typeof character
            === "string"
          && character.length > 0
          && !key?.ctrl
          && !key?.meta
        ) {
          value += character;

          process.stdout.write(
            "*",
          );
        }
      };

      process.stdin.on(
        "keypress",
        onKeypress,
      );
    },
  );
}

async function obtainPassword() {
  const fromEnvironment =
    process.env
      .FIXORA_ADMIN_PASSWORD;

  const password =
    await readHiddenValue(
      "Contraseña administrativa: ",
    );

  validatePassword(
    password,
  );

  if (fromEnvironment) {
    return password;
  }

  const confirmation =
    await readHiddenValue(
      "Repita la contraseña: ",
    );

  if (
    password !== confirmation
  ) {
    throw new Error(
      "Las contraseñas no coinciden.",
    );
  }

  return password;
}

async function loadSqlServerLibrary() {
  try {
    const sqlModule =
      await import(
        "mssql"
      );

    return sqlModule.default
      ?? sqlModule;
  } catch {
    throw new Error(
      'No se encontró "mssql". Ejecuta: pnpm add mssql',
    );
  }
}
async function verifyRequiredSchema(
  pool,
) {
  const tablesResult =
    await pool
      .request()
      .query(`
        SELECT [name]
        FROM sys.tables
        WHERE [name] IN (
          N'accounts',
          N'notifications',
          N'auth_audit_events'
        );
      `);

  const tables =
    new Set(
      tablesResult
        .recordset
        .map(
          (record) =>
            record.name,
        ),
    );

  const missingTables = [
    "accounts",
    "notifications",
    "auth_audit_events",
  ].filter(
    (name) =>
      !tables.has(name),
  );

  if (
    missingTables.length > 0
  ) {
    throw new Error(
      `Faltan tablas: ${missingTables.join(", ")}.`,
    );
  }

  const columnsResult =
    await pool
      .request()
      .query(`
        SELECT [name]
        FROM sys.columns
        WHERE
          object_id =
            OBJECT_ID(
              N'dbo.accounts'
            )
          AND [name] IN (
            N'account_id',
            N'role',
            N'status',
            N'first_names',
            N'last_names',
            N'username',
            N'username_normalized',
            N'username_skeleton',
            N'email',
            N'email_normalized',
            N'password_hash',
            N'email_verified_at',
            N'access_started_at',
            N'access_expires_at',
            N'failed_sign_in_attempts',
            N'locked_until',
            N'last_sign_in_at',
            N'created_at',
            N'updated_at'
          );
      `);

  const columns =
    new Set(
      columnsResult
        .recordset
        .map(
          (record) =>
            record.name,
        ),
    );

  const requiredColumns = [
    "account_id",
    "role",
    "status",
    "first_names",
    "last_names",
    "username",
    "username_normalized",
    "username_skeleton",
    "email",
    "email_normalized",
    "password_hash",
    "email_verified_at",
    "access_started_at",
    "access_expires_at",
    "failed_sign_in_attempts",
    "locked_until",
    "last_sign_in_at",
    "created_at",
    "updated_at",
  ];

  const missingColumns =
    requiredColumns.filter(
      (name) =>
        !columns.has(name),
    );

  if (
    missingColumns.length > 0
  ) {
    throw new Error(
      `Faltan columnas en dbo.accounts: ${missingColumns.join(", ")}. Ejecuta database/002_admin_access_expiration.sql.`,
    );
  }
}

async function createAdministrator(
  sql,
  pool,
  administrator,
) {
  const transaction =
    new sql.Transaction(
      pool,
    );

  try {
    await transaction.begin(
      sql.ISOLATION_LEVEL
        .SERIALIZABLE,
    );

    const conflictResult =
      await new sql.Request(
        transaction,
      )
        .input(
          "emailNormalized",
          sql.NVarChar(320),
          administrator
            .emailNormalized,
        )
        .input(
          "usernameNormalized",
          sql.NVarChar(40),
          administrator
            .usernameNormalized,
        )
        .input(
          "usernameSkeleton",
          sql.NVarChar(40),
          administrator
            .usernameSkeleton,
        )
        .query(`
          SELECT TOP (1)
            account_id,
            role,
            email_normalized,
            username_normalized,
            username_skeleton
          FROM dbo.accounts
            WITH (
              UPDLOCK,
              HOLDLOCK
            )
          WHERE
            email_normalized =
              @emailNormalized
            OR username_normalized =
              @usernameNormalized
            OR username_skeleton =
              @usernameSkeleton;
        `);

    if (
      conflictResult
        .recordset
        .length > 0
    ) {
      const existing =
        conflictResult
          .recordset[0];

      if (
        existing
          .email_normalized
        === administrator
          .emailNormalized
      ) {
        throw new Error(
          "Ya existe una cuenta con ese correo. No se convirtió ni modificó la cuenta existente.",
        );
      }

      if (
        existing
          .username_normalized
        === administrator
          .usernameNormalized
      ) {
        throw new Error(
          "El nombre de pila ya se encuentra registrado.",
        );
      }

      throw new Error(
        "El nombre de pila es demasiado parecido a otra cuenta existente.",
      );
    }

    const accountId =
      randomUUID();

    const accountResult =
      await new sql.Request(
        transaction,
      )
        .input(
          "accountId",
          sql.UniqueIdentifier,
          accountId,
        )
        .input(
          "firstNames",
          sql.NVarChar(100),
          administrator
            .firstNames,
        )
        .input(
          "lastNames",
          sql.NVarChar(150),
          administrator
            .lastNames,
        )
        .input(
          "username",
          sql.NVarChar(40),
          administrator
            .username,
        )
        .input(
          "usernameNormalized",
          sql.NVarChar(40),
          administrator
            .usernameNormalized,
        )
        .input(
          "usernameSkeleton",
          sql.NVarChar(40),
          administrator
            .usernameSkeleton,
        )
        .input(
          "email",
          sql.NVarChar(320),
          administrator
            .email,
        )
        .input(
          "emailNormalized",
          sql.NVarChar(320),
          administrator
            .emailNormalized,
        )
        .input(
          "passwordHash",
          sql.VarChar(512),
          administrator
            .passwordHash,
        )
        .input(
          "accessYears",
          sql.Int,
          administrator
            .accessYears,
        )
        .query(`
          DECLARE
            @createdAt
              DATETIME2(7) =
                SYSUTCDATETIME();

          DECLARE
            @accessExpiresAt
              DATETIME2(7) =
                DATEADD(
                  YEAR,
                  @accessYears,
                  @createdAt
                );

          INSERT INTO dbo.accounts (
            account_id,
            role,
            status,
            first_names,
            last_names,
            username,
            username_normalized,
            username_skeleton,
            email,
            email_normalized,
            password_hash,
            email_verified_at,
            access_started_at,
            access_expires_at,
            failed_sign_in_attempts,
            locked_until,
            last_sign_in_at,
            created_at,
            updated_at
          )
          OUTPUT
            inserted.account_id,
            inserted.role,
            inserted.status,
            inserted.username,
            inserted.email,
            inserted.email_verified_at,
            inserted.access_started_at,
            inserted.access_expires_at,
            inserted.created_at
          VALUES (
            @accountId,
            'ADMIN',
            'ACTIVE',
            @firstNames,
            @lastNames,
            @username,
            @usernameNormalized,
            @usernameSkeleton,
            @email,
            @emailNormalized,
            @passwordHash,
            @createdAt,
            @createdAt,
            @accessExpiresAt,
            0,
            NULL,
            NULL,
            @createdAt,
            @createdAt
          );
        `);

    const createdAccount =
      accountResult
        .recordset[0];

    if (!createdAccount) {
      throw new Error(
        "SQL Server no devolvió la cuenta administrativa creada.",
      );
    }

    const notificationMetadata =
      JSON.stringify({
        source:
          "provision-admin-script",

        accessYears:
          administrator
            .accessYears,

        accessStartedAt:
          createdAccount
            .access_started_at
            .toISOString(),

        accessExpiresAt:
          createdAccount
            .access_expires_at
            .toISOString(),
      });

    await new sql.Request(
      transaction,
    )
      .input(
        "notificationId",
        sql.UniqueIdentifier,
        randomUUID(),
      )
      .input(
        "accountId",
        sql.UniqueIdentifier,
        createdAccount
          .account_id,
      )
      .input(
        "metadataJson",
        sql.NVarChar(
          sql.MAX,
        ),
        notificationMetadata,
      )
      .input(
        "createdAt",
        sql.DateTime2,
        createdAccount
          .created_at,
      )
      .query(`
        INSERT INTO dbo.notifications (
          notification_id,
          account_id,
          notification_type,
          title_key,
          message_key,
          metadata_json,
          created_at,
          read_at
        )
        VALUES (
          @notificationId,
          @accountId,
          'ADMIN_ACCOUNT_ACTIVATED',
          N'auth.notifications.adminActivated.title',
          N'auth.notifications.adminActivated.message',
          @metadataJson,
          @createdAt,
          NULL
        );
      `);

    const auditMetadata =
      JSON.stringify({
        source:
          "provision-admin-script",

        accessYears:
          administrator
            .accessYears,

        email:
          administrator.email,

        username:
          administrator
            .username,

        accessStartedAt:
          createdAccount
            .access_started_at
            .toISOString(),

        accessExpiresAt:
          createdAccount
            .access_expires_at
            .toISOString(),
      });

    await new sql.Request(
      transaction,
    )
      .input(
        "auditEventId",
        sql.UniqueIdentifier,
        randomUUID(),
      )
      .input(
        "accountId",
        sql.UniqueIdentifier,
        createdAccount
          .account_id,
      )
      .input(
        "metadataJson",
        sql.NVarChar(
          sql.MAX,
        ),
        auditMetadata,
      )
      .input(
        "createdAt",
        sql.DateTime2,
        createdAccount
          .created_at,
      )
      .query(`
        INSERT INTO dbo.auth_audit_events (
          audit_event_id,
          account_id,
          event_type,
          successful,
          ip_address,
          user_agent,
          metadata_json,
          created_at
        )
        VALUES (
          @auditEventId,
          @accountId,
          'ADMIN_ACCOUNT_PROVISIONED',
          1,
          NULL,
          N'Fixora provision-admin.mjs',
          @metadataJson,
          @createdAt
        );
      `);

    await transaction.commit();

    return createdAccount;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      /*
       * La transacción ya pudo
       * haber sido revertida
       * por SQL Server.
       */
    }

    throw error;
  }
}

async function main() {
  if (
    !existsSync(
      resolve(
        PROJECT_ROOT,
        "package.json",
      ),
    )
  ) {
    throw new Error(
      "Ejecuta este script desde la carpeta raíz de Fixora.",
    );
  }

  const argumentsObject =
    parseArguments(
      process.argv.slice(2),
    );

  if (argumentsObject.help) {
    printHelp();
    return;
  }

  loadEnvironmentFile(
    ".env",
    false,
  );

  loadEnvironmentFile(
    ".env.local",
    true,
  );

  const firstNames =
    requireArgument(
      argumentsObject,
      "first-names",
    );

  const lastNames =
    requireArgument(
      argumentsObject,
      "last-names",
    );

  const username =
    requireArgument(
      argumentsObject,
      "username",
    );

  const email =
    normalizeEmail(
      requireArgument(
        argumentsObject,
        "email",
      ),
    );

  const accessYears =
    validateAccessYears(
      argumentsObject[
        "access-years"
      ],
    );

  const usernameNormalized =
    normalizeUsername(
      username,
    );

  const usernameSkeleton =
    createUsernameSkeleton(
      username,
    );

  validateName(
    firstNames,
    "Los nombres",
    100,
  );

  validateName(
    lastNames,
    "Los apellidos",
    150,
  );

  validateUsername(
    username,
    usernameNormalized,
    usernameSkeleton,
  );

  validateEmail(
    email,
  );

  let password =
    await obtainPassword();

  const administrator = {
    firstNames,
    lastNames,
    username,
    usernameNormalized,
    usernameSkeleton,
    email,

    emailNormalized:
      email,

    accessYears,

    passwordHash:
      hashPassword(
        password,
      ),
  };

  password = "";

  const sql =
    await loadSqlServerLibrary();

  const configuration =
    buildSqlConfiguration();

  let pool;

  try {
    pool =
      await new sql.ConnectionPool(
        configuration,
      ).connect();

    await verifyRequiredSchema(
      pool,
    );

    const createdAccount =
      await createAdministrator(
        sql,
        pool,
        administrator,
      );

    console.log(
      "\nAdministrador creado correctamente.",
    );

    console.log(
      "--------------------------------",
    );

    console.log(
      `ID: ${createdAccount.account_id}`,
    );

    console.log(
      `Nombre de pila: ${createdAccount.username}`,
    );

    console.log(
      `Correo: ${createdAccount.email}`,
    );

    console.log(
      `Rol: ${createdAccount.role}`,
    );

    console.log(
      `Estado: ${createdAccount.status}`,
    );

    console.log(
      `Correo verificado: ${createdAccount.email_verified_at.toISOString()}`,
    );

    console.log(
      `Acceso iniciado: ${createdAccount.access_started_at.toISOString()}`,
    );

    console.log(
      `Acceso vence: ${createdAccount.access_expires_at.toISOString()}`,
    );
  } finally {
    if (pool) {
      await pool.close();
    }

    delete process.env
      .FIXORA_ADMIN_PASSWORD;
  }
}

main().catch(
  (error) => {
    console.error(
      `\nNo se pudo crear el administrador: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`,
    );

    process.exitCode = 1;
  },
);