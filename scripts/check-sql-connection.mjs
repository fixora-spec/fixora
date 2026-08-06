import {
  existsSync,
  readFileSync,
} from "node:fs";

import {
  resolve,
} from "node:path";

import process from "node:process";

const PROJECT_ROOT = process.cwd();
const ORIGINAL_ENVIRONMENT_KEYS = new Set(Object.keys(process.env));

const MAXIMUM_STANDARD_VALUE_LENGTH = 500;
const MAXIMUM_SECRET_LENGTH = 1_024;
const MINIMUM_SQL_PASSWORD_LENGTH = 16;

const REQUIRED_TABLES = Object.freeze([
  "accounts",
  "auth_verification_codes",
  "auth_sessions",
  "notifications",
  "auth_rate_limits",
  "auth_audit_events",
]);

const REQUIRED_COLUMNS = Object.freeze({
  accounts: Object.freeze([
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
    "avatar_url",
    "email_verified_at",
    "access_started_at",
    "access_expires_at",
    "failed_sign_in_attempts",
    "locked_until",
    "last_sign_in_at",
    "created_at",
    "updated_at",
    "row_version",
  ]),

  auth_verification_codes: Object.freeze([
    "verification_id",
    "account_id",
    "purpose",
    "code_hash",
    "attempts_used",
    "maximum_attempts",
    "resend_available_at",
    "created_at",
    "expires_at",
    "consumed_at",
  ]),

  auth_sessions: Object.freeze([
    "session_id",
    "account_id",
    "token_hash",
    "ip_address",
    "user_agent",
    "created_at",
    "expires_at",
    "last_seen_at",
    "revoked_at",
    "revocation_reason",
  ]),

  notifications: Object.freeze([
    "notification_id",
    "account_id",
    "notification_type",
    "title_key",
    "message_key",
    "metadata_json",
    "created_at",
    "read_at",
  ]),

  auth_rate_limits: Object.freeze([
    "rate_limit_id",
    "action_name",
    "identifier_hash",
    "attempt_count",
    "window_started_at",
    "blocked_until",
    "created_at",
    "updated_at",
  ]),

  auth_audit_events: Object.freeze([
    "audit_event_id",
    "account_id",
    "event_type",
    "successful",
    "ip_address",
    "user_agent",
    "metadata_json",
    "created_at",
  ]),
});

const REQUIRED_INDEXES = Object.freeze([
  "UX_accounts_username_normalized",
  "UX_accounts_username_skeleton",
  "UX_accounts_email_normalized",
  "IX_accounts_role_status",
  "UX_auth_verification_codes_hash",
  "IX_auth_verification_codes_account_purpose_created",
  "UX_auth_sessions_token_hash",
  "IX_auth_sessions_account_expires",
  "IX_notifications_account_created",
  "IX_notifications_account_unread",
  "UX_auth_rate_limits_action_identifier",
  "IX_auth_rate_limits_cleanup",
  "IX_auth_audit_events_account_created",
  "IX_auth_audit_events_type_created",
  "IX_accounts_admin_access_expiration",
]);

const REQUIRED_CHECK_CONSTRAINTS = Object.freeze([
  "CK_accounts_role",
  "CK_accounts_status",
  "CK_accounts_failed_sign_in_attempts",
  "CK_accounts_username_length",
  "CK_accounts_username_skeleton_length",
  "CK_accounts_email_length",
  "CK_accounts_access_window",
  "CK_auth_verification_codes_purpose",
  "CK_auth_verification_codes_attempts",
  "CK_auth_verification_codes_dates",
  "CK_auth_sessions_dates",
  "CK_notifications_metadata_json",
  "CK_auth_rate_limits_attempt_count",
  "CK_auth_audit_events_metadata_json",
]);

function containsForbiddenControlCharacters(value) {
  return /[\r\n\0]/u.test(value);
}

function parseQuotedValue(value, quote) {
  const content = value.slice(1, -1);

  if (quote === "'") {
    return content;
  }

  return content
    .replaceAll("\\n", "\n")
    .replaceAll("\\r", "\r")
    .replaceAll("\\t", "\t")
    .replaceAll('\\"', '"')
    .replaceAll("\\\\", "\\");
}

