import "server-only";

import {
  ConnectionPool,
  ISOLATION_LEVEL,
  Request,
  Transaction,
} from "mssql";

import type { config as MssqlConfiguration } from "mssql";

import { getSqlServerConfiguration } from "@/config/database.config";

import type {
  DatabaseConnectionState,
  DatabaseErrorCode,
  DatabaseErrorDetails,
  DatabaseHealthStatus,
  DatabaseQueryResult,
  DatabaseRequiredResult,
  DatabaseSingleResult,
  DatabaseTransactionIsolationLevel,
  DatabaseTransactionOptions,
  SqlServerConfiguration,
} from "@/types/database";

const MAXIMUM_QUERY_TEXT_LENGTH = 1_048_576;

const ISOLATION_LEVEL_MAP: Record<
  DatabaseTransactionIsolationLevel,
  number
> = {
  READ_UNCOMMITTED: ISOLATION_LEVEL.READ_UNCOMMITTED,
  READ_COMMITTED: ISOLATION_LEVEL.READ_COMMITTED,
  REPEATABLE_READ: ISOLATION_LEVEL.REPEATABLE_READ,
  SERIALIZABLE: ISOLATION_LEVEL.SERIALIZABLE,
  SNAPSHOT: ISOLATION_LEVEL.SNAPSHOT,
};

type ErrorRecord = Record<string, unknown>;

type SqlHealthRecord = {
  server_name: string | null;
  instance_name: string | null;
  database_name: string | null;
  edition: string | null;
  product_version: string | null;
};

type SqlServerRuntimeState = {
  connectionPoolPromise: Promise<ConnectionPool> | null;
  connectionPool: ConnectionPool | null;
  closePromise: Promise<void> | null;
  connectionState: DatabaseConnectionState;
};

type GlobalSqlServerState = typeof globalThis & {
  __fixoraSqlServerRuntimeState?: SqlServerRuntimeState;
};

const globalSqlServerState = globalThis as GlobalSqlServerState;

const runtimeState: SqlServerRuntimeState =
  globalSqlServerState.__fixoraSqlServerRuntimeState ?? {
    connectionPoolPromise: null,
    connectionPool: null,
    closePromise: null,
    connectionState: "DISCONNECTED",
  };

globalSqlServerState.__fixoraSqlServerRuntimeState = runtimeState;

export class DatabaseError extends Error {
  public readonly details: DatabaseErrorDetails;

  public readonly originalError: unknown;

  public constructor(
    details: DatabaseErrorDetails,
    originalError?: unknown,
  ) {
    super(details.message);

    this.name = "DatabaseError";
    this.details = details;
    this.originalError = originalError;
  }
}

function isErrorRecord(value: unknown): value is ErrorRecord {
  return typeof value === "object" && value !== null;
}

function readErrorProperty(
  error: unknown,
  propertyName: string,
): unknown {
  if (!isErrorRecord(error)) {
    return undefined;
  }

  return error[propertyName];
}

function readNestedErrorProperty(
  error: unknown,
  nestedPropertyName: "cause" | "originalError",
  propertyName: string,
): unknown {
  const nestedError = readErrorProperty(error, nestedPropertyName);

  if (!isErrorRecord(nestedError)) {
    return undefined;
  }

  return nestedError[propertyName];
}

function readErrorPropertyRecursively(
  error: unknown,
  propertyName: string,
): unknown {
  const directValue = readErrorProperty(error, propertyName);

  if (typeof directValue !== "undefined") {
    return directValue;
  }

  const originalErrorValue = readNestedErrorProperty(
    error,
    "originalError",
    propertyName,
  );

  if (typeof originalErrorValue !== "undefined") {
    return originalErrorValue;
  }

  return readNestedErrorProperty(error, "cause", propertyName);
}

function getOriginalErrorCode(error: unknown): string | undefined {
  const code = readErrorPropertyRecursively(error, "code");

  return typeof code === "string" ? code : undefined;
}

function getSqlErrorNumber(error: unknown): number | undefined {
  const number = readErrorPropertyRecursively(error, "number");

  return typeof number === "number" && Number.isSafeInteger(number)
    ? number
    : undefined;
}

