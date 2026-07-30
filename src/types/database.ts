export type JsonPrimitive =
  | string
  | number
  | boolean
  | null;

export type JsonValue =
  | JsonPrimitive
  | JsonObject
  | JsonValue[];

export type JsonObject = {
  readonly [key: string]: JsonValue;
};

export type SqlServerConnectionMode =
  | {
      type: "INSTANCE";
      instanceName: string;
      port: null;
    }
  | {
      type: "PORT";
      instanceName: null;
      port: number;
    };

export type SqlServerPoolConfiguration = {
  minimum: number;
  maximum: number;
  idleTimeoutMilliseconds: number;
};

export type SqlServerConfiguration = {
  host: string;
  database: string;
  user: string;
  password: string;

  connectionMode: SqlServerConnectionMode;

  encrypt: boolean;
  trustServerCertificate: boolean;

  connectionTimeoutMilliseconds: number;
  requestTimeoutMilliseconds: number;

  pool: SqlServerPoolConfiguration;
};

export type DatabaseConnectionState =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "CLOSING"
  | "ERROR";

export type DatabaseHealthStatus =
  | {
      healthy: true;
      state: "CONNECTED";

      serverName: string;
      instanceName: string | null;
      databaseName: string;
      edition: string;
      productVersion: string;
    }
  | {
      healthy: false;
      state: Exclude<
        DatabaseConnectionState,
        "CONNECTED"
      >;

      errorCode: DatabaseErrorCode;
      message: string;
    };

export type DatabaseQueryResult<
  TRecord extends Record<string, unknown>,
> = {
  records: readonly TRecord[];
  rowsAffected: readonly number[];
};

export type DatabaseSingleResult<
  TRecord extends Record<string, unknown>,
> = {
  record: TRecord | null;
  rowsAffected: readonly number[];
};

export type DatabaseRequiredResult<
  TRecord extends Record<string, unknown>,
> = {
  record: TRecord;
  rowsAffected: readonly number[];
};

export const DATABASE_ERROR_CODES = [
  "CONFIGURATION_MISSING",
  "INVALID_CONFIGURATION",
  "CONNECTION_TIMEOUT",
  "CONNECTION_FAILED",
  "AUTHENTICATION_FAILED",
  "DATABASE_NOT_FOUND",
  "QUERY_TIMEOUT",
  "QUERY_FAILED",
  "TRANSACTION_FAILED",
  "CONSTRAINT_VIOLATION",
  "UNIQUE_CONSTRAINT_VIOLATION",
  "FOREIGN_KEY_VIOLATION",
  "NOT_FOUND",
  "UNKNOWN",
] as const;

export type DatabaseErrorCode =
  (typeof DATABASE_ERROR_CODES)[number];

export type DatabaseErrorDetails = {
  code: DatabaseErrorCode;
  message: string;

  originalCode?: string;
  constraintName?: string;
  tableName?: string;

  retryable: boolean;
};

export type DatabaseTransactionIsolationLevel =
  | "READ_UNCOMMITTED"
  | "READ_COMMITTED"
  | "REPEATABLE_READ"
  | "SERIALIZABLE"
  | "SNAPSHOT";

export type DatabaseTransactionOptions = {
  isolationLevel: DatabaseTransactionIsolationLevel;
};

export type DatabaseDateValue =
  | Date
  | string;

export type DatabasePaginationInput = {
  offset: number;
  limit: number;
};

export type DatabasePaginationResult = {
  offset: number;
  limit: number;
  total: number;
  hasMore: boolean;
};

export function isDatabaseErrorCode(
  value: unknown,
): value is DatabaseErrorCode {
  return (
    typeof value === "string"
    && DATABASE_ERROR_CODES.includes(
      value as DatabaseErrorCode,
    )
  );
}