function parseEnvironmentLine(line) {
  let source = line.trimStart();

  if (source.length === 0 || source.startsWith("#")) {
    return null;
  }

  if (source.startsWith("export ")) {
    source = source.slice("export ".length).trimStart();
  }

  const separatorIndex = source.indexOf("=");

  if (separatorIndex <= 0) {
    return null;
  }

  const key = source.slice(0, separatorIndex).trim();

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) {
    return null;
  }

  const rawValue = source.slice(separatorIndex + 1);
  const leftTrimmedValue = rawValue.trimStart();

  if (leftTrimmedValue.length === 0) {
    return {
      key,
      value: "",
    };
  }

  const quote = leftTrimmedValue[0];

  if (quote === '"' || quote === "'") {
    let closingIndex = -1;
    let escaped = false;

    for (let index = 1; index < leftTrimmedValue.length; index += 1) {
      const character = leftTrimmedValue[index];

      if (quote === '"' && character === "\\" && !escaped) {
        escaped = true;
        continue;
      }

      if (character === quote && !escaped) {
        closingIndex = index;
        break;
      }

      escaped = false;
    }

    if (closingIndex === -1) {
      return {
        key,
        value: leftTrimmedValue,
      };
    }

    return {
      key,
      value: parseQuotedValue(
        leftTrimmedValue.slice(0, closingIndex + 1),
        quote,
      ),
    };
  }

  const commentMatch = /\s+#/u.exec(leftTrimmedValue);
  const unquotedValue = commentMatch
    ? leftTrimmedValue.slice(0, commentMatch.index)
    : leftTrimmedValue;

  return {
    key,
    value: unquotedValue.trim(),
  };
}

function loadEnvironmentFile(fileName, allowOverride) {
  const filePath = resolve(PROJECT_ROOT, fileName);

  if (!existsSync(filePath)) {
    return false;
  }

  const content = readFileSync(filePath, "utf8").replace(/^\uFEFF/u, "");

  for (const line of content.split(/\r?\n/u)) {
    const parsedLine = parseEnvironmentLine(line);

    if (!parsedLine) {
      continue;
    }

    const {
      key,
      value,
    } = parsedLine;

    // Las variables del proceso siempre tienen prioridad sobre los archivos.
    if (ORIGINAL_ENVIRONMENT_KEYS.has(key)) {
      continue;
    }

    if (allowOverride || typeof process.env[key] === "undefined") {
      process.env[key] = value;
    }
  }

  return true;
}

function readRequiredEnvironmentValue(
  name,
  maximumLength = MAXIMUM_STANDARD_VALUE_LENGTH,
) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Falta la variable obligatoria ${name}.`);
  }

  if (
    value.length > maximumLength
    || containsForbiddenControlCharacters(value)
  ) {
    throw new Error(`${name} contiene un valor no permitido.`);
  }

  return value;
}

function readRequiredSecretEnvironmentValue(name) {
  const value = process.env[name];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Falta la variable obligatoria ${name}.`);
  }

  if (
    value.length < MINIMUM_SQL_PASSWORD_LENGTH
    || value.length > MAXIMUM_SECRET_LENGTH
    || containsForbiddenControlCharacters(value)
  ) {
    throw new Error(
      `${name} debe tener entre ${MINIMUM_SQL_PASSWORD_LENGTH} y ${MAXIMUM_SECRET_LENGTH} caracteres y no puede contener saltos de línea.`,
    );
  }

  // Las contraseñas se conservan exactamente como fueron configuradas.
  return value;
}

function readOptionalEnvironmentValue(
  name,
  maximumLength = MAXIMUM_STANDARD_VALUE_LENGTH,
) {
  const rawValue = process.env[name];

  if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
    return null;
  }

  const value = rawValue.trim();

  if (
    value.length > maximumLength
    || containsForbiddenControlCharacters(value)
  ) {
    throw new Error(`${name} contiene un valor no permitido.`);
  }

  return value;
}

function readBooleanEnvironmentValue(name, defaultValue) {
  const value = readOptionalEnvironmentValue(name, 5);

  if (value === null) {
    return defaultValue;
  }

  const normalizedValue = value.toLowerCase();

  if (normalizedValue === "true") {
    return true;
  }

  if (normalizedValue === "false") {
    return false;
  }

  throw new Error(`${name} debe tener el valor true o false.`);
}

