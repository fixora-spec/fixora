import "server-only";

import {
  randomUUID,
} from "node:crypto";

import {
  DateTime2,
  NVarChar,
  UniqueIdentifier,
  VarChar,
} from "mssql";

import {
  AUTH_REQUEST_LIMITS,
  AUTH_SESSION_RULES,
} from "@/config/auth.config";

import {
  executeSqlQuery,
  executeSqlSingle,
} from "@/lib/database";

import {
  createSecretHash,
  generateOpaqueToken,
  verifySecretHash,
} from "@/lib/security/secure-random";

import {
  resolveAccountAccessState,
} from "./account-access";

import {
  findAccountById,
} from "./account.repository";

import type {
  AccountRepositoryRecord,
} from "./account.repository";

const DEFAULT_SESSION_TOKEN_BYTES = 48;
const DEFAULT_SESSION_TTL_HOURS = 168;
const SESSION_HASH_LENGTH = 64;

export type AuthSessionRecord = {
  sessionId: string;
  accountId: string;

  createdAt: Date;
  expiresAt: Date;
  lastSeenAt: Date;

  revokedAt: Date | null;
  revocationReason: string | null;

  ipAddress: string | null;
  userAgent: string | null;
};

export type CreatedAuthSession = {
  token: string;
  cookieHeader: string;
  session: AuthSessionRecord;
};

export type CreateAuthSessionInput = {
  accountId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  currentDate?: Date;
};

export type SessionValidationResult =
  | {
      valid: true;
      session: AuthSessionRecord;
    }
  | {
      valid: false;
      reason:
        | "MISSING"
        | "INVALID"
        | "EXPIRED"
        | "REVOKED"
        | "ACCOUNT_NOT_FOUND"
        | "ACCOUNT_INACTIVE"
        | "ACCOUNT_ACCESS_NOT_STARTED"
        | "ACCOUNT_ACCESS_EXPIRED"
        | "ACCOUNT_ACCESS_INVALID";
    };

type SessionDatabaseRecord = {
  session_id: string;
  account_id: string;

  created_at: Date;
  expires_at: Date;
  last_seen_at: Date;

  revoked_at: Date | null;
  revocation_reason: string | null;

  ip_address: string | null;
  user_agent: string | null;
};

function readPositiveIntegerEnvironmentValue(
  name: string,
  fallbackValue: number,
  minimum: number,
  maximum: number,
): number {
  const rawValue =
    process.env[name]?.trim();

  if (!rawValue) {
    return fallbackValue;
  }

  if (!/^\d+$/u.test(rawValue)) {
    throw new Error(
      `${name} debe contener un número entero válido.`,
    );
  }

  const parsedValue =
    Number.parseInt(
      rawValue,
      10,
    );

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

function readBooleanEnvironmentValue(
  name: string,
  fallbackValue: boolean,
): boolean {
  const rawValue =
    process.env[name]
      ?.trim()
      .toLowerCase();

  if (!rawValue) {
    return fallbackValue;
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

function getSessionPepper():
  string {
  const pepper =
    process.env
      .AUTH_SESSION_PEPPER
      ?.trim();

  if (
    !pepper
    || pepper.length < 32
  ) {
    throw new Error(
      "AUTH_SESSION_PEPPER debe tener al menos 32 caracteres.",
    );
  }

  return pepper;
}

function getSessionCookieName():
  string {
  const configuredName =
    process.env
      .AUTH_SESSION_COOKIE_NAME
      ?.trim();

  const cookieName =
    configuredName
    || AUTH_SESSION_RULES
      .cookieNameFallback;

  if (
    !/^[A-Za-z0-9_-]+$/u.test(
      cookieName,
    )
  ) {
    throw new Error(
      "AUTH_SESSION_COOKIE_NAME no contiene un nombre de cookie válido.",
    );
  }

  return cookieName;
}

function getSessionTtlHours():
  number {
  return readPositiveIntegerEnvironmentValue(
    "AUTH_SESSION_TTL_HOURS",
    AUTH_SESSION_RULES
      .defaultTimeToLiveHours
      || DEFAULT_SESSION_TTL_HOURS,
    1,
    24 * 365,
  );
}

function isSecureSessionCookie():
  boolean {
  return readBooleanEnvironmentValue(
    "AUTH_SESSION_COOKIE_SECURE",
    process.env.NODE_ENV
      === "production",
  );
}

function validateUuid(
  value: string,
  fieldName: string,
): string {
  const normalizedValue =
    value.trim();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
      .test(normalizedValue)
  ) {
    throw new Error(
      `${fieldName} no contiene un UUID válido.`,
    );
  }

  return normalizedValue;
}

function validateDate(
  value: Date,
  fieldName: string,
): Date {
  const normalizedDate =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      normalizedDate.getTime(),
    )
  ) {
    throw new Error(
      `${fieldName} no contiene una fecha válida.`,
    );
  }

  return normalizedDate;
}