function getSqlConstraintName(error: unknown): string | undefined {
  const constraintName = readErrorPropertyRecursively(
    error,
    "constraint",
  );

  return typeof constraintName === "string" && constraintName.length > 0
    ? constraintName
    : undefined;
}

function getInternalErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  const message = readErrorPropertyRecursively(error, "message");

  return typeof message === "string" ? message : "";
}

function isConfigurationError(
  error: unknown,
  fallbackCode: DatabaseErrorCode,
): boolean {
  return (
    fallbackCode === "CONFIGURATION_MISSING" ||
    fallbackCode === "INVALID_CONFIGURATION"
  );
}

function resolveDatabaseErrorCode(
  error: unknown,
  fallbackCode: DatabaseErrorCode,
): DatabaseErrorCode {
  const originalCode = getOriginalErrorCode(error);
  const sqlErrorNumber = getSqlErrorNumber(error);
  const internalMessage = getInternalErrorMessage(error).toLowerCase();

  if (sqlErrorNumber === 2601 || sqlErrorNumber === 2627) {
    return "UNIQUE_CONSTRAINT_VIOLATION";
  }

  if (sqlErrorNumber === 547) {
    return internalMessage.includes("foreign key")
      ? "FOREIGN_KEY_VIOLATION"
      : "CONSTRAINT_VIOLATION";
  }

  if (sqlErrorNumber === 515) {
    return "CONSTRAINT_VIOLATION";
  }

  if (sqlErrorNumber === 1222) {
    return "QUERY_TIMEOUT";
  }

  if (sqlErrorNumber === 1205) {
    return fallbackCode === "TRANSACTION_FAILED"
      ? "TRANSACTION_FAILED"
      : "QUERY_FAILED";
  }

  switch (originalCode) {
    case "ETIMEOUT":
      return fallbackCode === "QUERY_FAILED" ||
        fallbackCode === "TRANSACTION_FAILED"
        ? "QUERY_TIMEOUT"
        : "CONNECTION_TIMEOUT";

    case "ELOGIN":
      return "AUTHENTICATION_FAILED";

    case "EDBNAME":
      return "DATABASE_NOT_FOUND";

    case "ECONNCLOSED":
    case "ECONNREFUSED":
    case "EINSTLOOKUP":
    case "ENOCONN":
    case "ENOTOPEN":
    case "ESOCKET":
      return "CONNECTION_FAILED";

    case "EREQUEST":
      return fallbackCode === "TRANSACTION_FAILED"
        ? "TRANSACTION_FAILED"
        : "QUERY_FAILED";

    default:
      if (isConfigurationError(error, fallbackCode)) {
        return fallbackCode;
      }

      return fallbackCode;
  }
}

function getPublicDatabaseErrorMessage(code: DatabaseErrorCode): string {
  switch (code) {
    case "CONFIGURATION_MISSING":
      return "Falta configurar la conexión con SQL Server.";

    case "INVALID_CONFIGURATION":
      return "La configuración de SQL Server no es válida.";

    case "CONNECTION_TIMEOUT":
      return "La conexión con SQL Server excedió el tiempo permitido.";

    case "CONNECTION_FAILED":
      return "No fue posible establecer la conexión con SQL Server.";

    case "AUTHENTICATION_FAILED":
      return "SQL Server rechazó las credenciales configuradas.";

    case "DATABASE_NOT_FOUND":
      return "La base de datos configurada no está disponible.";

    case "QUERY_TIMEOUT":
      return "La operación de base de datos excedió el tiempo permitido.";

    case "QUERY_FAILED":
      return "No fue posible completar la operación de base de datos.";

    case "TRANSACTION_FAILED":
      return "No fue posible completar la transacción de base de datos.";

    case "CONSTRAINT_VIOLATION":
      return "La operación infringe una restricción de la base de datos.";

    case "UNIQUE_CONSTRAINT_VIOLATION":
      return "Ya existe un registro con los mismos datos únicos.";

    case "FOREIGN_KEY_VIOLATION":
      return "La operación hace referencia a un registro inexistente o protegido.";

    case "NOT_FOUND":
      return "El registro solicitado no existe.";

    case "UNKNOWN":
    default:
      return "Se produjo un error inesperado en la base de datos.";
  }
}