function readIntegerEnvironmentValue(
  name,
  defaultValue,
  minimum,
  maximum,
) {
  const value = readOptionalEnvironmentValue(name, 20);

  if (value === null) {
    return defaultValue;
  }

  if (!/^\d+$/u.test(value)) {
    throw new Error(`${name} debe contener un número entero válido.`);
  }

  const parsedValue = Number.parseInt(value, 10);

  if (
    !Number.isSafeInteger(parsedValue)
    || parsedValue < minimum
    || parsedValue > maximum
  ) {
    throw new Error(`${name} debe estar entre ${minimum} y ${maximum}.`);
  }

  return parsedValue;
}

function validateSqlHost(value) {
  if (/\s|[\\/,;]/u.test(value)) {
    throw new Error(
      "SQL_SERVER_HOST debe contener solamente el nombre o la dirección del servidor. Configure la instancia y el puerto por separado.",
    );
  }

  return value;
}

function validateSqlName(value, variableName) {
  if (value.length > 128) {
    throw new Error(`${variableName} no puede superar 128 caracteres.`);
  }

  return value;
}

function validateInstanceName(value) {
  if (!/^[A-Za-z0-9_.-]{1,128}$/u.test(value)) {
    throw new Error("SQL_SERVER_INSTANCE contiene un nombre no válido.");
  }

  return value;
}

function buildSqlConfiguration() {
  const nodeEnvironment = process.env.NODE_ENV?.trim().toLowerCase()
    || "development";

  const instanceName = readOptionalEnvironmentValue(
    "SQL_SERVER_INSTANCE",
    128,
  );

  const portValue = readOptionalEnvironmentValue(
    "SQL_SERVER_PORT",
    5,
  );

  if (instanceName && portValue) {
    throw new Error(
      "Configure SQL_SERVER_INSTANCE o SQL_SERVER_PORT, pero no ambos.",
    );
  }

  if (!instanceName && !portValue) {
    throw new Error(
      "Debe configurar SQL_SERVER_INSTANCE o SQL_SERVER_PORT.",
    );
  }

  const poolMinimum = readIntegerEnvironmentValue(
    "SQL_SERVER_POOL_MIN",
    0,
    0,
    100,
  );

  const poolMaximum = readIntegerEnvironmentValue(
    "SQL_SERVER_POOL_MAX",
    10,
    1,
    100,
  );

  if (poolMinimum > poolMaximum) {
    throw new Error(
      "SQL_SERVER_POOL_MIN no puede ser mayor que SQL_SERVER_POOL_MAX.",
    );
  }

  const encrypt = readBooleanEnvironmentValue(
    "SQL_SERVER_ENCRYPT",
    nodeEnvironment === "production",
  );

  const trustServerCertificate = readBooleanEnvironmentValue(
    "SQL_SERVER_TRUST_SERVER_CERTIFICATE",
    nodeEnvironment !== "production",
  );

  if (nodeEnvironment === "production" && !encrypt) {
    throw new Error("SQL_SERVER_ENCRYPT debe ser true en producción.");
  }

  if (nodeEnvironment === "production" && trustServerCertificate) {
    throw new Error(
      "SQL_SERVER_TRUST_SERVER_CERTIFICATE debe ser false en producción.",
    );
  }

  const configuration = {
    server: validateSqlHost(
      readRequiredEnvironmentValue("SQL_SERVER_HOST", 253),
    ),

    database: validateSqlName(
      readRequiredEnvironmentValue("SQL_SERVER_DATABASE", 128),
      "SQL_SERVER_DATABASE",
    ),

    user: validateSqlName(
      readRequiredEnvironmentValue("SQL_SERVER_USER", 128),
      "SQL_SERVER_USER",
    ),

    password: readRequiredSecretEnvironmentValue("SQL_SERVER_PASSWORD"),

    connectionTimeout: readIntegerEnvironmentValue(
      "SQL_SERVER_CONNECTION_TIMEOUT_MS",
      15_000,
      1_000,
      120_000,
    ),

    requestTimeout: readIntegerEnvironmentValue(
      "SQL_SERVER_REQUEST_TIMEOUT_MS",
      15_000,
      1_000,
      120_000,
    ),

    pool: {
      min: poolMinimum,
      max: poolMaximum,
      idleTimeoutMillis: readIntegerEnvironmentValue(
        "SQL_SERVER_POOL_IDLE_TIMEOUT_MS",
        30_000,
        1_000,
        600_000,
      ),
    },

    options: {
      encrypt,
      trustServerCertificate,
      enableArithAbort: true,
      appName: "Fixora SQL connection check",
    },
  };

  if (instanceName) {
    configuration.options.instanceName = validateInstanceName(instanceName);
  } else {
    configuration.port = readIntegerEnvironmentValue(
      "SQL_SERVER_PORT",
      1433,
      1,
      65_535,
    );
  }

  return configuration;
}