function normalizeIpAddress(
  value: string | null | undefined,
): string | null {
  const normalizedValue =
    value?.trim() ?? "";

  if (!normalizedValue) {
    return null;
  }

  if (
    normalizedValue.length
    > AUTH_REQUEST_LIMITS
      .maximumIpAddressLength
  ) {
    throw new Error(
      "La dirección IP supera la longitud permitida.",
    );
  }

  return normalizedValue;
}

function normalizeUserAgent(
  value: string | null | undefined,
): string | null {
  const normalizedValue =
    value?.trim() ?? "";

  if (!normalizedValue) {
    return null;
  }

  return normalizedValue.slice(
    0,
    AUTH_REQUEST_LIMITS
      .maximumUserAgentLength,
  );
}

function mapSessionRecord(
  record: SessionDatabaseRecord,
): AuthSessionRecord {
  return {
    sessionId:
      record.session_id,

    accountId:
      record.account_id,

    createdAt:
      new Date(
        record.created_at,
      ),

    expiresAt:
      new Date(
        record.expires_at,
      ),

    lastSeenAt:
      new Date(
        record.last_seen_at,
      ),

    revokedAt:
      record.revoked_at
        ? new Date(
            record.revoked_at,
          )
        : null,

    revocationReason:
      record.revocation_reason,

    ipAddress:
      record.ip_address,

    userAgent:
      record.user_agent,
  };
}

export function createSessionTokenHash(
  token: string,
): string {
  if (
    token.length < 32
    || token.length > 512
    || !/^[A-Za-z0-9_-]+$/u.test(
      token,
    )
  ) {
    throw new Error(
      "El token de sesión no tiene un formato válido.",
    );
  }

  return createSecretHash(
    token,
    getSessionPepper(),
  );
}

export function verifySessionTokenHash(
  token: string,
  expectedHash: string,
): boolean {
  if (
    expectedHash.length
      !== SESSION_HASH_LENGTH
  ) {
    return false;
  }

  return verifySecretHash(
    token,
    expectedHash,
    getSessionPepper(),
  );
}

