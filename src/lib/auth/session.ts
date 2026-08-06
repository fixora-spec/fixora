import "server-only";

import {
  randomUUID,
} from "node:crypto";

import {
  isIP,
} from "node:net";

import {
  DateTime2,
  NVarChar,
  Request,
  Transaction,
  UniqueIdentifier,
  VarChar,
} from "mssql";

import {
  AUTH_REQUEST_LIMITS,
  AUTH_SESSION_RULES,
} from "@/config/auth.config";

import {
  createSqlRequest,
  executeSqlQuery,
  executeSqlSingle,
  toDatabaseError,
  withSqlTransaction,
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
const MINIMUM_SESSION_TOKEN_LENGTH = 43;
const MAXIMUM_SESSION_TOKEN_LENGTH = 512;
const MAXIMUM_SECRET_LENGTH = 1_024;
const SESSION_TOUCH_INTERVAL_MINUTES = 5;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const SESSION_TOKEN_PATTERN =
  /^[A-Za-z0-9_-]+$/u;

const SESSION_HASH_PATTERN =
  /^[a-f0-9]{64}$/iu;

const FORBIDDEN_CONTROL_CHARACTER_PATTERN =
  /[\u0000-\u001F\u007F]/u;

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
  const rawValue = process.env[name]?.trim();

  if (!rawValue) {
    return fallbackValue;
  }

  if (!/^\d+$/u.test(rawValue)) {
    throw new Error(`${name} debe contener un número entero válido.`);
  }

  const parsedValue = Number.parseInt(rawValue, 10);

  if (
    !Number.isSafeInteger(parsedValue)
    || parsedValue < minimum
    || parsedValue > maximum
  ) {
    throw new Error(`${name} debe estar entre ${minimum} y ${maximum}.`);
  }

  return parsedValue;
}

function readBooleanEnvironmentValue(
  name: string,
  fallbackValue: boolean,
): boolean {
  const rawValue = process.env[name]?.trim().toLowerCase();

  if (!rawValue) {
    return fallbackValue;
  }

  if (rawValue === "true") {
    return true;
  }

  if (rawValue === "false") {
    return false;
  }

  throw new Error(`${name} debe tener el valor true o false.`);
}

function getSessionPepper(): string {
  const pepper = process.env.AUTH_SESSION_PEPPER;

  if (
    typeof pepper !== "string"
    || pepper.trim().length === 0
    || pepper.length < 32
    || pepper.length > MAXIMUM_SECRET_LENGTH
    || FORBIDDEN_CONTROL_CHARACTER_PATTERN.test(pepper)
  ) {
    throw new Error(
      "AUTH_SESSION_PEPPER debe contener un secreto válido de al menos 32 caracteres.",
    );
  }

  // Los secretos se conservan exactamente como fueron configurados.
  return pepper;
}

function getSessionCookieName(): string {
  const configuredName = process.env.AUTH_SESSION_COOKIE_NAME?.trim();
  const cookieName =
    configuredName || AUTH_SESSION_RULES.cookieNameFallback;

  if (!/^[A-Za-z0-9_-]{1,64}$/u.test(cookieName)) {
    throw new Error(
      "AUTH_SESSION_COOKIE_NAME no contiene un nombre de cookie válido.",
    );
  }

  return cookieName;
}

function getSessionTtlHours(): number {
  return readPositiveIntegerEnvironmentValue(
    "AUTH_SESSION_TTL_HOURS",
    AUTH_SESSION_RULES.defaultTimeToLiveHours || DEFAULT_SESSION_TTL_HOURS,
    1,
    24 * 365,
  );
}

function isSecureSessionCookie(): boolean {
  if (process.env.NODE_ENV === "production") {
    return true;
  }

  return readBooleanEnvironmentValue(
    "AUTH_SESSION_COOKIE_SECURE",
    false,
  );
}

function validateUuid(
  value: string,
  fieldName: string,
): string {
  const normalizedValue = value.trim().toLowerCase();

  if (!UUID_PATTERN.test(normalizedValue)) {
    throw new Error(`${fieldName} no contiene un UUID válido.`);
  }

  return normalizedValue;
}

function validateDate(
  value: Date,
  fieldName: string,
): Date {
  const normalizedDate = new Date(value);

  if (
    Number.isNaN(normalizedDate.getTime())
    || normalizedDate.getUTCFullYear() < 1
    || normalizedDate.getUTCFullYear() > 9_999
  ) {
    throw new Error(`${fieldName} no contiene una fecha válida.`);
  }

  return normalizedDate;
}