function createExpectedColumnRows() {
  return Object.entries(REQUIRED_COLUMNS).flatMap(
    ([tableName, columns]) => columns.map((columnName) => ({
      tableName,
      columnName,
    })),
  );
}

function createDestinationLabel(configuration) {
  if (typeof configuration.port === "number") {
    return `${configuration.server}:${configuration.port}`;
  }

  return `${configuration.server}\\${configuration.options.instanceName}`;
}

function sanitizeErrorMessage(error, configuration) {
  const rawMessage = error instanceof Error
    ? error.message
    : String(error);

  const sensitiveValues = [
    configuration.password,
    process.env.SQL_SERVER_PASSWORD,
  ].filter(
    (value) => typeof value === "string" && value.length > 0,
  );

  return sensitiveValues.reduce(
    (message, secret) => message.replaceAll(secret, "[OCULTO]"),
    rawMessage,
  );
}

function getSqlErrorCode(error) {
  if (
    error
    && typeof error === "object"
    && "code" in error
    && typeof error.code === "string"
  ) {
    return error.code;
  }

  return null;
}

function printConnectionError(error, configuration) {
  const errorCode = getSqlErrorCode(error);

  console.error("\nNo se pudo completar la comprobación de SQL Server.");
  console.error("------------------------------------------------");
  console.error(`Destino: ${createDestinationLabel(configuration)}`);
  console.error(`Base de datos: ${configuration.database}`);
  console.error(`Usuario SQL: ${configuration.user}`);

  if (errorCode) {
    console.error(`Código: ${errorCode}`);
  }

  console.error(`Mensaje: ${sanitizeErrorMessage(error, configuration)}`);

  switch (errorCode) {
    case "ETIMEOUT":
      console.error(
        "\nCompruebe que SQL Server esté iniciado, que TCP/IP esté habilitado y que la instancia o el puerto sean correctos.",
      );
      break;

    case "ELOGIN":
      console.error(
        "\nCompruebe SQL_SERVER_USER, SQL_SERVER_PASSWORD y que SQL Server utilice autenticación mixta.",
      );
      break;

    case "ESOCKET":
      console.error(
        "\nCompruebe el servicio de SQL Server, el firewall y la configuración TCP/IP.",
      );
      break;

    default:
      break;
  }
}

async function loadSqlServerLibrary() {
  try {
    const sqlModule = await import("mssql");

    return sqlModule.default ?? sqlModule;
  } catch {
    throw new Error(
      'No se encontró la dependencia "mssql". Ejecute "pnpm install" desde la raíz del proyecto.',
    );
  }
}

async function readServerInformation(pool) {
  const result = await pool.request().query(`
    SELECT
      CAST(SERVERPROPERTY('ServerName') AS NVARCHAR(256)) AS server_name,
      CAST(SERVERPROPERTY('InstanceName') AS NVARCHAR(256)) AS instance_name,
      CAST(SERVERPROPERTY('Edition') AS NVARCHAR(256)) AS edition,
      CAST(SERVERPROPERTY('ProductVersion') AS NVARCHAR(128)) AS product_version,
      CAST(SERVERPROPERTY('IsIntegratedSecurityOnly') AS INT)
        AS integrated_security_only,
      DB_NAME() AS database_name,
      SUSER_SNAME() AS login_name,
      USER_NAME() AS database_user,
      CAST(DATABASEPROPERTYEX(DB_NAME(), 'Status') AS NVARCHAR(60))
        AS database_status,
      CAST(DATABASEPROPERTYEX(DB_NAME(), 'Updateability') AS NVARCHAR(60))
        AS database_updateability,
      CAST(DATABASEPROPERTYEX(DB_NAME(), 'UserAccess') AS NVARCHAR(60))
        AS database_user_access,
      IS_ROLEMEMBER(N'db_owner') AS is_db_owner,
      IS_ROLEMEMBER(N'db_securityadmin') AS is_db_securityadmin,
      IS_ROLEMEMBER(N'db_accessadmin') AS is_db_accessadmin,
      IS_ROLEMEMBER(N'db_ddladmin') AS is_db_ddladmin,
      HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'CONTROL')
        AS has_database_control,
      HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'ALTER')
        AS has_database_alter,
      HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'ALTER ANY USER')
        AS has_alter_any_user,
      HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'CREATE TABLE')
        AS has_create_table;
  `);

  const information = result.recordset[0];

  if (!information) {
    throw new Error("SQL Server no devolvió información de la conexión.");
  }

  return information;
}

