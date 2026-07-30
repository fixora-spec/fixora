import "server-only";

import {
  ConnectionPool,
  ISOLATION_LEVEL,
  Request,
  Transaction,
} from "mssql";

import type {
  config as MssqlConfiguration,
} from "mssql";

import {
  getSqlServerConfiguration,
} from "@/config/database.config";

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

let connectionPoolPromise:
  | Promise<ConnectionPool>
  | null = null;

let connectionState:
  DatabaseConnectionState = "DISCONNECTED";

const ISOLATION_LEVEL_MAP: Record<
  DatabaseTransactionIsolationLevel,
  number
> = {
  READ_UNCOMMITTED:
    ISOLATION_LEVEL.READ_UNCOMMITTED,

  READ_COMMITTED:
    ISOLATION_LEVEL.READ_COMMITTED,

  REPEATABLE_READ:
    ISOLATION_LEVEL.REPEATABLE_READ,

  SERIALIZABLE:
    ISOLATION_LEVEL.SERIALIZABLE,

  SNAPSHOT:
    ISOLATION_LEVEL.SNAPSHOT,
};

type ErrorRecord = Record<
  string,
  unknown
>;

type SqlHealthRecord = {
  server_name: string | null;
  instance_name: string | null;
  database_name: string | null;
  edition: string | null;
  product_version: string | null;
};

export class DatabaseError extends Error {
  public readonly details:
    DatabaseErrorDetails;

