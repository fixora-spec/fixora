import "server-only";

import type {
  SqlServerConfiguration,
  SqlServerConnectionMode,
} from "@/types/database";

const DEFAULT_CONNECTION_TIMEOUT_MS = 15_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_POOL_MINIMUM = 0;
const DEFAULT_POOL_MAXIMUM = 10;
const DEFAULT_POOL_IDLE_TIMEOUT_MS = 30_000;

const MAXIMUM_STANDARD_VALUE_LENGTH = 253;
const MAXIMUM_SQL_NAME_LENGTH = 128;
const MINIMUM_SQL_PASSWORD_LENGTH = 16;
const MAXIMUM_SECRET_LENGTH = 1_024;

let cachedConfiguration: SqlServerConfiguration | null = null;

function containsForbiddenControlCharacters(value: string): boolean {
  return /\r|\n|\0/u.test(value);
}

function readRequiredEnvironmentValue(
  name: string,
  maximumLength = MAXIMUM_STANDARD_VALUE_LENGTH,
): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Falta la variable de entorno obligatoria ${name}.`,
    );
  }

  if (
    value.length > maximumLength
    || containsForbiddenControlCharacters(value)
  ) {
    throw new Error(`${name} contiene un valor no permitido.`);
  }

  return value;
}

function readRequiredSecretEnvironmentValue(name: string): string {
  const value = process.env[name];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(
      `Falta la variable de entorno obligatoria ${name}.`,
    );
  }

  if (value.length < MINIMUM_SQL_PASSWORD_LENGTH) {
    throw new Error(
      `${name} debe tener al menos ${MINIMUM_SQL_PASSWORD_LENGTH} caracteres.`,
    );
  }

  if (
    value.length > MAXIMUM_SECRET_LENGTH
    || containsForbiddenControlCharacters(value)
  ) {
    throw new Error(`${name} contiene un valor no permitido.`);
  }

  // Las contraseñas no se recortan: los espacios pueden formar parte
  // legítima de una credencial configurada en SQL Server.
  return value;
}

function readOptionalEnvironmentValue(
  name: string,
  maximumLength = MAXIMUM_STANDARD_VALUE_LENGTH,
): string | null {
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

function readBooleanEnvironmentValue(
  name: string,
  defaultValue: boolean,
): boolean {
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
  name: string,
  defaultValue: number,
  minimum: number,
  maximum: number,
): number {
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
    throw new Error(
      `${name} debe estar entre ${minimum} y ${maximum}.`,
    );
  }

  return parsedValue;
}

function validateSqlServerHost(value: string): string {
  if (/\s|[\\/,;]/u.test(value)) {
    throw new Error(
      "SQL_SERVER_HOST debe contener únicamente el nombre o la dirección del servidor. La instancia y el puerto se configuran por separado.",
    );
  }

  return value;
}

function validateSqlName(
  value: string,
  variableName: string,
): string {
  if (value.length > MAXIMUM_SQL_NAME_LENGTH) {
    throw new Error(
      `${variableName} no puede superar ${MAXIMUM_SQL_NAME_LENGTH} caracteres.`,
    );
  }

  return value;
}

function validateInstanceName(value: string): string {
  if (
    value.length > MAXIMUM_SQL_NAME_LENGTH
    || !/^[a-zA-Z0-9_.-]+$/u.test(value)
  ) {
    throw new Error(
      "SQL_SERVER_INSTANCE contiene un nombre de instancia no válido.",
    );
  }

  return value;
}

function createConnectionMode(): SqlServerConnectionMode {
  const instanceName = readOptionalEnvironmentValue(
    "SQL_SERVER_INSTANCE",
    MAXIMUM_SQL_NAME_LENGTH,
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

  if (instanceName) {
    return Object.freeze({
      type: "INSTANCE",
      instanceName: validateInstanceName(instanceName),
      port: null,
    });
  }

  return Object.freeze({
    type: "PORT",
    instanceName: null,
    port: readIntegerEnvironmentValue(
      "SQL_SERVER_PORT",
      1433,
      1,
      65_535,
    ),
  });
}

function validateProductionTransportSecurity(
  encrypt: boolean,
  trustServerCertificate: boolean,
): void {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  if (!encrypt) {
    throw new Error(
      "SQL_SERVER_ENCRYPT debe ser true en producción.",
    );
  }

  if (trustServerCertificate) {
    throw new Error(
      "SQL_SERVER_TRUST_SERVER_CERTIFICATE debe ser false en producción.",
    );
  }
}

function createSqlServerConfiguration(): SqlServerConfiguration {
  const isProduction = process.env.NODE_ENV === "production";

  const poolMinimum = readIntegerEnvironmentValue(
    "SQL_SERVER_POOL_MIN",
    DEFAULT_POOL_MINIMUM,
    0,
    100,
  );

  const poolMaximum = readIntegerEnvironmentValue(
    "SQL_SERVER_POOL_MAX",
    DEFAULT_POOL_MAXIMUM,
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
    isProduction,
  );

  const trustServerCertificate = readBooleanEnvironmentValue(
    "SQL_SERVER_TRUST_SERVER_CERTIFICATE",
    !isProduction,
  );

  validateProductionTransportSecurity(
    encrypt,
    trustServerCertificate,
  );

  const pool = Object.freeze({
    minimum: poolMinimum,
    maximum: poolMaximum,
    idleTimeoutMilliseconds: readIntegerEnvironmentValue(
      "SQL_SERVER_POOL_IDLE_TIMEOUT_MS",
      DEFAULT_POOL_IDLE_TIMEOUT_MS,
      1_000,
      600_000,
    ),
  });

  return Object.freeze({
    host: validateSqlServerHost(
      readRequiredEnvironmentValue("SQL_SERVER_HOST"),
    ),
    database: validateSqlName(
      readRequiredEnvironmentValue(
        "SQL_SERVER_DATABASE",
        MAXIMUM_SQL_NAME_LENGTH,
      ),
      "SQL_SERVER_DATABASE",
    ),
    user: validateSqlName(
      readRequiredEnvironmentValue(
        "SQL_SERVER_USER",
        MAXIMUM_SQL_NAME_LENGTH,
      ),
      "SQL_SERVER_USER",
    ),
    password: readRequiredSecretEnvironmentValue(
      "SQL_SERVER_PASSWORD",
    ),
    connectionMode: createConnectionMode(),
    encrypt,
    trustServerCertificate,
    connectionTimeoutMilliseconds: readIntegerEnvironmentValue(
      "SQL_SERVER_CONNECTION_TIMEOUT_MS",
      DEFAULT_CONNECTION_TIMEOUT_MS,
      1_000,
      120_000,
    ),
    requestTimeoutMilliseconds: readIntegerEnvironmentValue(
      "SQL_SERVER_REQUEST_TIMEOUT_MS",
      DEFAULT_REQUEST_TIMEOUT_MS,
      1_000,
      120_000,
    ),
    pool,
  });
}

export function getSqlServerConfiguration(): SqlServerConfiguration {
  if (cachedConfiguration) {
    return cachedConfiguration;
  }

  const configuration = createSqlServerConfiguration();
  cachedConfiguration = configuration;

  return configuration;
}

export function clearSqlServerConfigurationCache(): void {
  cachedConfiguration = null;
}