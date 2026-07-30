import "server-only";

import type {
  SqlServerConfiguration,
  SqlServerConnectionMode,
} from "@/types/database";

const DEFAULT_CONNECTION_TIMEOUT_MS =
  15_000;

const DEFAULT_REQUEST_TIMEOUT_MS =
  15_000;

const DEFAULT_POOL_MINIMUM =
  0;

const DEFAULT_POOL_MAXIMUM =
  10;

const DEFAULT_POOL_IDLE_TIMEOUT_MS =
  30_000;

let cachedConfiguration:
  | SqlServerConfiguration
  | null = null;

function readRequiredEnvironmentValue(
  name: string,
): string {
  const value =
    process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Falta la variable de entorno obligatoria ${name}.`,
    );
  }

  return value;
}

function readOptionalEnvironmentValue(
  name: string,
): string | null {
  const value =
    process.env[name]?.trim();

  return value || null;
}

function readBooleanEnvironmentValue(
  name: string,
  defaultValue: boolean,
): boolean {
  const value =
    readOptionalEnvironmentValue(name);

  if (value === null) {
    return defaultValue;
  }

  const normalizedValue =
    value.toLowerCase();

  if (normalizedValue === "true") {
    return true;
  }

  if (normalizedValue === "false") {
    return false;
  }

  throw new Error(
    `${name} debe tener el valor true o false.`,
  );
}

function readIntegerEnvironmentValue(
  name: string,
  defaultValue: number,
  minimum: number,
  maximum: number,
): number {
  const value =
    readOptionalEnvironmentValue(name);

  if (value === null) {
    return defaultValue;
  }

  if (!/^\d+$/u.test(value)) {
    throw new Error(
      `${name} debe contener un número entero válido.`,
    );
  }

  const parsedValue =
    Number.parseInt(value, 10);

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

function createConnectionMode():
  SqlServerConnectionMode {
  const instanceName =
    readOptionalEnvironmentValue(
      "SQL_SERVER_INSTANCE",
    );

  const portValue =
    readOptionalEnvironmentValue(
      "SQL_SERVER_PORT",
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
    return {
      type: "INSTANCE",
      instanceName,
      port: null,
    };
  }

  const port =
    readIntegerEnvironmentValue(
      "SQL_SERVER_PORT",
      1433,
      1,
      65_535,
    );

  return {
    type: "PORT",
    instanceName: null,
    port,
  };
}

function createSqlServerConfiguration():
  SqlServerConfiguration {
  const poolMinimum =
    readIntegerEnvironmentValue(
      "SQL_SERVER_POOL_MIN",
      DEFAULT_POOL_MINIMUM,
      0,
      100,
    );

  const poolMaximum =
    readIntegerEnvironmentValue(
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

  return {
    host:
      readRequiredEnvironmentValue(
        "SQL_SERVER_HOST",
      ),

    database:
      readRequiredEnvironmentValue(
        "SQL_SERVER_DATABASE",
      ),

    user:
      readRequiredEnvironmentValue(
        "SQL_SERVER_USER",
      ),

    password:
      readRequiredEnvironmentValue(
        "SQL_SERVER_PASSWORD",
      ),

    connectionMode:
      createConnectionMode(),

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

    connectionTimeoutMilliseconds:
      readIntegerEnvironmentValue(
        "SQL_SERVER_CONNECTION_TIMEOUT_MS",
        DEFAULT_CONNECTION_TIMEOUT_MS,
        1_000,
        120_000,
      ),

    requestTimeoutMilliseconds:
      readIntegerEnvironmentValue(
        "SQL_SERVER_REQUEST_TIMEOUT_MS",
        DEFAULT_REQUEST_TIMEOUT_MS,
        1_000,
        120_000,
      ),

    pool: {
      minimum:
        poolMinimum,

      maximum:
        poolMaximum,

      idleTimeoutMilliseconds:
        readIntegerEnvironmentValue(
          "SQL_SERVER_POOL_IDLE_TIMEOUT_MS",
          DEFAULT_POOL_IDLE_TIMEOUT_MS,
          1_000,
          600_000,
        ),
    },
  };
}

export function getSqlServerConfiguration():
  SqlServerConfiguration {
  if (cachedConfiguration) {
    return cachedConfiguration;
  }

  cachedConfiguration =
    createSqlServerConfiguration();

  return cachedConfiguration;
}

export function clearSqlServerConfigurationCache():
  void {
  cachedConfiguration = null;
}