function isRetryableDatabaseError(
  code: DatabaseErrorCode,
  error: unknown,
): boolean {
  const sqlErrorNumber = getSqlErrorNumber(error);

  if (sqlErrorNumber === 1205 || sqlErrorNumber === 1222) {
    return true;
  }

  return [
    "CONNECTION_TIMEOUT",
    "CONNECTION_FAILED",
    "QUERY_TIMEOUT",
  ].includes(code);
}

export function toDatabaseError(
  error: unknown,
  fallbackCode: DatabaseErrorCode = "UNKNOWN",
): DatabaseError {
  if (error instanceof DatabaseError) {
    return error;
  }

  const code = resolveDatabaseErrorCode(error, fallbackCode);
  const originalCode = getOriginalErrorCode(error);
  const constraintName = getSqlConstraintName(error);

  return new DatabaseError(
    {
      code,
      message: getPublicDatabaseErrorMessage(code),
      ...(originalCode ? { originalCode } : {}),
      ...(constraintName ? { constraintName } : {}),
      retryable: isRetryableDatabaseError(code, error),
    },
    error,
  );
}

function buildMssqlConfiguration(
  configuration: SqlServerConfiguration,
): MssqlConfiguration {
  const sqlConfiguration: MssqlConfiguration = {
    server: configuration.host,
    database: configuration.database,
    user: configuration.user,
    password: configuration.password,
    connectionTimeout: configuration.connectionTimeoutMilliseconds,
    requestTimeout: configuration.requestTimeoutMilliseconds,
    pool: {
      min: configuration.pool.minimum,
      max: configuration.pool.maximum,
      idleTimeoutMillis: configuration.pool.idleTimeoutMilliseconds,
    },
    options: {
      encrypt: configuration.encrypt,
      trustServerCertificate: configuration.trustServerCertificate,
      enableArithAbort: true,
      abortTransactionOnError: true,
      useUTC: true,
    },
  };

  if (configuration.connectionMode.type === "INSTANCE") {
    sqlConfiguration.options = {
      ...sqlConfiguration.options,
      instanceName: configuration.connectionMode.instanceName,
    };
  } else {
    sqlConfiguration.port = configuration.connectionMode.port;
  }

  return sqlConfiguration;
}

function isConnectionPoolUsable(pool: ConnectionPool | null): boolean {
  return Boolean(pool && pool.connected);
}

async function safelyClosePool(pool: ConnectionPool): Promise<void> {
  await pool.close();
}

function validateQueryText(queryText: string): void {
  if (typeof queryText !== "string" || queryText.trim().length === 0) {
    throw new DatabaseError({
      code: "INVALID_CONFIGURATION",
      message: "La consulta SQL no puede estar vacía.",
      retryable: false,
    });
  }

  if (queryText.length > MAXIMUM_QUERY_TEXT_LENGTH) {
    throw new DatabaseError({
      code: "INVALID_CONFIGURATION",
      message: `La consulta SQL supera el máximo permitido de ${MAXIMUM_QUERY_TEXT_LENGTH} caracteres.`,
      retryable: false,
    });
  }
}

export function getSqlConnectionState(): DatabaseConnectionState {
  return runtimeState.connectionState;
}