async function readSchemaInformation(pool) {
  const tableResult = await pool.request().query(`
    SELECT [name]
    FROM sys.tables
    WHERE schema_id = SCHEMA_ID(N'dbo');
  `);

  const columnResult = await pool.request().query(`
    SELECT
      OBJECT_NAME([object_id]) AS table_name,
      [name] AS column_name
    FROM sys.columns
    WHERE OBJECT_SCHEMA_NAME([object_id]) = N'dbo';
  `);

  const indexResult = await pool.request().query(`
    SELECT [name]
    FROM sys.indexes
    WHERE
      [name] IS NOT NULL
      AND OBJECT_SCHEMA_NAME([object_id]) = N'dbo';
  `);

  const constraintResult = await pool.request().query(`
    SELECT
      [name],
      is_disabled,
      is_not_trusted
    FROM sys.check_constraints
    WHERE OBJECT_SCHEMA_NAME(parent_object_id) = N'dbo';
  `);

  return {
    tables: new Set(
      tableResult.recordset.map((record) => String(record.name)),
    ),

    columns: new Set(
      columnResult.recordset.map(
        (record) => `${record.table_name}.${record.column_name}`,
      ),
    ),

    indexes: new Set(
      indexResult.recordset.map((record) => String(record.name)),
    ),

    constraints: new Map(
      constraintResult.recordset.map((record) => [
        String(record.name),
        {
          disabled: Boolean(record.is_disabled),
          notTrusted: Boolean(record.is_not_trusted),
        },
      ]),
    ),
  };
}

async function readApplicationPermissions(pool) {
  const result = await pool.request().query(`
    SELECT
      HAS_PERMS_BY_NAME(N'dbo.accounts', N'OBJECT', N'SELECT')
        AS accounts_select,
      HAS_PERMS_BY_NAME(N'dbo.accounts', N'OBJECT', N'INSERT')
        AS accounts_insert,
      HAS_PERMS_BY_NAME(N'dbo.accounts', N'OBJECT', N'UPDATE')
        AS accounts_update,

      HAS_PERMS_BY_NAME(N'dbo.auth_verification_codes', N'OBJECT', N'SELECT')
        AS verification_select,
      HAS_PERMS_BY_NAME(N'dbo.auth_verification_codes', N'OBJECT', N'INSERT')
        AS verification_insert,
      HAS_PERMS_BY_NAME(N'dbo.auth_verification_codes', N'OBJECT', N'UPDATE')
        AS verification_update,

      HAS_PERMS_BY_NAME(N'dbo.auth_sessions', N'OBJECT', N'SELECT')
        AS sessions_select,
      HAS_PERMS_BY_NAME(N'dbo.auth_sessions', N'OBJECT', N'INSERT')
        AS sessions_insert,
      HAS_PERMS_BY_NAME(N'dbo.auth_sessions', N'OBJECT', N'UPDATE')
        AS sessions_update,

      HAS_PERMS_BY_NAME(N'dbo.notifications', N'OBJECT', N'SELECT')
        AS notifications_select,
      HAS_PERMS_BY_NAME(N'dbo.notifications', N'OBJECT', N'INSERT')
        AS notifications_insert,
      HAS_PERMS_BY_NAME(N'dbo.notifications', N'OBJECT', N'UPDATE')
        AS notifications_update,

      HAS_PERMS_BY_NAME(N'dbo.auth_rate_limits', N'OBJECT', N'SELECT')
        AS rate_limits_select,
      HAS_PERMS_BY_NAME(N'dbo.auth_rate_limits', N'OBJECT', N'INSERT')
        AS rate_limits_insert,
      HAS_PERMS_BY_NAME(N'dbo.auth_rate_limits', N'OBJECT', N'UPDATE')
        AS rate_limits_update,
      HAS_PERMS_BY_NAME(N'dbo.auth_rate_limits', N'OBJECT', N'DELETE')
        AS rate_limits_delete,

      HAS_PERMS_BY_NAME(N'dbo.auth_audit_events', N'OBJECT', N'INSERT')
        AS audit_insert,
      HAS_PERMS_BY_NAME(N'dbo.auth_audit_events', N'OBJECT', N'SELECT')
        AS audit_select;
  `);

  return result.recordset[0] ?? {};
}