function mapNullableDate(
  value: Date | null,
  fieldName: string,
): Date | null {
  return value === null
    ? null
    : validateDate(value, fieldName);
}

function isValidSessionToken(value: string): boolean {
  return (
    value.length >= MINIMUM_SESSION_TOKEN_LENGTH
    && value.length <= MAXIMUM_SESSION_TOKEN_LENGTH
    && SESSION_TOKEN_PATTERN.test(value)
  );
}

function stripAddressDecorators(value: string): string {
  const normalizedValue = value.trim();

  if (
    normalizedValue.startsWith("[")
    && normalizedValue.includes("]")
  ) {
    return normalizedValue.slice(1, normalizedValue.indexOf("]"));
  }

  const ipv4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d{1,5}$/u.exec(
    normalizedValue,
  );

  return ipv4WithPort?.[1] ?? normalizedValue;
}

function normalizeIpAddress(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  let normalizedValue = stripAddressDecorators(
    value.replace(/^"|"$/gu, ""),
  );

  if (normalizedValue.toLowerCase().startsWith("::ffff:")) {
    const mappedIpv4 = normalizedValue.slice("::ffff:".length);

    if (isIP(mappedIpv4) === 4) {
      normalizedValue = mappedIpv4;
    }
  }

  if (!normalizedValue) {
    return null;
  }

  if (
    normalizedValue.length > AUTH_REQUEST_LIMITS.maximumIpAddressLength
    || FORBIDDEN_CONTROL_CHARACTER_PATTERN.test(normalizedValue)
    || isIP(normalizedValue) === 0
  ) {
    return null;
  }

  return normalizedValue.toLowerCase();
}

function normalizeUserAgent(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value
    .replace(/[\u0000-\u001F\u007F]+/gu, " ")
    .trim()
    .normalize("NFC");

  if (!normalizedValue) {
    return null;
  }

  return normalizedValue.slice(
    0,
    AUTH_REQUEST_LIMITS.maximumUserAgentLength,
  );
}

function normalizeRevocationReason(
  reason: string,
  fallbackReason: string,
): string {
  const normalizedReason = reason
    .replace(/[\u0000-\u001F\u007F]+/gu, " ")
    .trim()
    .normalize("NFC")
    .slice(0, 100);

  return normalizedReason || fallbackReason;
}

function mapSessionRecord(
  record: SessionDatabaseRecord,
): AuthSessionRecord {
  const createdAt = validateDate(record.created_at, "created_at");
  const expiresAt = validateDate(record.expires_at, "expires_at");
  const lastSeenAt = validateDate(record.last_seen_at, "last_seen_at");
  const revokedAt = mapNullableDate(record.revoked_at, "revoked_at");

  if (
    expiresAt.getTime() <= createdAt.getTime()
    || lastSeenAt.getTime() < createdAt.getTime()
    || (revokedAt && revokedAt.getTime() < createdAt.getTime())
    || (revokedAt === null) !== (record.revocation_reason === null)
  ) {
    throw new Error("SQL Server devolvió una sesión inconsistente.");
  }

  return {
    sessionId: validateUuid(record.session_id, "session_id"),
    accountId: validateUuid(record.account_id, "account_id"),
    createdAt,
    expiresAt,
    lastSeenAt,
    revokedAt,
    revocationReason: record.revocation_reason,
    ipAddress: normalizeIpAddress(record.ip_address),
    userAgent: normalizeUserAgent(record.user_agent),
  };
}

async function createSessionRequest(
  transaction?: Transaction,
): Promise<Request> {
  return transaction
    ? new Request(transaction)
    : createSqlRequest();
}

export function createSessionTokenHash(token: string): string {
  if (!isValidSessionToken(token)) {
    throw new Error("El token de sesión no tiene un formato válido.");
  }

  return createSecretHash(token, getSessionPepper());
}

export function verifySessionTokenHash(
  token: string,
  expectedHash: string,
): boolean {
  if (
    !isValidSessionToken(token)
    || expectedHash.length !== SESSION_HASH_LENGTH
    || !SESSION_HASH_PATTERN.test(expectedHash)
  ) {
    return false;
  }

  return verifySecretHash(token, expectedHash, getSessionPepper());
}