  public readonly originalError:
    unknown;

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

function isErrorRecord(
  value: unknown,
): value is ErrorRecord {
  return (
    typeof value === "object"
    && value !== null
  );
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

function readOriginalErrorProperty(
  error: unknown,
  propertyName: string,
): unknown {
  const originalError =
    readErrorProperty(
      error,
      "originalError",
    );

  if (!isErrorRecord(originalError)) {
    return undefined;
  }

  return originalError[propertyName];
}

function getOriginalErrorCode(
  error: unknown,
): string | undefined {
  const directCode =
    readErrorProperty(error, "code");

  if (typeof directCode === "string") {
    return directCode;
  }

  const nestedCode =
    readOriginalErrorProperty(
      error,
      "code",
    );

  return typeof nestedCode === "string"
    ? nestedCode
    : undefined;
}

function getSqlErrorNumber(
  error: unknown,
): number | undefined {
  const directNumber =
    readErrorProperty(error, "number");

  if (typeof directNumber === "number") {
    return directNumber;
  }

  const nestedNumber =
    readOriginalErrorProperty(
      error,
      "number",
    );

  return typeof nestedNumber === "number"
    ? nestedNumber
    : undefined;
}

function getSqlConstraintName(
  error: unknown,
): string | undefined {
  const constraintName =
    readErrorProperty(
      error,
      "constraint",
    );

  return typeof constraintName === "string"
    ? constraintName
    : undefined;
}

function getErrorMessage(
  error: unknown,
): string {
  if (error instanceof Error) {
    return error.message;
  }

  const message =
    readErrorProperty(error, "message");

  if (typeof message === "string") {
    return message;
  }

  return "Se produjo un error desconocido en SQL Server.";
}

function resolveDatabaseErrorCode(
  error: unknown,
  fallbackCode: DatabaseErrorCode,
): DatabaseErrorCode {
  const originalCode =
    getOriginalErrorCode(error);

  const sqlErrorNumber =
    getSqlErrorNumber(error);

  if (
    sqlErrorNumber === 2601
    || sqlErrorNumber === 2627
  ) {
    return "UNIQUE_CONSTRAINT_VIOLATION";
  }

  if (sqlErrorNumber === 547) {
    return "FOREIGN_KEY_VIOLATION";
  }

  switch (originalCode) {
    case "ETIMEOUT":
      return fallbackCode === "QUERY_FAILED"
        ? "QUERY_TIMEOUT"
        : "CONNECTION_TIMEOUT";

    case "ELOGIN":
      return "AUTHENTICATION_FAILED";

    case "EDBNAME":
      return "DATABASE_NOT_FOUND";

    case "ECONNCLOSED":
    case "ENOTOPEN":
    case "ESOCKET":
      return "CONNECTION_FAILED";

    case "EREQUEST":
      return "QUERY_FAILED";

    default:
      return fallbackCode;
  }
}

function isRetryableDatabaseError(
  code: DatabaseErrorCode,
): boolean {
  return [
    "CONNECTION_TIMEOUT",
    "CONNECTION_FAILED",
    "QUERY_TIMEOUT",
    "QUERY_FAILED",
    "TRANSACTION_FAILED",
  ].includes(code);
}

export function toDatabaseError(
  error: unknown,
  fallbackCode:
    DatabaseErrorCode = "UNKNOWN",
): DatabaseError {
  if (error instanceof DatabaseError) {
    return error;
  }

  const code =
    resolveDatabaseErrorCode(
      error,
      fallbackCode,
    );

  const originalCode =
    getOriginalErrorCode(error);

  return new DatabaseError(
    {
      code,
      message:
        getErrorMessage(error),

      originalCode,

      constraintName:
        getSqlConstraintName(error),

      retryable:
        isRetryableDatabaseError(code),
    },
    error,
  );
}

function buildMssqlConfiguration(
  configuration: SqlServerConfiguration,
): MssqlConfiguration {
  const sqlConfiguration:
    MssqlConfiguration = {
    server:
      configuration.host,

    database:
      configuration.database,

    user:
      configuration.user,

    password:
      configuration.password,

    connectionTimeout:
      configuration
        .connectionTimeoutMilliseconds,

    requestTimeout:
      configuration
        .requestTimeoutMilliseconds,

    pool: {
      min:
        configuration.pool.minimum,

      max:
        configuration.pool.maximum,

      idleTimeoutMillis:
        configuration.pool
          .idleTimeoutMilliseconds,
    },

    options: {
      encrypt:
        configuration.encrypt,

      trustServerCertificate:
        configuration
          .trustServerCertificate,

      enableArithAbort:
        true,
    },
  };

  if (
    configuration.connectionMode.type
    === "INSTANCE"
  ) {
    sqlConfiguration.options = {
      ...sqlConfiguration.options,

      instanceName:
        configuration
          .connectionMode
          .instanceName,
    };
  } else {
    sqlConfiguration.port =
      configuration
        .connectionMode
        .port;
  }

  return sqlConfiguration;
}

export function getSqlConnectionState():
  DatabaseConnectionState {
  return connectionState;
}

export async function getSqlConnectionPool():
  Promise<ConnectionPool> {
  if (connectionPoolPromise) {
    return connectionPoolPromise;
  }

  connectionState = "CONNECTING";

  const applicationConfiguration =
    getSqlServerConfiguration();

  const sqlConfiguration =
    buildMssqlConfiguration(
      applicationConfiguration,
    );

  const connectionPool =
    new ConnectionPool(
      sqlConfiguration,
    );

  connectionPoolPromise =
    connectionPool
      .connect()
      .then((connectedPool) => {
        connectionState = "CONNECTED";

        connectedPool.on(
          "error",
          () => {
            connectionState = "ERROR";
            connectionPoolPromise = null;
          },
        );

        return connectedPool;
      })
      .catch((error: unknown) => {
        connectionState = "ERROR";
        connectionPoolPromise = null;

        throw toDatabaseError(
          error,
          "CONNECTION_FAILED",
        );
      });

  return connectionPoolPromise;
}

export async function closeSqlConnectionPool():
  Promise<void> {
  if (!connectionPoolPromise) {
    connectionState = "DISCONNECTED";
    return;
  }

  const activePoolPromise =
    connectionPoolPromise;

  connectionPoolPromise = null;
  connectionState = "CLOSING";

  try {
    const connectionPool =
      await activePoolPromise;

    await connectionPool.close();

    connectionState = "DISCONNECTED";
  } catch (error) {
    connectionState = "ERROR";

    throw toDatabaseError(
      error,
      "CONNECTION_FAILED",
    );
  }
}

export async function createSqlRequest():
  Promise<Request> {
  const connectionPool =
    await getSqlConnectionPool();

  return connectionPool.request();
}

export async function executeSqlQuery<
  TRecord extends Record<
    string,
    unknown
  >,
>(
  queryText: string,
  configureRequest?: (
    request: Request,
  ) => void,
): Promise<
  DatabaseQueryResult<TRecord>
> {
  try {
    const request =
      await createSqlRequest();

    configureRequest?.(request);

    const result =
      await request.query(queryText);

    return {
      records:
        (result.recordset
          ?? []) as TRecord[],

      rowsAffected:
        result.rowsAffected ?? [],
    };
  } catch (error) {
    throw toDatabaseError(
      error,
      "QUERY_FAILED",
    );
  }
}

export async function executeSqlSingle<
  TRecord extends Record<
    string,
    unknown
  >,
>(
  queryText: string,
  configureRequest?: (
    request: Request,
  ) => void,
): Promise<
  DatabaseSingleResult<TRecord>
> {
  const result =
    await executeSqlQuery<TRecord>(
      queryText,
      configureRequest,
    );

  return {
    record:
      result.records[0] ?? null,

    rowsAffected:
      result.rowsAffected,
  };
}

export async function executeSqlRequired<
  TRecord extends Record<
    string,
    unknown
  >,
>(
  queryText: string,
  configureRequest?: (
    request: Request,
  ) => void,
): Promise<
  DatabaseRequiredResult<TRecord>
> {
  const result =
    await executeSqlSingle<TRecord>(
      queryText,
      configureRequest,
    );

  if (!result.record) {
    throw new DatabaseError({
      code:
        "NOT_FOUND",

      message:
        "El registro solicitado no existe.",

      retryable:
        false,
    });
  }

  return {
    record:
      result.record,

    rowsAffected:
      result.rowsAffected,
  };
}

export async function withSqlTransaction<
  TResult,
>(
  callback: (
    transaction: Transaction,
  ) => Promise<TResult>,

  options: DatabaseTransactionOptions = {
    isolationLevel:
      "READ_COMMITTED",
  },
): Promise<TResult> {
  const connectionPool =
    await getSqlConnectionPool();

  const transaction =
    new Transaction(
      connectionPool,
    );

  let transactionStarted =
    false;

  try {
    await transaction.begin(
      ISOLATION_LEVEL_MAP[
        options.isolationLevel
      ],
    );

    transactionStarted = true;

    const result =
      await callback(transaction);

    await transaction.commit();

    transactionStarted = false;

    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await transaction.rollback();
      } catch {
        // SQL Server pudo revertir la transacción automáticamente.
      }
    }

    throw toDatabaseError(
      error,
      "TRANSACTION_FAILED",
    );
  }
}