function evaluateSchema(schemaInformation) {
  const missingTables = REQUIRED_TABLES.filter(
    (tableName) => !schemaInformation.tables.has(tableName),
  );

  const missingColumns = createExpectedColumnRows()
    .filter(
      ({
        tableName,
        columnName,
      }) => !schemaInformation.columns.has(`${tableName}.${columnName}`),
    )
    .map(
      ({
        tableName,
        columnName,
      }) => `dbo.${tableName}.${columnName}`,
    );

  const missingIndexes = REQUIRED_INDEXES.filter(
    (indexName) => !schemaInformation.indexes.has(indexName),
  );

  const missingConstraints = REQUIRED_CHECK_CONSTRAINTS.filter(
    (constraintName) => !schemaInformation.constraints.has(constraintName),
  );

  const unsafeConstraints = REQUIRED_CHECK_CONSTRAINTS.filter(
    (constraintName) => {
      const constraint = schemaInformation.constraints.get(constraintName);

      return constraint
        && (constraint.disabled || constraint.notTrusted);
    },
  );

  return {
    missingTables,
    missingColumns,
    missingIndexes,
    missingConstraints,
    unsafeConstraints,
  };
}

function evaluatePermissions(permissions) {
  const requiredPermissions = [
    ["dbo.accounts SELECT", permissions.accounts_select],
    ["dbo.accounts INSERT", permissions.accounts_insert],
    ["dbo.accounts UPDATE", permissions.accounts_update],
    ["dbo.auth_verification_codes SELECT", permissions.verification_select],
    ["dbo.auth_verification_codes INSERT", permissions.verification_insert],
    ["dbo.auth_verification_codes UPDATE", permissions.verification_update],
    ["dbo.auth_sessions SELECT", permissions.sessions_select],
    ["dbo.auth_sessions INSERT", permissions.sessions_insert],
    ["dbo.auth_sessions UPDATE", permissions.sessions_update],
    ["dbo.notifications SELECT", permissions.notifications_select],
    ["dbo.notifications INSERT", permissions.notifications_insert],
    ["dbo.notifications UPDATE", permissions.notifications_update],
    ["dbo.auth_rate_limits SELECT", permissions.rate_limits_select],
    ["dbo.auth_rate_limits INSERT", permissions.rate_limits_insert],
    ["dbo.auth_rate_limits UPDATE", permissions.rate_limits_update],
    ["dbo.auth_rate_limits DELETE", permissions.rate_limits_delete],
    ["dbo.auth_audit_events INSERT", permissions.audit_insert],
  ];

  const missingPermissions = requiredPermissions
    .filter(([, granted]) => Number(granted) !== 1)
    .map(([permissionName]) => permissionName);

  const warnings = [];

  // La aplicación solo necesita insertar auditorías, no leer todo el historial.
  if (Number(permissions.audit_select) === 1) {
    warnings.push(
      "fixora_app puede leer dbo.auth_audit_events; por mínimo privilegio se recomienda mantener solamente INSERT.",
    );
  }

  return {
    missingPermissions,
    warnings,
  };
}

function printList(title, values) {
  if (values.length === 0) {
    return;
  }

  console.warn(`\n${title}:`);

  for (const value of values) {
    console.warn(`- ${value}`);
  }
}