export function createSessionCookieHeader(
  token: string,
  expiresAt: Date,
): string {
  if (!isValidSessionToken(token)) {
    throw new Error("El token de sesión no tiene un formato válido.");
  }

  const normalizedExpiresAt = validateDate(expiresAt, "expiresAt");
  const maximumAgeSeconds = Math.max(
    0,
    Math.floor((normalizedExpiresAt.getTime() - Date.now()) / 1_000),
  );

  const attributes = [
    `${getSessionCookieName()}=${encodeURIComponent(token)}`,
    `Path=${AUTH_SESSION_RULES.cookiePath}`,
    `Expires=${normalizedExpiresAt.toUTCString()}`,
    `Max-Age=${maximumAgeSeconds}`,
    "HttpOnly",
    "SameSite=Lax",
    "Priority=High",
  ];

  if (isSecureSessionCookie()) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

export function createExpiredSessionCookieHeader(): string {
  const attributes = [
    `${getSessionCookieName()}=`,
    `Path=${AUTH_SESSION_RULES.cookiePath}`,
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Lax",
    "Priority=High",
  ];

  if (isSecureSessionCookie()) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

export function getSessionTokenFromRequest(
  request: globalThis.Request,
): string | null {
  const cookieHeader = request.headers.get("cookie");

  if (!cookieHeader || cookieHeader.length > 16_384) {
    return null;
  }

  const expectedCookieName = getSessionCookieName();
  let matchedToken: string | null = null;

  for (const cookie of cookieHeader.split(";")) {
    const separatorIndex = cookie.indexOf("=");

    if (separatorIndex < 0) {
      continue;
    }

    const name = cookie.slice(0, separatorIndex).trim();

    if (name !== expectedCookieName) {
      continue;
    }

    // Cookies duplicadas permiten ataques de cookie tossing. Fallamos cerrado.
    if (matchedToken !== null) {
      return null;
    }

    const rawValue = cookie.slice(separatorIndex + 1).trim();

    if (!rawValue) {
      return null;
    }

    try {
      const decodedValue = decodeURIComponent(rawValue);

      if (!isValidSessionToken(decodedValue)) {
        return null;
      }

      matchedToken = decodedValue;
    } catch {
      return null;
    }
  }

  return matchedToken;
}

function readForwardedForAddress(value: string | null): string | null {
  if (!value || value.length > 4_096) {
    return null;
  }

  for (const part of value.split(",")) {
    const address = normalizeIpAddress(part);

    if (address) {
      return address;
    }
  }

  return null;
}

function readStandardForwardedAddress(value: string | null): string | null {
  if (!value || value.length > 4_096) {
    return null;
  }

  for (const element of value.split(",")) {
    for (const directive of element.split(";")) {
      const [rawName, ...rawValueParts] = directive.split("=");

      if (rawName?.trim().toLowerCase() !== "for") {
        continue;
      }

      const address = normalizeIpAddress(rawValueParts.join("="));

      if (address) {
        return address;
      }
    }
  }

  return null;
}

export function getRequestIpAddress(
  request: globalThis.Request,
): string | null {
  const directHeaders = [
    "cf-connecting-ip",
    "true-client-ip",
    "x-real-ip",
  ] as const;

  for (const headerName of directHeaders) {
    const address = normalizeIpAddress(request.headers.get(headerName));

    if (address) {
      return address;
    }
  }

  return (
    readForwardedForAddress(
      request.headers.get("x-vercel-forwarded-for"),
    )
    ?? readForwardedForAddress(
      request.headers.get("x-forwarded-for"),
    )
    ?? readStandardForwardedAddress(
      request.headers.get("forwarded"),
    )
  );
}

export function getRequestUserAgent(
  request: globalThis.Request,
): string | null {
  return normalizeUserAgent(request.headers.get("user-agent"));
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

  const accessExpiresAt = validateDate(
    account.accessExpiresAt,
    "accessExpiresAt",
  );

  const expiresAt = new Date(
    Math.min(configuredExpiresAt.getTime(), accessExpiresAt.getTime()),
  );

  if (expiresAt.getTime() <= currentDate.getTime()) {
    throw new Error(
      "No se puede crear una sesión después del vencimiento del acceso administrativo.",
    );
  }

  return expiresAt;
}

async function createAuthSessionWithinTransaction(
  input: CreateAuthSessionInput,
  transaction: Transaction,
): Promise<CreatedAuthSession> {
  const accountId = validateUuid(input.accountId, "accountId");
  const currentDate = validateDate(
    input.currentDate ?? new Date(),
    "currentDate",
  );

  const account = await findAccountById(accountId, transaction);

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

  const accessState = resolveAccountAccessState(account, currentDate);

  switch (accessState) {
    case "ACTIVE":
      break;

    case "NOT_STARTED":
      throw new Error("El acceso administrativo todavía no ha iniciado.");

    case "EXPIRED":
      throw new Error("El acceso administrativo ha vencido.");

    case "INVALID":
    default:
      throw new Error("La vigencia de la cuenta no es válida.");
  }

  const token = generateOpaqueToken(DEFAULT_SESSION_TOKEN_BYTES);
  const tokenHash = createSessionTokenHash(token);
  const sessionId = randomUUID();
  const configuredExpiresAt = new Date(
    currentDate.getTime() + getSessionTtlHours() * 60 * 60 * 1_000,
  );
  const expiresAt = account.role === "ADMIN"
    ? resolveAdministratorSessionExpiration(
        account,
        configuredExpiresAt,
        currentDate,
      )
    : configuredExpiresAt;

  const ipAddress = normalizeIpAddress(input.ipAddress);
  const userAgent = normalizeUserAgent(input.userAgent);
  const request = await createSessionRequest(transaction);

  request.input("sessionId", UniqueIdentifier, sessionId);
  request.input("accountId", UniqueIdentifier, accountId);
  request.input("tokenHash", VarChar(64), tokenHash);
  request.input(
    "ipAddress",
    NVarChar(AUTH_REQUEST_LIMITS.maximumIpAddressLength),
    ipAddress,
  );
  request.input(
    "userAgent",
    NVarChar(AUTH_REQUEST_LIMITS.maximumUserAgentLength),
    userAgent,
  );
  request.input("createdAt", DateTime2, currentDate);
  request.input("expiresAt", DateTime2, expiresAt);
  request.input("lastSeenAt", DateTime2, currentDate);

  const result = await request.query<SessionDatabaseRecord>(`
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
  `);

  const record = result.recordset[0];

  if (!record) {
    throw new Error("SQL Server no devolvió la sesión creada.");
  }

  const session = mapSessionRecord(record);

  return {
    token,
    cookieHeader: createSessionCookieHeader(token, session.expiresAt),
    session,
  };
}

export async function createAuthSession(
  input: CreateAuthSessionInput,
  transaction?: Transaction,
): Promise<CreatedAuthSession> {
  try {
    if (transaction) {
      return await createAuthSessionWithinTransaction(input, transaction);
    }

    return await withSqlTransaction(
      (activeTransaction) =>
        createAuthSessionWithinTransaction(input, activeTransaction),
      {
        isolationLevel: "SERIALIZABLE",
      },
    );
  } catch (error) {
    throw toDatabaseError(error, "TRANSACTION_FAILED");
  }
}

export async function findAuthSessionByToken(
  token: string,
): Promise<AuthSessionRecord | null> {
  let tokenHash: string;

  try {
    tokenHash = createSessionTokenHash(token);
  } catch {
    return null;
  }

  const result = await executeSqlSingle<SessionDatabaseRecord>(
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
      sqlRequest.input("tokenHash", VarChar(64), tokenHash);
    },
  );

  return result.record ? mapSessionRecord(result.record) : null;
}

async function tryRevokeSessionForAccountState(
  token: string,
  reason: string,
  currentDate: Date,
): Promise<void> {
  try {
    await revokeAuthSessionByToken(token, reason, currentDate);
  } catch {
    // La sesión sigue siendo rechazada aunque falle la persistencia.
  }
}

export async function validateAuthSessionToken(
  token: string | null,
  currentDate = new Date(),
): Promise<SessionValidationResult> {
  if (!token) {
    return {
      valid: false,
      reason: "MISSING",
    };
  }

  if (!isValidSessionToken(token)) {
    return {
      valid: false,
      reason: "INVALID",
    };
  }

  const normalizedCurrentDate = validateDate(currentDate, "currentDate");
  const session = await findAuthSessionByToken(token);

  if (!session) {
    return {
      valid: false,
      reason: "INVALID",
    };
  }

  if (session.revokedAt) {
    return {
      valid: false,
      reason: "REVOKED",
    };
  }

  if (session.expiresAt.getTime() <= normalizedCurrentDate.getTime()) {
    await tryRevokeSessionForAccountState(
      token,
      "SESSION_EXPIRED",
      normalizedCurrentDate,
    );

    return {
      valid: false,
      reason: "EXPIRED",
    };
  }

  const account = await findAccountById(session.accountId);

  if (!account) {
    await tryRevokeSessionForAccountState(
      token,
      "ACCOUNT_NOT_FOUND",
      normalizedCurrentDate,
    );

    return {
      valid: false,
      reason: "ACCOUNT_NOT_FOUND",
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
      valid: false,
      reason: "ACCOUNT_INACTIVE",
    };
  }

  const accessState = resolveAccountAccessState(
    account,
    normalizedCurrentDate,
  );

  switch (accessState) {
    case "ACTIVE":
      return {
        valid: true,
        session,
      };

    case "NOT_STARTED":
      await tryRevokeSessionForAccountState(
        token,
        "ACCOUNT_ACCESS_NOT_STARTED",
        normalizedCurrentDate,
      );

      return {
        valid: false,
        reason: "ACCOUNT_ACCESS_NOT_STARTED",
      };

    case "EXPIRED":
      await tryRevokeSessionForAccountState(
        token,
        "ACCOUNT_ACCESS_EXPIRED",
        normalizedCurrentDate,
      );

      return {
        valid: false,
        reason: "ACCOUNT_ACCESS_EXPIRED",
      };

    case "INVALID":
    default:
      await tryRevokeSessionForAccountState(
        token,
        "ACCOUNT_ACCESS_INVALID",
        normalizedCurrentDate,
      );

      return {
        valid: false,
        reason: "ACCOUNT_ACCESS_INVALID",
      };
  }
}

export async function touchAuthSession(
  sessionId: string,
  currentDate = new Date(),
): Promise<void> {
  const normalizedSessionId = validateUuid(sessionId, "sessionId");
  const normalizedCurrentDate = validateDate(currentDate, "currentDate");

  await executeSqlQuery(
    `
      UPDATE dbo.auth_sessions
      SET last_seen_at = @lastSeenAt
      WHERE
        session_id = @sessionId
        AND revoked_at IS NULL
        AND expires_at > @lastSeenAt
        AND last_seen_at < DATEADD(
          MINUTE,
          -${SESSION_TOUCH_INTERVAL_MINUTES},
          @lastSeenAt
        );
    `,
    (sqlRequest) => {
      sqlRequest.input(
        "sessionId",
        UniqueIdentifier,
        normalizedSessionId,
      );
      sqlRequest.input("lastSeenAt", DateTime2, normalizedCurrentDate);
    },
  );
}

export async function revokeAuthSessionByToken(
  token: string,
  reason = "SIGN_OUT",
  currentDate = new Date(),
  transaction?: Transaction,
): Promise<boolean> {
  let tokenHash: string;

  try {
    tokenHash = createSessionTokenHash(token);
  } catch {
    return false;
  }

  const normalizedReason = normalizeRevocationReason(reason, "SIGN_OUT");
  const normalizedCurrentDate = validateDate(currentDate, "currentDate");

  try {
    const request = await createSessionRequest(transaction);

    request.input("tokenHash", VarChar(64), tokenHash);
    request.input("revokedAt", DateTime2, normalizedCurrentDate);
    request.input("reason", NVarChar(100), normalizedReason);

    const result = await request.query(`
      UPDATE dbo.auth_sessions WITH (UPDLOCK, ROWLOCK)
      SET
        revoked_at = @revokedAt,
        revocation_reason = @reason
      WHERE
        token_hash = @tokenHash
        AND revoked_at IS NULL;
    `);

    return (result.rowsAffected[0] ?? 0) > 0;
  } catch (error) {
    throw toDatabaseError(error, "QUERY_FAILED");
  }
}

export async function revokeAllAccountSessions(
  accountId: string,
  reason = "ACCOUNT_SECURITY_CHANGE",
  currentDate = new Date(),
  transaction?: Transaction,
): Promise<number> {
  const normalizedAccountId = validateUuid(accountId, "accountId");
  const normalizedReason = normalizeRevocationReason(
    reason,
    "ACCOUNT_SECURITY_CHANGE",
  );
  const normalizedCurrentDate = validateDate(currentDate, "currentDate");

  try {
    const request = await createSessionRequest(transaction);

    request.input("accountId", UniqueIdentifier, normalizedAccountId);
    request.input("revokedAt", DateTime2, normalizedCurrentDate);
    request.input("reason", NVarChar(100), normalizedReason);

    const result = await request.query(`
      UPDATE dbo.auth_sessions WITH (UPDLOCK, ROWLOCK)
      SET
        revoked_at = @revokedAt,
        revocation_reason = @reason
      WHERE
        account_id = @accountId
        AND revoked_at IS NULL;
    `);

    return result.rowsAffected[0] ?? 0;
  } catch (error) {
    throw toDatabaseError(error, "QUERY_FAILED");
  }
}