export async function getSqlConnectionPool(): Promise<ConnectionPool> {
  if (runtimeState.closePromise) {
    await runtimeState.closePromise;
  }

  if (isConnectionPoolUsable(runtimeState.connectionPool)) {
    return runtimeState.connectionPool as ConnectionPool;
  }

  if (runtimeState.connectionPoolPromise) {
    return runtimeState.connectionPoolPromise;
  }

  runtimeState.connectionPool = null;
  runtimeState.connectionState = "CONNECTING";

  let connectionPool: ConnectionPool;

  try {
    const applicationConfiguration = getSqlServerConfiguration();
    const sqlConfiguration = buildMssqlConfiguration(
      applicationConfiguration,
    );

    connectionPool = new ConnectionPool(sqlConfiguration);
  } catch (error) {
    runtimeState.connectionState = "ERROR";

    const message = getInternalErrorMessage(error).toLowerCase();
    const fallbackCode: DatabaseErrorCode = message.includes("falta")
      ? "CONFIGURATION_MISSING"
      : "INVALID_CONFIGURATION";

    throw toDatabaseError(error, fallbackCode);
  }

  const connectionPromise = connectionPool
    .connect()
    .then((connectedPool) => {
      runtimeState.connectionPool = connectedPool;
      runtimeState.connectionState = "CONNECTED";

      connectedPool.on("error", () => {
        if (runtimeState.connectionPool !== connectedPool) {
          return;
        }

        runtimeState.connectionPool = null;
        runtimeState.connectionPoolPromise = null;
        runtimeState.connectionState = "ERROR";

        void safelyClosePool(connectedPool).catch(() => undefined);
      });

      return connectedPool;
    })
    .catch((error: unknown) => {
      if (runtimeState.connectionPool === connectionPool) {
        runtimeState.connectionPool = null;
      }

      runtimeState.connectionPoolPromise = null;
      runtimeState.connectionState = "ERROR";

      void safelyClosePool(connectionPool).catch(() => undefined);

      throw toDatabaseError(error, "CONNECTION_FAILED");
    });

  runtimeState.connectionPoolPromise = connectionPromise;

  return connectionPromise;
}

export async function closeSqlConnectionPool(): Promise<void> {
  if (runtimeState.closePromise) {
    return runtimeState.closePromise;
  }

  const activePoolPromise = runtimeState.connectionPoolPromise;
  const activePool = runtimeState.connectionPool;

  if (!activePoolPromise && !activePool) {
    runtimeState.connectionState = "DISCONNECTED";
    return;
  }

  runtimeState.connectionState = "CLOSING";

  const closePromise = (async () => {
    let poolToClose = activePool;

    if (!poolToClose && activePoolPromise) {
      try {
        poolToClose = await activePoolPromise;
      } catch {
        poolToClose = null;
      }
    }

    if (poolToClose) {
      await safelyClosePool(poolToClose);
    }

    if (runtimeState.connectionPool === poolToClose) {
      runtimeState.connectionPool = null;
    }

    if (runtimeState.connectionPoolPromise === activePoolPromise) {
      runtimeState.connectionPoolPromise = null;
    }

    runtimeState.connectionState = "DISCONNECTED";
  })()
    .catch((error: unknown) => {
      runtimeState.connectionState = "ERROR";
      throw toDatabaseError(error, "CONNECTION_FAILED");
    })
    .finally(() => {
      if (runtimeState.closePromise === closePromise) {
        runtimeState.closePromise = null;
      }
    });

  runtimeState.closePromise = closePromise;

  return closePromise;
}

export async function createSqlRequest(): Promise<Request> {
  const connectionPool = await getSqlConnectionPool();

  if (!isConnectionPoolUsable(connectionPool)) {
    throw new DatabaseError({
      code: "CONNECTION_FAILED",
      message: getPublicDatabaseErrorMessage("CONNECTION_FAILED"),
      retryable: true,
    });
  }

  return connectionPool.request();
}

export async function executeSqlQuery<
  TRecord extends Record<string, unknown>,
>(
  queryText: string,
  configureRequest?: (request: Request) => void,
): Promise<DatabaseQueryResult<TRecord>> {
  validateQueryText(queryText);

  try {
    const request = await createSqlRequest();

    configureRequest?.(request);

    const result = await request.query<TRecord>(queryText);

    return {
      records: result.recordset ?? [],
      rowsAffected: result.rowsAffected ?? [],
    };
  } catch (error) {
    throw toDatabaseError(error, "QUERY_FAILED");
  }
}

export async function executeSqlSingle<
  TRecord extends Record<string, unknown>,
