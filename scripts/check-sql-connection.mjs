import {
  existsSync,
  readFileSync,
} from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const originalEnvironmentKeys = new Set(Object.keys(process.env));

function parseEnvironmentLine(line) {
  const trimmedLine = line.trim();

  if (
    trimmedLine.length === 0
    || trimmedLine.startsWith("#")
  ) {
    return null;
  }

  const separatorIndex = trimmedLine.indexOf("=");

  if (separatorIndex <= 0) {
    return null;
  }

  const key = trimmedLine
    .slice(0, separatorIndex)
    .trim();

  let value = trimmedLine
    .slice(separatorIndex + 1)
    .trim();

  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return {
    key,
    value,
  };
}

function loadEnvironmentFile(fileName, allowOverride) {
  const filePath = resolve(projectRoot, fileName);

  if (!existsSync(filePath)) {
    return false;
  }

  const content = readFileSync(filePath, "utf8")
    .replace(/^\uFEFF/, "");

  for (const line of content.split(/\r?\n/u)) {
    const parsedLine = parseEnvironmentLine(line);

    if (!parsedLine) {
      continue;
    }

    const { key, value } = parsedLine;

    if (originalEnvironmentKeys.has(key)) {
      continue;
    }

    if (
      allowOverride
      || typeof process.env[key] === "undefined"
    ) {
      process.env[key] = value;
    }
  }

  return true;
}