export async function getSqlDatabaseHealth():
  Promise<DatabaseHealthStatus> {
  try {
    const result =
      await executeSqlRequired<
        SqlHealthRecord
      >(`
        SELECT
          CAST(
            SERVERPROPERTY('ServerName')
            AS NVARCHAR(256)
          ) AS server_name,

          CAST(
            SERVERPROPERTY('InstanceName')
            AS NVARCHAR(256)
          ) AS instance_name,

          DB_NAME()
            AS database_name,

          CAST(
            SERVERPROPERTY('Edition')
            AS NVARCHAR(256)
          ) AS edition,

          CAST(
            SERVERPROPERTY('ProductVersion')
            AS NVARCHAR(128)
          ) AS product_version;
      `);

    return {
      healthy:
        true,

      state:
        "CONNECTED",

      serverName:
        result.record.server_name
        ?? "",

      instanceName:
        result.record.instance_name,

      databaseName:
        result.record.database_name
        ?? "",

      edition:
        result.record.edition
        ?? "",

      productVersion:
        result.record.product_version
        ?? "",
    };
  } catch (error) {
    const databaseError =
      toDatabaseError(error);

    const currentState =
      getSqlConnectionState();

    const unhealthyState:
      Exclude<
        DatabaseConnectionState,
        "CONNECTED"
      > =
      currentState === "CONNECTED"
        ? "ERROR"
        : currentState;

    return {
      healthy:
        false,

      state:
        unhealthyState,

      errorCode:
        databaseError.details.code,

      message:
        databaseError.details.message,
    };
  }
}