>(
  queryText: string,
  configureRequest?: (request: Request) => void,
): Promise<DatabaseSingleResult<TRecord>> {
  const result = await executeSqlQuery<TRecord>(
    queryText,
    configureRequest,
  );

  return {
    record: result.records[0] ?? null,
    rowsAffected: result.rowsAffected,
  };
}

export async function executeSqlRequired<
  TRecord extends Record<string, unknown>,
>(
  queryText: string,
  configureRequest?: (request: Request) => void,
): Promise<DatabaseRequiredResult<TRecord>> {
  const result = await executeSqlSingle<TRecord>(
    queryText,
    configureRequest,
  );

  if (!result.record) {
    throw new DatabaseError({
      code: "NOT_FOUND",
      message: getPublicDatabaseErrorMessage("NOT_FOUND"),
      retryable: false,
    });
  }

  return {
    record: result.record,
    rowsAffected: result.rowsAffected,
  };
}

export async function withSqlTransaction<TResult>(
  callback: (transaction: Transaction) => Promise<TResult>,
  options: DatabaseTransactionOptions = {
    isolationLevel: "READ_COMMITTED",
  },
): Promise<TResult> {
  if (typeof callback !== "function") {
    throw new DatabaseError({
      code: "INVALID_CONFIGURATION",
      message: "La transacción requiere una función de ejecución válida.",
      retryable: false,
    });
  }

  const isolationLevel = ISOLATION_LEVEL_MAP[options.isolationLevel];

  if (typeof isolationLevel !== "number") {
    throw new DatabaseError({
      code: "INVALID_CONFIGURATION",
      message: "El nivel de aislamiento de la transacción no es válido.",
      retryable: false,
    });
  }

  const connectionPool = await getSqlConnectionPool();
  const transaction = new Transaction(connectionPool);
  let transactionStarted = false;

  try {
    await transaction.begin(isolationLevel);
    transactionStarted = true;

    const result = await callback(transaction);

    await transaction.commit();
    transactionStarted = false;

    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await transaction.rollback();
      } catch {
        // SQL Server puede revertir automáticamente la transacción cuando
        // abortTransactionOnError está activo.
      }
    }

    throw toDatabaseError(error, "TRANSACTION_FAILED");
  }
}

function requireHealthValue(
  value: string | null,
  propertyName: string,
): string {
  const normalizedValue = value?.trim() ?? "";

  if (!normalizedValue) {
    throw new DatabaseError({
      code: "QUERY_FAILED",
      message: `SQL Server no devolvió ${propertyName} durante la comprobación de salud.`,
      retryable: false,
    });
  }

  return normalizedValue;
}

export async function getSqlDatabaseHealth(): Promise<DatabaseHealthStatus> {
  try {
    const result = await executeSqlRequired<SqlHealthRecord>(`
      SELECT
        CAST(SERVERPROPERTY('ServerName') AS NVARCHAR(256)) AS server_name,
        CAST(SERVERPROPERTY('InstanceName') AS NVARCHAR(256)) AS instance_name,
        DB_NAME() AS database_name,
        CAST(SERVERPROPERTY('Edition') AS NVARCHAR(256)) AS edition,
        CAST(SERVERPROPERTY('ProductVersion') AS NVARCHAR(128)) AS product_version;
    `);

    return {
      healthy: true,
      state: "CONNECTED",
      serverName: requireHealthValue(
        result.record.server_name,
        "el nombre del servidor",
      ),
      instanceName: result.record.instance_name?.trim() || null,
      databaseName: requireHealthValue(
        result.record.database_name,
        "el nombre de la base de datos",
      ),
      edition: requireHealthValue(
        result.record.edition,
        "la edición",
      ),
      productVersion: requireHealthValue(
        result.record.product_version,
        "la versión",
      ),
    };
  } catch (error) {
    const databaseError = toDatabaseError(error);
    const currentState = getSqlConnectionState();
    const unhealthyState: Exclude<
      DatabaseConnectionState,
      "CONNECTED"
    > = currentState === "CONNECTED" ? "ERROR" : currentState;

    return {
      healthy: false,
      state: unhealthyState,
      errorCode: databaseError.details.code,
      message: databaseError.details.message,
    };
  }
}