async function main() {
  if (!existsSync(resolve(PROJECT_ROOT, "package.json"))) {
    throw new Error(
      "Ejecute este script desde la raíz de Fixora, donde está package.json.",
    );
  }

  const loadedBaseEnvironment = loadEnvironmentFile(".env", false);
  const loadedLocalEnvironment = loadEnvironmentFile(".env.local", true);

  if (!loadedBaseEnvironment && !loadedLocalEnvironment) {
    throw new Error("No se encontró .env ni .env.local.");
  }

  const configuration = buildSqlConfiguration();
  const sql = await loadSqlServerLibrary();

  let pool;

  try {
    pool = await new sql.ConnectionPool(configuration).connect();

    const [
      serverInformation,
      schemaInformation,
      permissions,
    ] = await Promise.all([
      readServerInformation(pool),
      readSchemaInformation(pool),
      readApplicationPermissions(pool),
    ]);

    const schemaEvaluation = evaluateSchema(schemaInformation);
    const permissionEvaluation = evaluatePermissions(permissions);

    const unsafeRoles = [
      ["db_owner", serverInformation.is_db_owner],
      ["db_securityadmin", serverInformation.is_db_securityadmin],
      ["db_accessadmin", serverInformation.is_db_accessadmin],
      ["db_ddladmin", serverInformation.is_db_ddladmin],
    ]
      .filter(([, member]) => Number(member) === 1)
      .map(([roleName]) => roleName);

    console.log("\nConexión con SQL Server realizada correctamente.");
    console.log("-----------------------------------------------");
    console.log(`Servidor: ${serverInformation.server_name}`);
    console.log(
      `Instancia: ${serverInformation.instance_name ?? "Predeterminada"}`,
    );
    console.log(`Edición: ${serverInformation.edition}`);
    console.log(`Versión: ${serverInformation.product_version}`);
    console.log(`Base de datos: ${serverInformation.database_name}`);
    console.log(`Estado de base: ${serverInformation.database_status}`);
    console.log(
      `Modo de actualización: ${serverInformation.database_updateability}`,
    );
    console.log(`Acceso de usuarios: ${serverInformation.database_user_access}`);
    console.log(`Login SQL: ${serverInformation.login_name}`);
    console.log(`Usuario de base: ${serverInformation.database_user}`);

    if (Number(serverInformation.integrated_security_only) === 1) {
      console.warn(
        "\nAdvertencia: SQL Server indica autenticación solamente integrada. El login SQL puede dejar de funcionar tras reiniciar o cambiar la instancia.",
      );
    }

    const hasSchemaErrors =
      schemaEvaluation.missingTables.length > 0
      || schemaEvaluation.missingColumns.length > 0
      || schemaEvaluation.missingIndexes.length > 0
      || schemaEvaluation.missingConstraints.length > 0
      || schemaEvaluation.unsafeConstraints.length > 0;

    const dangerousPermissions = [
      ["CONTROL DATABASE", serverInformation.has_database_control],
      ["ALTER DATABASE", serverInformation.has_database_alter],
      ["ALTER ANY USER", serverInformation.has_alter_any_user],
      ["CREATE TABLE", serverInformation.has_create_table],
    ]
      .filter(([, granted]) => Number(granted) === 1)
      .map(([permissionName]) => permissionName);

    const hasSecurityErrors =
      unsafeRoles.length > 0
      || dangerousPermissions.length > 0
      || permissionEvaluation.missingPermissions.length > 0;

    if (!hasSchemaErrors) {
      console.log("Esquema de autenticación: completo y validado.");
    }

    if (!hasSecurityErrors) {
      console.log("Permisos de fixora_app: mínimos requeridos disponibles.");
    }

    printList("Tablas faltantes", schemaEvaluation.missingTables);
    printList("Columnas faltantes", schemaEvaluation.missingColumns);
    printList("Índices faltantes", schemaEvaluation.missingIndexes);
    printList("Restricciones faltantes", schemaEvaluation.missingConstraints);
    printList(
      "Restricciones deshabilitadas o no confiables",
      schemaEvaluation.unsafeConstraints,
    );
    printList("Permisos obligatorios faltantes", permissionEvaluation.missingPermissions);
    printList("Roles administrativos no permitidos", unsafeRoles);
    printList("Permisos administrativos no permitidos", dangerousPermissions);
    printList("Advertencias de mínimo privilegio", permissionEvaluation.warnings);

    if (hasSchemaErrors || hasSecurityErrors) {
      console.warn(
        "\nLa conexión funciona, pero la base no está lista para autenticación segura.",
      );
      console.warn(
        "Ejecute en orden database/001_authentication_schema.sql y database/002_admin_access_expiration.sql con una cuenta administradora.",
      );

      process.exitCode = 2;
    }
  } catch (error) {
    printConnectionError(error, configuration);
    process.exitCode = 1;
  } finally {
    if (pool) {
      try {
        await pool.close();
      } catch {
        console.warn("No se pudo cerrar limpiamente el pool de SQL Server.");
      }
    }

    delete process.env.SQL_SERVER_PASSWORD;
    configuration.password = "";
  }
}

main().catch((error) => {
  console.error(
    `\nNo se pudo iniciar la comprobación: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );

  process.exitCode = 1;
});