export function createSessionCookieHeader(
  token: string,
  expiresAt: Date,
): string {
  if (
    Number.isNaN(
      expiresAt.getTime(),
    )
  ) {
    throw new Error(
      "La fecha de vencimiento de la sesión no es válida.",
    );
  }

  const attributes = [
    `${getSessionCookieName()}=${encodeURIComponent(token)}`,
    `Path=${AUTH_SESSION_RULES.cookiePath}`,
    `Expires=${expiresAt.toUTCString()}`,
    "HttpOnly",
    `SameSite=${AUTH_SESSION_RULES.cookieSameSite}`,
  ];

  if (isSecureSessionCookie()) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

export function createExpiredSessionCookieHeader():
  string {
  const attributes = [
    `${getSessionCookieName()}=`,
    `Path=${AUTH_SESSION_RULES.cookiePath}`,
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Max-Age=0",
    "HttpOnly",
    `SameSite=${AUTH_SESSION_RULES.cookieSameSite}`,
  ];

  if (isSecureSessionCookie()) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

export function getSessionTokenFromRequest(
  request: Request,
): string | null {
  const cookieHeader =
    request.headers.get(
      "cookie",
    );

  if (!cookieHeader) {
    return null;
  }

  const expectedCookieName =
    getSessionCookieName();

  const cookies =
    cookieHeader.split(";");

  for (const cookie of cookies) {
    const separatorIndex =
      cookie.indexOf("=");

    if (separatorIndex < 0) {
      continue;
    }

    const name =
      cookie
        .slice(
          0,
          separatorIndex,
        )
        .trim();

    if (
      name !== expectedCookieName
    ) {
      continue;
    }

    const rawValue =
      cookie
        .slice(
          separatorIndex + 1,
        )
        .trim();

    if (!rawValue) {
      return null;
    }

    try {
      return decodeURIComponent(
        rawValue,
      );
    } catch {
      return null;
    }
  }

  return null;
}

export function getRequestIpAddress(
  request: Request,
): string | null {
  const forwardedFor =
    request.headers
      .get("x-forwarded-for")
      ?.split(",", 1)[0]
      ?.trim();

  const realIp =
    request.headers
      .get("x-real-ip")
      ?.trim();

  return normalizeIpAddress(
    forwardedFor || realIp || null,
  );
}

export function getRequestUserAgent(
  request: Request,
): string | null {
  return normalizeUserAgent(
    request.headers.get(
      "user-agent",
    ),
  );
}

function resolveAdministratorSessionExpiration(
  account: AccountRepositoryRecord,
  configuredExpiresAt: Date,
  currentDate: Date,
): Date {
  if (
    account.role !== "ADMIN"
    || account.accessExpiresAt === null
  ) {
    throw new Error(
      "La cuenta administrativa no tiene una fecha de vencimiento válida.",
    );
  }

  const accessExpiresAt =
    validateDate(
      account.accessExpiresAt,
      "accessExpiresAt",
    );

  const expiresAt =
    new Date(
      Math.min(
        configuredExpiresAt.getTime(),
        accessExpiresAt.getTime(),
      ),
    );

  if (
    expiresAt.getTime()
    <= currentDate.getTime()
  ) {
    throw new Error(
      "No se puede crear una sesión después del vencimiento del acceso administrativo.",
    );
  }

  return expiresAt;
}

export async function createAuthSession(
  input: CreateAuthSessionInput,
): Promise<CreatedAuthSession> {
  const accountId =
    validateUuid(
      input.accountId,
      "accountId",
    );

  const currentDate =
    validateDate(
      input.currentDate
        ?? new Date(),
      "currentDate",
    );

  const account =
    await findAccountById(
      accountId,
    );

  if (!account) {
    throw new Error(
      "No se puede crear una sesión para una cuenta inexistente.",
    );
  }

  if (
    account.status !== "ACTIVE"
    || account.emailVerifiedAt === null
  ) {
    throw new Error(
      "No se puede crear una sesión para una cuenta inactiva o no verificada.",
    );
  }

  const accessState =
    resolveAccountAccessState(
      account,
      currentDate,
    );

  switch (accessState) {
    case "ACTIVE":
      break;

    case "NOT_STARTED":
      throw new Error(
        "El acceso administrativo todavía no ha iniciado.",
      );

    case "EXPIRED":
      throw new Error(
        "El acceso administrativo ha vencido.",
      );

    case "INVALID":
    default:
      throw new Error(
        "La vigencia de la cuenta no es válida.",
      );
  }

  const token =
    generateOpaqueToken(
      DEFAULT_SESSION_TOKEN_BYTES,
    );

  const tokenHash =
    createSessionTokenHash(
      token,
    );

  const sessionId =
    randomUUID();

  const configuredExpiresAt =
    new Date(
      currentDate.getTime()
      + getSessionTtlHours()
        * 60
        * 60
        * 1_000,
    );

  const expiresAt =
    account.role === "ADMIN"
      ? resolveAdministratorSessionExpiration(
          account,
          configuredExpiresAt,
          currentDate,
        )
      : configuredExpiresAt;

  const ipAddress =
    normalizeIpAddress(
      input.ipAddress,
    );

  const userAgent =
    normalizeUserAgent(
      input.userAgent,
    );

  const result =
    await executeSqlSingle<
      SessionDatabaseRecord
    >(
      `
        INSERT INTO dbo.auth_sessions (
          session_id,
          account_id,
          token_hash,
          ip_address,
          user_agent,
          created_at,
          expires_at,
          last_seen_at,
          revoked_at,
          revocation_reason
        )
        OUTPUT
          inserted.session_id,
          inserted.account_id,
          inserted.created_at,
          inserted.expires_at,
          inserted.last_seen_at,
          inserted.revoked_at,
          inserted.revocation_reason,
          inserted.ip_address,
          inserted.user_agent
        VALUES (
          @sessionId,
          @accountId,
          @tokenHash,
          @ipAddress,
          @userAgent,
          @createdAt,
          @expiresAt,
          @lastSeenAt,
          NULL,
          NULL
        );
      `,
      (sqlRequest) => {
        sqlRequest.input(
          "sessionId",
          UniqueIdentifier,
          sessionId,
        );

        sqlRequest.input(
          "accountId",
          UniqueIdentifier,
          accountId,
        );

        sqlRequest.input(
          "tokenHash",
          VarChar(64),
          tokenHash,
        );

        sqlRequest.input(
          "ipAddress",
          NVarChar(
            AUTH_REQUEST_LIMITS
              .maximumIpAddressLength,
          ),
          ipAddress,
        );

        sqlRequest.input(
          "userAgent",
          NVarChar(
            AUTH_REQUEST_LIMITS
              .maximumUserAgentLength,
          ),
          userAgent,
        );

        sqlRequest.input(
          "createdAt",
          DateTime2,
          currentDate,
        );

        sqlRequest.input(
          "expiresAt",
          DateTime2,
          expiresAt,
        );

        sqlRequest.input(
          "lastSeenAt",
          DateTime2,
          currentDate,
        );
      },
    );

  if (!result.record) {
    throw new Error(
      "SQL Server no devolvió la sesión creada.",
    );
  }

  const session =
    mapSessionRecord(
      result.record,
    );

  return {
    token,

    cookieHeader:
      createSessionCookieHeader(
        token,
        session.expiresAt,
      ),

    session,
  };
}

export async function findAuthSessionByToken(
  token: string,
): Promise<AuthSessionRecord | null> {
  let tokenHash:
    string;

  try {
    tokenHash =
      createSessionTokenHash(
        token,
      );
  } catch {
    return null;
  }

  const result =
    await executeSqlSingle<
      SessionDatabaseRecord
    >(
      `
        SELECT TOP (1)
          session_id,
          account_id,
          created_at,
          expires_at,
          last_seen_at,
          revoked_at,
          revocation_reason,
          ip_address,
          user_agent
        FROM dbo.auth_sessions
        WHERE token_hash = @tokenHash;
      `,
      (sqlRequest) => {
        sqlRequest.input(
          "tokenHash",
          VarChar(64),
          tokenHash,
        );
      },
    );

  return result.record
    ? mapSessionRecord(
        result.record,
      )
    : null;
}

async function tryRevokeSessionForAccountState(
  token: string,
  reason: string,
  currentDate: Date,
): Promise<void> {
  try {
    await revokeAuthSessionByToken(
      token,
      reason,
      currentDate,
    );
  } catch {
    /*
     * La sesión seguirá siendo rechazada aunque
     * no se pueda persistir inmediatamente la revocación.
     */
  }
}

export async function validateAuthSessionToken(
  token: string | null,
  currentDate = new Date(),
): Promise<SessionValidationResult> {
  if (!token) {
    return {
      valid:
        false,

      reason:
        "MISSING",
    };
  }

  const normalizedCurrentDate =
    validateDate(
      currentDate,
      "currentDate",
    );

  const session =
    await findAuthSessionByToken(
      token,
    );

  if (!session) {
    return {
      valid:
        false,

      reason:
        "INVALID",
    };
  }

  if (session.revokedAt) {
    return {
      valid:
        false,

      reason:
        "REVOKED",
    };
  }

  if (
    session.expiresAt.getTime()
    <= normalizedCurrentDate.getTime()
  ) {
    return {
      valid:
        false,

      reason:
        "EXPIRED",
    };
  }

  const account =
    await findAccountById(
      session.accountId,
    );

  if (!account) {
    await tryRevokeSessionForAccountState(
      token,
      "ACCOUNT_NOT_FOUND",
      normalizedCurrentDate,
    );

    return {
      valid:
        false,

      reason:
        "ACCOUNT_NOT_FOUND",
    };
  }

  if (
    account.status !== "ACTIVE"
    || account.emailVerifiedAt === null
  ) {
    await tryRevokeSessionForAccountState(
      token,
      "ACCOUNT_INACTIVE",
      normalizedCurrentDate,
    );

    return {
      valid:
        false,

      reason:
        "ACCOUNT_INACTIVE",
    };
  }

  const accessState =
    resolveAccountAccessState(
      account,
      normalizedCurrentDate,
    );

  switch (accessState) {
    case "ACTIVE":
      return {
        valid:
          true,

        session,
      };

    case "NOT_STARTED":
      await tryRevokeSessionForAccountState(
        token,
        "ACCOUNT_ACCESS_NOT_STARTED",
        normalizedCurrentDate,
      );

      return {
        valid:
          false,

        reason:
          "ACCOUNT_ACCESS_NOT_STARTED",
      };

    case "EXPIRED":
      await tryRevokeSessionForAccountState(
        token,
        "ACCOUNT_ACCESS_EXPIRED",
        normalizedCurrentDate,
      );

      return {
        valid:
          false,

        reason:
          "ACCOUNT_ACCESS_EXPIRED",
      };

    case "INVALID":
    default:
      await tryRevokeSessionForAccountState(
        token,
        "ACCOUNT_ACCESS_INVALID",
        normalizedCurrentDate,
      );

      return {
        valid:
          false,

        reason:
          "ACCOUNT_ACCESS_INVALID",
      };
  }
}

export async function touchAuthSession(
  sessionId: string,
  currentDate = new Date(),
): Promise<void> {
  const normalizedSessionId =
    validateUuid(
      sessionId,
      "sessionId",
    );

  await executeSqlQuery(
    `
      UPDATE dbo.auth_sessions
      SET last_seen_at = @lastSeenAt
      WHERE
        session_id = @sessionId
        AND revoked_at IS NULL
        AND expires_at > @lastSeenAt;
    `,
    (sqlRequest) => {
      sqlRequest.input(
        "sessionId",
        UniqueIdentifier,
        normalizedSessionId,
      );

      sqlRequest.input(
        "lastSeenAt",
        DateTime2,
        currentDate,
      );
    },
  );
}

export async function revokeAuthSessionByToken(
  token: string,
  reason = "SIGN_OUT",
  currentDate = new Date(),
): Promise<boolean> {
  let tokenHash:
    string;

  try {
    tokenHash =
      createSessionTokenHash(
        token,
      );
  } catch {
    return false;
  }

  const normalizedReason =
    reason
      .trim()
      .slice(0, 100)
      || "SIGN_OUT";

  const result =
    await executeSqlQuery(
      `
        UPDATE dbo.auth_sessions
        SET
          revoked_at = @revokedAt,
          revocation_reason = @reason
        WHERE
          token_hash = @tokenHash
          AND revoked_at IS NULL;
      `,
      (sqlRequest) => {
        sqlRequest.input(
          "tokenHash",
          VarChar(64),
          tokenHash,
        );

        sqlRequest.input(
          "revokedAt",
          DateTime2,
          currentDate,
        );

        sqlRequest.input(
          "reason",
          NVarChar(100),
          normalizedReason,
        );
      },
    );

  return (
    result.rowsAffected[0]
    ?? 0
  ) > 0;
}

export async function revokeAllAccountSessions(
  accountId: string,
  reason = "ACCOUNT_SECURITY_CHANGE",
  currentDate = new Date(),
): Promise<number> {
  const normalizedAccountId =
    validateUuid(
      accountId,
      "accountId",
    );

  const normalizedReason =
    reason
      .trim()
      .slice(0, 100)
      || "ACCOUNT_SECURITY_CHANGE";

  const result =
    await executeSqlQuery(
      `
        UPDATE dbo.auth_sessions
        SET
          revoked_at = @revokedAt,
          revocation_reason = @reason
        WHERE
          account_id = @accountId
          AND revoked_at IS NULL;
      `,
      (sqlRequest) => {
        sqlRequest.input(
          "accountId",
          UniqueIdentifier,
          normalizedAccountId,
        );

        sqlRequest.input(
          "revokedAt",
          DateTime2,
          currentDate,
        );

        sqlRequest.input(
          "reason",
          NVarChar(100),
          normalizedReason,
        );
      },
    );

  return result.rowsAffected[0]
    ?? 0;
}