function requireEnvironmentValue(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Falta la variable obligatoria ${name} en .env.local.`,
    );
  }

  return value;
}

function readInteger(name, defaultValue, minimum, maximum) {
  const rawValue = process.env[name]?.trim();

  if (!rawValue) {
    return defaultValue;
  }

  const parsedValue = Number.parseInt(rawValue, 10);

  if (
    !Number.isInteger(parsedValue)
    || parsedValue < minimum
    || parsedValue > maximum
  ) {
    throw new Error(
      `${name} debe ser un número entero entre ${minimum} y ${maximum}.`,
    );
  }

  return parsedValue;
}

function readBoolean(name, defaultValue) {
  const rawValue = process.env[name]?.trim().toLowerCase();

  if (!rawValue) {
    return defaultValue;
  }

  if (rawValue === "true") {
    return true;
  }

  if (rawValue === "false") {
    return false;
  }

  throw new Error(
    `${name} debe tener el valor true o false.`,
  );
}

function buildSqlConfiguration() {
  const server = requireEnvironmentValue(
    "SQL_SERVER_HOST",
  );

  const database = requireEnvironmentValue(
    "SQL_SERVER_DATABASE",
  );

  const user = requireEnvironmentValue(
    "SQL_SERVER_USER",
  );

  const password = requireEnvironmentValue(
    "SQL_SERVER_PASSWORD",
  );

  const instanceName =
    process.env.SQL_SERVER_INSTANCE?.trim() ?? "";

  const portValue =
    process.env.SQL_SERVER_PORT?.trim() ?? "";

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

  const port = portValue
    ? readInteger(
        "SQL_SERVER_PORT",
        1433,
        1,
        65535,
      )
    : undefined;

  const poolMinimum = readInteger(
    "SQL_SERVER_POOL_MIN",
    0,
    0,
    100,
  );

  const poolMaximum = readInteger(
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

  const configuration = {
    server,
    database,
    user,
    password,

    connectionTimeout: readInteger(
      "SQL_SERVER_CONNECTION_TIMEOUT_MS",
      15000,
      1000,
      120000,
    ),

    requestTimeout: readInteger(
      "SQL_SERVER_REQUEST_TIMEOUT_MS",
      15000,
      1000,
      120000,
    ),

    pool: {
      min: poolMinimum,
      max: poolMaximum,

      idleTimeoutMillis: readInteger(
        "SQL_SERVER_POOL_IDLE_TIMEOUT_MS",
        30000,
        1000,
        600000,
      ),
    },

    options: {
      encrypt: readBoolean(
        "SQL_SERVER_ENCRYPT",
        false,
      ),

      trustServerCertificate: readBoolean(
        "SQL_SERVER_TRUST_SERVER_CERTIFICATE",
        true,
      ),

      enableArithAbort: true,
    },
  };

  if (instanceName) {
    configuration.options.instanceName = instanceName;
  }

  if (typeof port === "number") {
    configuration.port = port;
  }

  return configuration;
}

function printConnectionError(error, configuration) {
  console.error("\nNo se pudo conectar con SQL Server.");
  console.error("-----------------------------------");

  if (error instanceof Error) {
    console.error(`Mensaje: ${error.message}`);
  }

  if (
    error
    && typeof error === "object"
    && "code" in error
  ) {
    console.error(`Código: ${String(error.code)}`);
  }

  const destination = configuration.port
    ? `${configuration.server}:${configuration.port}`
    : `${configuration.server}\\${configuration.options.instanceName}`;

  console.error(`Destino: ${destination}`);
  console.error(`Base de datos: ${configuration.database}`);
  console.error(`Usuario SQL: ${configuration.user}`);

  if (
    error
    && typeof error === "object"
    && "code" in error
  ) {
    switch (error.code) {
      case "ETIMEOUT":
        console.error(
          "\nCompruebe que TCP/IP esté habilitado y que la instancia o el puerto sean correctos.",
        );
        break;

      case "ELOGIN":
        console.error(
          "\nCompruebe el usuario, la contraseña y que SQL Server utilice autenticación mixta.",
        );
        break;

      case "ESOCKET":
        console.error(
          "\nCompruebe que SQL Server esté iniciado y escuchando mediante TCP/IP.",
        );
        break;

      default:
        break;
    }
  }
}

async function loadSqlServerLibrary() {
  try {
    const sqlModule = await import("mssql");

    return sqlModule.default ?? sqlModule;
  } catch {
    throw new Error(
      'No se encontró la dependencia "mssql". Ejecute: pnpm add mssql',
    );
  }
}
async function main() {
  if (!existsSync(resolve(projectRoot, "package.json"))) {
    throw new Error(
      "Ejecute este script desde la raíz de Fixora.",
    );
  }

  loadEnvironmentFile(".env", false);
  loadEnvironmentFile(".env.local", true);

  const configuration = buildSqlConfiguration();
  const sql = await loadSqlServerLibrary();

  let pool;

  try {
    pool = await new sql.ConnectionPool(
      configuration,
    ).connect();

    const informationResult = await pool.request().query(`
      SELECT
          CAST(SERVERPROPERTY('ServerName') AS NVARCHAR(256))
              AS server_name,

          CAST(SERVERPROPERTY('InstanceName') AS NVARCHAR(256))
              AS instance_name,

          CAST(SERVERPROPERTY('Edition') AS NVARCHAR(256))
              AS edition,

          CAST(SERVERPROPERTY('ProductVersion') AS NVARCHAR(128))
              AS product_version,

          DB_NAME() AS database_name,
          SUSER_SNAME() AS login_name,
          USER_NAME() AS database_user;
    `);

    const requiredTables = [
      "accounts",
      "auth_verification_codes",
      "auth_sessions",
      "notifications",
      "auth_rate_limits",
      "auth_audit_events",
    ];

    const tableResult = await pool.request().query(`
      SELECT [name]
      FROM sys.tables
      WHERE [name] IN
      (
          N'accounts',
          N'auth_verification_codes',
          N'auth_sessions',
          N'notifications',
          N'auth_rate_limits',
          N'auth_audit_events'
      )
      ORDER BY [name];
    `);

    const existingTables = new Set(
      tableResult.recordset.map(
        (record) => record.name,
      ),
    );

    const missingTables = requiredTables.filter(
      (tableName) => !existingTables.has(tableName),
    );

    const information = informationResult.recordset[0];

    console.log("\nConexión con SQL Server realizada correctamente.");
    console.log("-----------------------------------------------");
    console.log(`Servidor: ${information.server_name}`);
    console.log(
      `Instancia: ${information.instance_name ?? "Predeterminada"}`,
    );
    console.log(`Edición: ${information.edition}`);
    console.log(`Versión: ${information.product_version}`);
    console.log(`Base de datos: ${information.database_name}`);
    console.log(`Login SQL: ${information.login_name}`);
    console.log(`Usuario de base: ${information.database_user}`);

    if (missingTables.length === 0) {
      console.log(
        "Esquema de autenticación: completo.",
      );
    } else {
      console.warn(
        "\nLa conexión funciona, pero faltan estas tablas:",
      );

      for (const tableName of missingTables) {
        console.warn(`- dbo.${tableName}`);
      }

      console.warn(
        "\nEjecute database/001_authentication_schema.sql.",
      );

      process.exitCode = 2;
    }
  } catch (error) {
    printConnectionError(error, configuration);
    process.exitCode = 1;
  } finally {
    if (pool) {
      await pool.close();
    }
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : String(error),
  );

  process.exitCode = 1;
});