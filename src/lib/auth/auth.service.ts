import "server-only";

import {
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import {
  DateTime2,
  Int,
  Request,
  Transaction,
  UniqueIdentifier,
  VarChar,
} from "mssql";

import {
  AUTH_ATTEMPT_RULES,
  AUTH_AUDIT_EVENTS,
  AUTH_NOTIFICATION_KEYS,
} from "@/config/auth.config";

import {
  EmailDeliveryError,
  createEmailVerificationTemplate,
  createPasswordResetTemplate,
  sendEmail,
} from "@/lib/email";

import {
  createSqlRequest,
  toDatabaseError,
  withSqlTransaction,
} from "@/lib/database";

import type {
  AccountRole,
} from "@/types/account";

import type {
  EmailVerificationRequest,
  PasswordChangeRequest,
  PasswordResetCodeVerificationRequest,
  PasswordResetRequest,
  SignInRequest,
  UserRegistrationRequest,
  VerificationPurpose,
} from "@/types/auth";

import {
  resolveAccountAccessState,
} from "./account-access";

import {
  findAccountByEmail,
  findAccountById,
  findPotentialUsernameConflicts,
  createPendingUserAccount,
  markAccountEmailAsVerified,
  recordSuccessfulSignIn,
  toAccountPublicRecord,
  updateAccountPassword,
  updateFailedSignInState,
} from "./account.repository";

import type {
  AccountPublicRecord,
  AccountRepositoryRecord,
} from "./account.repository";

import {
  createAuthAuditEvent,
  tryCreateAuthAuditEvent,
} from "./audit";

import {
  createNotification,
} from "./notification.repository";

import {
  hashPassword,
  needsPasswordRehash,
  verifyPassword,
} from "./password";

import {
  createAuthSession,
  revokeAllAccountSessions,
} from "./session";

import {
  areUsernamesConfusinglySimilar,
  createUsernameComparisonSkeleton,
  generateUsernameCandidates,
  normalizeUsername,
  validateUsername,
} from "./username";

import {
  generateAuthVerificationCode,
  getVerificationCodeRemainingSeconds,
  getVerificationCodeTtlMinutes,
  verifyVerificationCodeHash,
} from "./verification-code";

export type AuthRequestContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type AuthServiceErrorCode =
  | "EMAIL_ALREADY_IN_USE"
  | "USERNAME_UNAVAILABLE"
  | "INVALID_CREDENTIALS"
  | "EMAIL_NOT_VERIFIED"
  | "ACCOUNT_INACTIVE"
  | "ACCOUNT_LOCKED"
  | "ACCOUNT_ACCESS_NOT_STARTED"
  | "ACCOUNT_ACCESS_EXPIRED"
  | "ACCOUNT_ACCESS_INVALID"
  | "ACCOUNT_NOT_FOUND"
  | "INVALID_VERIFICATION_CODE"
  | "VERIFICATION_CODE_EXPIRED"
  | "VERIFICATION_ATTEMPTS_EXCEEDED"
  | "VERIFICATION_RESEND_TOO_SOON"
  | "PASSWORD_RESET_TOKEN_INVALID"
  | "PASSWORD_RESET_TOKEN_EXPIRED"
  | "ROLE_MISMATCH"
  | "DATABASE_CONFLICT"
  | "EMAIL_DELIVERY_FAILED";

export class AuthServiceError
  extends Error {
  public readonly code:
    AuthServiceErrorCode;

  public readonly status:
    number;

  public readonly retryAfterSeconds:
    number | null;

  public constructor(
    code: AuthServiceErrorCode,
    message: string,
    status: number,
    retryAfterSeconds:
      number | null = null,
  ) {
    super(message);

    this.name =
      "AuthServiceError";

    this.code =
      code;

    this.status =
      status;

    this.retryAfterSeconds =
      retryAfterSeconds;
  }
}

type NestedErrorRecord = {
  cause?: unknown;
  originalError?: unknown;
};

function isNestedErrorRecord(
  value: unknown,
): value is NestedErrorRecord {
  return (
    typeof value === "object"
    && value !== null
  );
}

function findNestedAuthServiceError(
  error: unknown,
  depth = 0,
): AuthServiceError | null {
  if (error instanceof AuthServiceError) {
    return error;
  }

  if (
    depth >= 6
    || !isNestedErrorRecord(error)
  ) {
    return null;
  }

  return (
    findNestedAuthServiceError(
      error.originalError,
      depth + 1,
    )
    ?? findNestedAuthServiceError(
      error.cause,
      depth + 1,
    )
  );
}

function findNestedEmailDeliveryError(
  error: unknown,
  depth = 0,
): EmailDeliveryError | null {
  if (error instanceof EmailDeliveryError) {
    return error;
  }

  if (
    depth >= 6
    || !isNestedErrorRecord(error)
  ) {
    return null;
  }

  return (
    findNestedEmailDeliveryError(
      error.originalError,
      depth + 1,
    )
    ?? findNestedEmailDeliveryError(
      error.cause,
      depth + 1,
    )
  );
}

function createEmailDeliveryServiceError(
  locale: UserRegistrationRequest["locale"],
): AuthServiceError {
  return new AuthServiceError(
    "EMAIL_DELIVERY_FAILED",

    locale === "en"
      ? "The email could not be delivered. Please try again."
      : "No se pudo entregar el correo. Inténtalo nuevamente.",

    502,
  );
}

export type RegisterUserResult = {
  accountId: string;
  username: string;
  email: string;

  verificationExpiresAt: string;
  resendAvailableAt: string;
};

export type VerifyEmailResult = {
  account: AccountPublicRecord;
};

export type SignInResult = {
  account: AccountPublicRecord;

  session: {
    expiresAt: string;
    cookieHeader: string;
  };
};

export type PasswordResetRequestResult = {
  accepted: true;

  expiresAt: string | null;
  resendAvailableAt: string | null;
};

export type PasswordResetCodeResult = {
  resetToken: string;
  expiresAt: string;
};

export type PasswordResetResult = {
  accountId: string;
};

export type UsernameAvailabilityResult = {
  username: string;
  normalizedUsername: string;

  available: boolean;

  reason:
    | "TAKEN"
    | "TOO_SIMILAR"
    | null;

  suggestions:
    readonly string[];
};

type VerificationCodeDatabaseRecord = {
  verification_id: string;
  account_id: string;

  purpose: string;
  code_hash: string;

  attempts_used: number;
  maximum_attempts: number;

  resend_available_at: Date;
  created_at: Date;
  expires_at: Date;
  consumed_at: Date | null;
};

type ResetTokenPayload = {
  accountId: string;
  accountRole: AccountRole;

  passwordVersion: number;

  issuedAt: number;
  expiresAt: number;
};

const PASSWORD_RESET_TOKEN_TTL_MINUTES =
  15;

const MAXIMUM_CODE_GENERATION_ATTEMPTS =
  20;

const MAXIMUM_PASSWORD_RESET_TOKEN_LENGTH =
  2_048;

const MAXIMUM_PASSWORD_RESET_TOKEN_CLOCK_SKEW_MS =
  60_000;

const BASE64URL_PATTERN =
  /^[A-Za-z0-9_-]+$/u;

const FORBIDDEN_CONTROL_CHARACTER_PATTERN =
  /[\u0000-\u001F\u007F]/u;

/*
 * Hash de una contraseña ficticia utilizado únicamente para equilibrar el
 * coste de los intentos contra cuentas inexistentes. No corresponde a una
 * cuenta real ni concede acceso.
 */
const DUMMY_PASSWORD_HASH =
  "v1$scrypt$16384$8$1$Zml4b3JhLWR1bW15LXNhbHQtZm9yLXRpbWluZy12MSE$QL_IAtXU2UDv6dFQH12iaou0e3CDMFB5Ok8wd__A2mjnDp4TrQu3472I8HYqFnimIxmSvYl6tvtFp9x_wjLusA";

function createPublicPasswordResetTiming(
  currentDate: Date,
): PasswordResetRequestResult {
  const expiresAt =
    new Date(
      currentDate.getTime()
      + getVerificationCodeTtlMinutes(
          "PASSWORD_RESET",
        )
        * 60_000,
    );

  const resendAvailableAt =
    new Date(
      currentDate.getTime()
      + AUTH_ATTEMPT_RULES
        .verificationResendCooldownSeconds
        * 1_000,
    );

  return {
    accepted:
      true,

    expiresAt:
      expiresAt.toISOString(),

    resendAvailableAt:
      resendAvailableAt
        .toISOString(),
  };
}

async function createAuthRequest(
  transaction?: Transaction,
): Promise<Request> {
  if (transaction) {
    return new Request(
      transaction,
    );
  }

  return createSqlRequest();
}

function validateUuid(
  value: string,
  fieldName: string,
): string {
  const normalizedValue =
    value.trim();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      normalizedValue,
    )
  ) {
    throw new Error(
      `${fieldName} no contiene un UUID válido.`,
    );
  }

  return normalizedValue;
}

function getPasswordResetTokenSecret():
  string {
  const secret =
    process.env
      .AUTH_PASSWORD_RESET_TOKEN_SECRET;

  if (
    typeof secret !== "string"
    || secret.trim().length === 0
    || secret.length < 32
    || secret.length > 1_024
    || FORBIDDEN_CONTROL_CHARACTER_PATTERN.test(
      secret,
    )
  ) {
    throw new Error(
      "AUTH_PASSWORD_RESET_TOKEN_SECRET debe contener un secreto válido de al menos 32 caracteres.",
    );
  }

  // El secreto se conserva exactamente como fue configurado.
  return secret;
}

function createResetTokenSignature(
  encodedPayload: string,
): string {
  return createHmac(
    "sha256",
    getPasswordResetTokenSecret(),
  )
    .update(
      encodedPayload,
      "utf8",
    )
    .digest(
      "base64url",
    );
}

function createPasswordResetToken(
  account: AccountRepositoryRecord,
  currentDate = new Date(),
): PasswordResetCodeResult {
  const issuedAt =
    currentDate.getTime();

  const expiresAt =
    issuedAt
    + PASSWORD_RESET_TOKEN_TTL_MINUTES
      * 60_000;

  const payload:
    ResetTokenPayload = {
      accountId:
        account.accountId,

      accountRole:
        account.role,

      passwordVersion:
        account.updatedAt.getTime(),

      issuedAt,
      expiresAt,
    };

  const encodedPayload =
    Buffer.from(
      JSON.stringify(payload),
      "utf8",
    ).toString(
      "base64url",
    );

  const signature =
    createResetTokenSignature(
      encodedPayload,
    );

  return {
    resetToken:
      `${encodedPayload}.${signature}`,

    expiresAt:
      new Date(
        expiresAt,
      ).toISOString(),
  };
}

function isResetTokenPayload(
  value: unknown,
): value is ResetTokenPayload {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
  ) {
    return false;
  }

  const payload =
    value as Record<string, unknown>;

  return (
    typeof payload.accountId
      === "string"
    && (
      payload.accountRole === "USER"
      || payload.accountRole === "ADMIN"
    )
    && typeof payload.passwordVersion
      === "number"
    && typeof payload.issuedAt
      === "number"
    && typeof payload.expiresAt
      === "number"
  );
}

function parsePasswordResetToken(
  token: string,
  currentDate = new Date(),
): ResetTokenPayload {
  const invalidToken = (): never => {
    throw new AuthServiceError(
      "PASSWORD_RESET_TOKEN_INVALID",
      "El token de recuperación no es válido.",
      400,
    );
  };

  if (
    token.length === 0
    || token.length > MAXIMUM_PASSWORD_RESET_TOKEN_LENGTH
    || FORBIDDEN_CONTROL_CHARACTER_PATTERN.test(token)
  ) {
    return invalidToken();
  }

  const parts = token.split(".");

  if (parts.length !== 2) {
    return invalidToken();
  }

  const [encodedPayload, providedSignature] = parts;

  if (
    !encodedPayload
    || !providedSignature
    || !BASE64URL_PATTERN.test(encodedPayload)
    || !BASE64URL_PATTERN.test(providedSignature)
  ) {
    return invalidToken();
  }

  let decodedPayload: Buffer;
  let providedSignatureBuffer: Buffer;

  try {
    decodedPayload = Buffer.from(encodedPayload, "base64url");
    providedSignatureBuffer = Buffer.from(
      providedSignature,
      "base64url",
    );
  } catch {
    return invalidToken();
  }

  if (
    decodedPayload.length === 0
    || decodedPayload.length > 1_024
    || decodedPayload.toString("base64url") !== encodedPayload
    || providedSignatureBuffer.length !== 32
    || providedSignatureBuffer.toString("base64url")
      !== providedSignature
  ) {
    decodedPayload.fill(0);
    providedSignatureBuffer.fill(0);
    return invalidToken();
  }

  const expectedSignature =
    createResetTokenSignature(encodedPayload);
  const expectedSignatureBuffer =
    Buffer.from(expectedSignature, "base64url");

  try {
    if (
      providedSignatureBuffer.length
        !== expectedSignatureBuffer.length
      || !timingSafeEqual(
        providedSignatureBuffer,
        expectedSignatureBuffer,
      )
    ) {
      return invalidToken();
    }
  } finally {
    providedSignatureBuffer.fill(0);
    expectedSignatureBuffer.fill(0);
  }

  let parsedPayload: unknown;

  try {
    parsedPayload = JSON.parse(
      decodedPayload.toString("utf8"),
    ) as unknown;
  } catch {
    return invalidToken();
  } finally {
    decodedPayload.fill(0);
  }

  if (!isResetTokenPayload(parsedPayload)) {
    return invalidToken();
  }

  validateUuid(parsedPayload.accountId, "accountId");

  const normalizedCurrentDate = new Date(currentDate);

  if (Number.isNaN(normalizedCurrentDate.getTime())) {
    return invalidToken();
  }

  const maximumTokenLifetimeMs =
    PASSWORD_RESET_TOKEN_TTL_MINUTES * 60_000;

  if (
    !Number.isSafeInteger(parsedPayload.passwordVersion)
    || !Number.isSafeInteger(parsedPayload.issuedAt)
    || !Number.isSafeInteger(parsedPayload.expiresAt)
    || parsedPayload.passwordVersion <= 0
    || parsedPayload.issuedAt <= 0
    || parsedPayload.expiresAt <= parsedPayload.issuedAt
    || parsedPayload.expiresAt - parsedPayload.issuedAt
      > maximumTokenLifetimeMs
    || parsedPayload.issuedAt
      > normalizedCurrentDate.getTime()
        + MAXIMUM_PASSWORD_RESET_TOKEN_CLOCK_SKEW_MS
  ) {
    return invalidToken();
  }

  if (
    parsedPayload.expiresAt
      <= normalizedCurrentDate.getTime()
  ) {
    throw new AuthServiceError(
      "PASSWORD_RESET_TOKEN_EXPIRED",
      "El token de recuperación ha vencido.",
      400,
    );
  }

  return parsedPayload;
}

async function findLatestVerificationCode(
  accountId: string,
  purpose: VerificationPurpose,
  transaction?: Transaction,
): Promise<VerificationCodeDatabaseRecord | null> {
  const request =
    await createAuthRequest(
      transaction,
    );

  request.input(
    "accountId",
    UniqueIdentifier,
    validateUuid(
      accountId,
      "accountId",
    ),
  );

  request.input(
    "purpose",
    VarChar(40),
    purpose,
  );

  const result =
    await request.query<
      VerificationCodeDatabaseRecord
    >(`
      SELECT TOP (1)
        verification_id,
        account_id,
        purpose,
        code_hash,
        attempts_used,
        maximum_attempts,
        resend_available_at,
        created_at,
        expires_at,
        consumed_at
      FROM dbo.auth_verification_codes${
        transaction
          ? " WITH (UPDLOCK, HOLDLOCK, ROWLOCK)"
          : ""
      }
      WHERE
        account_id = @accountId
        AND purpose = @purpose
      ORDER BY created_at DESC;
    `);

  return (
    result.recordset[0]
    ?? null
  );
}

async function verificationCodeHashExists(
  codeHash: string,
  transaction?: Transaction,
): Promise<boolean> {
  const request =
    await createAuthRequest(
      transaction,
    );

  request.input(
    "codeHash",
    VarChar(64),
    codeHash,
  );

  const result =
    await request.query<{
      exists_value: number;
    }>(`
      SELECT
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM dbo.auth_verification_codes
            WHERE code_hash = @codeHash
          )
          THEN 1
          ELSE 0
        END AS exists_value;
    `);

  return (
    (
      result.recordset[0]
        ?.exists_value
      ?? 0
    ) === 1
  );
}

async function issueVerificationCode(
  accountId: string,
  purpose: VerificationPurpose,
  transaction?: Transaction,
): Promise<{
  code: string;
  expiresAt: Date;
  resendAvailableAt: Date;
}> {
  for (
    let attempt = 0;
    attempt
      < MAXIMUM_CODE_GENERATION_ATTEMPTS;
    attempt += 1
  ) {
    const generatedCode =
      generateAuthVerificationCode(
        purpose,
      );

    const alreadyExists =
      await verificationCodeHashExists(
        generatedCode.codeHash,
        transaction,
      );

    if (alreadyExists) {
      continue;
    }

    const request =
      await createAuthRequest(
        transaction,
      );

    request.input(
      "verificationId",
      UniqueIdentifier,
      randomUUID(),
    );

    request.input(
      "accountId",
      UniqueIdentifier,
      validateUuid(
        accountId,
        "accountId",
      ),
    );

    request.input(
      "purpose",
      VarChar(40),
      purpose,
    );

    request.input(
      "codeHash",
      VarChar(64),
      generatedCode.codeHash,
    );

    request.input(
      "maximumAttempts",
      Int,
      generatedCode.maximumAttempts,
    );

    request.input(
      "resendAvailableAt",
      DateTime2,
      generatedCode.resendAvailableAt,
    );

    request.input(
      "createdAt",
      DateTime2,
      generatedCode.createdAt,
    );

    request.input(
      "expiresAt",
      DateTime2,
      generatedCode.expiresAt,
    );

    await request.query(`
      UPDATE dbo.auth_verification_codes
      SET consumed_at = @createdAt
      WHERE
        account_id = @accountId
        AND purpose = @purpose
        AND consumed_at IS NULL;

      INSERT INTO dbo.auth_verification_codes (
        verification_id,
        account_id,
        purpose,
        code_hash,
        attempts_used,
        maximum_attempts,
        resend_available_at,
        created_at,
        expires_at,
        consumed_at
      )
      VALUES (
        @verificationId,
        @accountId,
        @purpose,
        @codeHash,
        0,
        @maximumAttempts,
        @resendAvailableAt,
        @createdAt,
        @expiresAt,
        NULL
      );
    `);

    return {
      code:
        generatedCode.code,

      expiresAt:
        generatedCode.expiresAt,

      resendAvailableAt:
        generatedCode.resendAvailableAt,
    };
  }

  throw new Error(
    "No se pudo generar un código de verificación único.",
  );
}

async function registerFailedCodeAttempt(
  verificationId: string,
  currentDate = new Date(),
  transaction?: Transaction,
): Promise<number> {
  const request =
    await createAuthRequest(
      transaction,
    );

  request.input(
    "verificationId",
    UniqueIdentifier,
    validateUuid(
      verificationId,
      "verificationId",
    ),
  );

  request.input(
    "currentDate",
    DateTime2,
    currentDate,
  );

  const result =
    await request.query<{
      attempts_used: number;
    }>(`
      UPDATE dbo.auth_verification_codes WITH (UPDLOCK, ROWLOCK)
      SET attempts_used =
        CASE
          WHEN attempts_used < maximum_attempts
            THEN attempts_used + 1
          ELSE attempts_used
        END
      OUTPUT inserted.attempts_used
      WHERE
        verification_id = @verificationId
        AND consumed_at IS NULL
        AND expires_at > @currentDate;
    `);

  return result.recordset[0]
    ?.attempts_used
    ?? 0;
}

async function consumeVerificationCode(
  verificationId: string,
  consumedAt: Date,
  transaction?: Transaction,
): Promise<boolean> {
  const request =
    await createAuthRequest(
      transaction,
    );

  request.input(
    "verificationId",
    UniqueIdentifier,
    validateUuid(
      verificationId,
      "verificationId",
    ),
  );

  request.input(
    "consumedAt",
    DateTime2,
    consumedAt,
  );

  const result =
    await request.query(`
      UPDATE dbo.auth_verification_codes WITH (UPDLOCK, ROWLOCK)
      SET consumed_at = @consumedAt
      WHERE
        verification_id = @verificationId
        AND consumed_at IS NULL
        AND expires_at > @consumedAt
        AND attempts_used < maximum_attempts;
    `);

  return (
    result.rowsAffected[0]
    ?? 0
  ) > 0;
}

function ensureAccountCanSignIn(
  account: AccountRepositoryRecord,
  expectedRole: AccountRole,
  currentDate: Date,
): void {
  if (
    account.role
    !== expectedRole
  ) {
    throw new AuthServiceError(
      "INVALID_CREDENTIALS",
      "El correo o la contraseña son incorrectos.",
      401,
    );
  }

  if (
    account.lockedUntil
    && account.lockedUntil.getTime()
      > currentDate.getTime()
  ) {
    throw new AuthServiceError(
      "ACCOUNT_LOCKED",
      "La cuenta está bloqueada temporalmente.",
      423,
      Math.ceil(
        (
          account.lockedUntil.getTime()
          - currentDate.getTime()
        ) / 1_000,
      ),
    );
  }

  if (
    !account.emailVerifiedAt
    || account.status
      === "PENDING_VERIFICATION"
  ) {
    throw new AuthServiceError(
      "EMAIL_NOT_VERIFIED",
      "Debes verificar tu correo electrónico antes de iniciar sesión.",
      403,
    );
  }

  if (
    account.status !== "ACTIVE"
  ) {
    throw new AuthServiceError(
      "ACCOUNT_INACTIVE",
      "La cuenta no se encuentra activa.",
      403,
    );
  }

  const accessState =
    resolveAccountAccessState(
      account,
      currentDate,
    );

  switch (
    accessState
  ) {
    case "ACTIVE":
      return;

    case "NOT_STARTED":
      throw new AuthServiceError(
        "ACCOUNT_ACCESS_NOT_STARTED",
        "El acceso administrativo todavía no ha iniciado.",
        403,
      );

    case "EXPIRED":
      throw new AuthServiceError(
        "ACCOUNT_ACCESS_EXPIRED",
        "El acceso administrativo ha vencido.",
        403,
      );

    case "INVALID":
    default:
      throw new AuthServiceError(
        "ACCOUNT_ACCESS_INVALID",
        "La vigencia de la cuenta no es válida.",
        403,
      );
  }
}

async function handleFailedSignIn(
  account: AccountRepositoryRecord,
  context: AuthRequestContext,
  currentDate: Date,
): Promise<void> {
  const failureState =
    await withSqlTransaction(
      async (transaction) => {
        const currentAccount =
          await findAccountById(
            account.accountId,
            transaction,
          );

        if (!currentAccount) {
          return {
            failedAttempts:
              account.failedSignInAttempts,

            lockedUntil:
              account.lockedUntil,
          };
        }

        const accountAlreadyLocked =
          currentAccount.lockedUntil !== null
          && currentAccount.lockedUntil.getTime()
            > currentDate.getTime();

        const canUpdateLockState =
          currentAccount.status === "ACTIVE"
          && currentAccount.emailVerifiedAt !== null
          && !accountAlreadyLocked;

        const failedAttempts =
          canUpdateLockState
            ? Math.min(
                currentAccount.failedSignInAttempts + 1,
                1_000,
              )
            : currentAccount.failedSignInAttempts;

        const lockedUntil =
          canUpdateLockState
          && failedAttempts
            >= AUTH_ATTEMPT_RULES
              .maximumSignInAttempts
            ? new Date(
                currentDate.getTime()
                + AUTH_ATTEMPT_RULES
                  .accountLockMinutes
                  * 60_000,
              )
            : accountAlreadyLocked
              ? currentAccount.lockedUntil
              : null;

        if (canUpdateLockState) {
          await updateFailedSignInState(
            {
              accountId:
                currentAccount.accountId,

              failedAttempts,
              lockedUntil,

              updatedAt:
                currentDate,
            },
            transaction,
          );
        }

        return {
          failedAttempts,
          lockedUntil,
        };
      },
      {
        isolationLevel:
          "SERIALIZABLE",
      },
    );

  await tryCreateAuthAuditEvent({
    eventId:
      randomUUID(),

    accountId:
      account.accountId,

    eventType:
      account.role === "ADMIN"
        ? AUTH_AUDIT_EVENTS
            .adminSignInFailed
        : AUTH_AUDIT_EVENTS
            .userSignInFailed,

    successful:
      false,

    ipAddress:
      context.ipAddress,

    userAgent:
      context.userAgent,

    metadata: {
      reason:
        "INVALID_CREDENTIALS",

      failedAttempts:
        failureState.failedAttempts,

      locked:
        failureState.lockedUntil !== null,
    },

    createdAt:
      currentDate,
  });
}

async function signInAccount(
  request: SignInRequest,
  expectedRole: AccountRole,
  context: AuthRequestContext,
): Promise<SignInResult> {
  const currentDate =
    new Date();

  const account =
    await findAccountByEmail(
      request.email,
      expectedRole,
    );

  if (!account) {
    // Equilibra el coste con el camino de una cuenta existente para reducir
    // la enumeración de correos mediante diferencias de tiempo.
    await verifyPassword(
      request.password,
      DUMMY_PASSWORD_HASH,
    );

    await tryCreateAuthAuditEvent({
      eventId:
        randomUUID(),

      accountId:
        null,

      eventType:
        expectedRole === "ADMIN"
          ? AUTH_AUDIT_EVENTS
              .adminSignInFailed
          : AUTH_AUDIT_EVENTS
              .userSignInFailed,

      successful:
        false,

      ipAddress:
        context.ipAddress,

      userAgent:
        context.userAgent,

      metadata: {
        reason:
          "ACCOUNT_NOT_FOUND",
      },

      createdAt:
        currentDate,
    });

    throw new AuthServiceError(
      "INVALID_CREDENTIALS",
      "El correo o la contraseña son incorrectos.",
      401,
    );
  }

  const passwordMatches =
    await verifyPassword(
      request.password,
      account.passwordHash,
    );

  if (!passwordMatches) {
    await handleFailedSignIn(
      account,
      context,
      currentDate,
    );

    throw new AuthServiceError(
      "INVALID_CREDENTIALS",
      "El correo o la contraseña son incorrectos.",
      401,
    );
  }

  try {
    const result =
      await withSqlTransaction(
        async (transaction) => {
          const lockedAccount =
            await findAccountById(
              account.accountId,
              transaction,
            );

          if (
            !lockedAccount
            || lockedAccount.passwordHash
              !== account.passwordHash
          ) {
            throw new AuthServiceError(
              "INVALID_CREDENTIALS",
              "El correo o la contraseña son incorrectos.",
              401,
            );
          }

          ensureAccountCanSignIn(
            lockedAccount,
            expectedRole,
            currentDate,
          );

          if (
            needsPasswordRehash(
              lockedAccount.passwordHash,
            )
          ) {
            const replacementHash =
              await hashPassword(
                request.password,
                lockedAccount.role,
              );

            const passwordUpdated =
              await updateAccountPassword(
                lockedAccount.accountId,
                replacementHash,
                currentDate,
                transaction,
              );

            if (!passwordUpdated) {
              throw new Error(
                "No se pudo actualizar el hash de la contraseña.",
              );
            }
          }

          const signInRecorded =
            await recordSuccessfulSignIn(
              lockedAccount.accountId,
              currentDate,
              transaction,
            );

          if (!signInRecorded) {
            throw new AuthServiceError(
              "ACCOUNT_INACTIVE",
              "La cuenta no se encuentra activa.",
              403,
            );
          }

          const createdSession =
            await createAuthSession(
              {
                accountId:
                  lockedAccount.accountId,

                ipAddress:
                  context.ipAddress,

                userAgent:
                  context.userAgent,

                currentDate,
              },
              transaction,
            );

          await createAuthAuditEvent(
            {
              eventId:
                randomUUID(),

              accountId:
                lockedAccount.accountId,

              eventType:
                expectedRole === "ADMIN"
                  ? AUTH_AUDIT_EVENTS
                      .adminSignInSucceeded
                  : AUTH_AUDIT_EVENTS
                      .userSignInSucceeded,

              successful:
                true,

              ipAddress:
                context.ipAddress,

              userAgent:
                context.userAgent,

              createdAt:
                currentDate,
            },
            transaction,
          );

          const refreshedAccount =
            await findAccountById(
              lockedAccount.accountId,
              transaction,
            );

          return {
            account:
              refreshedAccount
              ?? lockedAccount,

            createdSession,
          };
        },
        {
          isolationLevel:
            "SERIALIZABLE",
        },
      );

    return {
      account:
        toAccountPublicRecord(
          result.account,
        ),

      session: {
        expiresAt:
          result.createdSession
            .session
            .expiresAt
            .toISOString(),

        cookieHeader:
          result.createdSession
            .cookieHeader,
      },
    };
  } catch (error) {
    const nestedServiceError =
      findNestedAuthServiceError(
        error,
      );

    if (nestedServiceError) {
      throw nestedServiceError;
    }

    throw error;
  }
}

async function createAvailableUsernameSuggestions(
  requestedUsername: string,
  firstNames?: string,
): Promise<readonly string[]> {
  const generatedCandidates =
    generateUsernameCandidates({
      requestedUsername,
      firstNames,
      maximumCandidates:
        12,
    });

  const availableCandidates:
    string[] = [];

  for (
    const candidate
    of generatedCandidates
  ) {
    const candidateResult =
      await checkUsernameAvailability(
        candidate,
        false,
      );

    if (candidateResult.available) {
      availableCandidates.push(
        candidate,
      );
    }

    if (
      availableCandidates.length
      >= 5
    ) {
      break;
    }
  }

  return availableCandidates;
}

export async function checkUsernameAvailability(
  username: string,
  includeSuggestions = true,
): Promise<UsernameAvailabilityResult> {
  const validation =
    validateUsername(username);

  if (!validation.valid) {
    return {
      username:
        validation.value,

      normalizedUsername:
        validation.normalizedValue,

      available:
        false,

      reason:
        "TAKEN",

      suggestions:
        [],
    };
  }

  const potentialConflicts =
    await findPotentialUsernameConflicts(
      validation.normalizedValue,
      validation.comparisonSkeleton,
    );

  let reason:
    UsernameAvailabilityResult["reason"] =
      null;

  for (
    const conflict
    of potentialConflicts
  ) {
    if (
      conflict.usernameNormalized
      === validation.normalizedValue
    ) {
      reason =
        "TAKEN";

      break;
    }

    if (
      areUsernamesConfusinglySimilar(
        validation.value,
        conflict.username,
      )
    ) {
      reason =
        "TOO_SIMILAR";

      break;
    }
  }

  const available =
    reason === null;

  return {
    username:
      validation.value,

    normalizedUsername:
      validation.normalizedValue,

    available,
    reason,

    suggestions:
      !available
      && includeSuggestions
        ? await createAvailableUsernameSuggestions(
            validation.value,
          )
        : [],
  };
}

export async function registerUser(
  request: UserRegistrationRequest,
  context: AuthRequestContext = {},
): Promise<RegisterUserResult> {
  const existingAccount =
    await findAccountByEmail(
      request.email,
    );

  if (existingAccount) {
    throw new AuthServiceError(
      "EMAIL_ALREADY_IN_USE",
      "Ya existe una cuenta asociada a este correo electrónico.",
      409,
    );
  }

  const usernameAvailability =
    await checkUsernameAvailability(
      request.username,
    );

  if (!usernameAvailability.available) {
    throw new AuthServiceError(
      "USERNAME_UNAVAILABLE",
      "El nombre de usuario solicitado no está disponible.",
      409,
    );
  }

  const accountId =
    randomUUID();

  const passwordHash =
    await hashPassword(
      request.password,
      "USER",
    );

  const usernameNormalized =
    normalizeUsername(
      request.username,
    );

  const usernameSkeleton =
    createUsernameComparisonSkeleton(
      request.username,
    );

  const currentDate =
    new Date();

  let result: {
    code: string;
    expiresAt: Date;
    resendAvailableAt: Date;
  };

  try {
    result =
      await withSqlTransaction(
        async (transaction) => {
          const concurrentEmailAccount =
            await findAccountByEmail(
              request.email,
              undefined,
              transaction,
            );

          if (concurrentEmailAccount) {
            throw new AuthServiceError(
              "EMAIL_ALREADY_IN_USE",
              "Ya existe una cuenta asociada a este correo electrónico.",
              409,
            );
          }

          const concurrentUsernameConflicts =
            await findPotentialUsernameConflicts(
              usernameNormalized,
              usernameSkeleton,
              100,
              transaction,
            );

          if (
            concurrentUsernameConflicts.some(
              (conflict) =>
                conflict.usernameNormalized
                  === usernameNormalized
                || areUsernamesConfusinglySimilar(
                  request.username,
                  conflict.username,
                ),
            )
          ) {
            throw new AuthServiceError(
              "USERNAME_UNAVAILABLE",
              "El nombre de usuario solicitado no está disponible.",
              409,
            );
          }

          await createPendingUserAccount(
            {
              accountId,
              firstNames:
                request.firstNames,
              lastNames:
                request.lastNames,
              username:
                request.username,
              usernameNormalized,
              usernameSkeleton,
              email:
                request.email,
              emailNormalized:
                request.email,
              passwordHash,
              createdAt:
                currentDate,
            },
            transaction,
          );

          const verification =
            await issueVerificationCode(
              accountId,
              "EMAIL_VERIFICATION",
              transaction,
            );

          await createAuthAuditEvent(
            {
              eventId:
                randomUUID(),

              accountId,

              eventType:
                AUTH_AUDIT_EVENTS
                  .userRegistered,

              successful:
                true,

              ipAddress:
                context.ipAddress,

              userAgent:
                context.userAgent,

              createdAt:
                currentDate,
            },
            transaction,
          );

          const template =
            createEmailVerificationTemplate({
              locale:
                request.locale,

              username:
                request.username,

              code:
                verification.code,

              expiresInMinutes:
                Math.max(
                  1,
                  Math.ceil(
                    (
                      verification
                        .expiresAt
                        .getTime()
                      - currentDate
                        .getTime()
                    ) / 60_000,
                  ),
                ),
            });

          await sendEmail({
            to:
              request.email,

            subject:
              template.subject,

            text:
              template.text,

            html:
              template.html,
          });

          return verification;
        },
        {
          isolationLevel:
            "SERIALIZABLE",
        },
      );
  } catch (error) {
    if (
      findNestedEmailDeliveryError(
        error,
      )
    ) {
      throw createEmailDeliveryServiceError(
        request.locale,
      );
    }

    const nestedServiceError =
      findNestedAuthServiceError(
        error,
      );

    if (nestedServiceError) {
      throw nestedServiceError;
    }

    const databaseError =
      toDatabaseError(error);

    if (
      databaseError.details.code
      === "UNIQUE_CONSTRAINT_VIOLATION"
    ) {
      throw new AuthServiceError(
        "DATABASE_CONFLICT",
        "El correo electrónico o el nombre de usuario ya está registrado.",
        409,
      );
    }

    throw databaseError;
  }

  return {
    accountId,

    username:
      request.username,

    email:
      request.email,

    verificationExpiresAt:
      result.expiresAt
        .toISOString(),

    resendAvailableAt:
      result.resendAvailableAt
        .toISOString(),
  };
}

export async function resendVerificationCode(
  accountId: string,
  locale: UserRegistrationRequest["locale"],
): Promise<RegisterUserResult> {
  const normalizedAccountId =
    validateUuid(
      accountId,
      "accountId",
    );

  const account =
    await findAccountById(
      normalizedAccountId,
    );

  if (!account) {
    throw new AuthServiceError(
      "ACCOUNT_NOT_FOUND",
      "La cuenta solicitada no existe.",
      404,
    );
  }

  if (
    account.status
      !== "PENDING_VERIFICATION"
    || account.emailVerifiedAt
  ) {
    throw new AuthServiceError(
      "ACCOUNT_INACTIVE",
      "La cuenta no está pendiente de verificación.",
      409,
    );
  }

  const currentDate =
    new Date();

  let verification: {
    code: string;
    expiresAt: Date;
    resendAvailableAt: Date;
  };

  try {
    verification =
      await withSqlTransaction(
        async (
          transaction,
        ) => {
          const currentCode =
            await findLatestVerificationCode(
              account.accountId,
              "EMAIL_VERIFICATION",
              transaction,
            );

          if (
            currentCode
            && !currentCode.consumed_at
            && currentCode
              .resend_available_at
              .getTime()
              > currentDate.getTime()
          ) {
            throw new AuthServiceError(
              "VERIFICATION_RESEND_TOO_SOON",
              "Debes esperar antes de solicitar otro código.",
              429,
              getVerificationCodeRemainingSeconds(
                currentCode.resend_available_at,
                currentDate,
              ),
            );
          }

          const issuedVerification =
            await issueVerificationCode(
              account.accountId,
              "EMAIL_VERIFICATION",
              transaction,
            );

          const template =
            createEmailVerificationTemplate({
              locale,

              username:
                account.username,

              code:
                issuedVerification.code,

              expiresInMinutes:
                Math.max(
                  1,
                  Math.ceil(
                    (
                      issuedVerification
                        .expiresAt
                        .getTime()
                      - currentDate
                        .getTime()
                    ) / 60_000,
                  ),
                ),
            });

          await sendEmail({
            to:
              account.email,

            subject:
              template.subject,

            text:
              template.text,

            html:
              template.html,
          });

          return issuedVerification;
        },
        {
          isolationLevel:
            "SERIALIZABLE",
        },
      );
  } catch (error) {
    const nestedServiceError =
      findNestedAuthServiceError(
        error,
      );

    if (nestedServiceError) {
      throw nestedServiceError;
    }

    if (
      findNestedEmailDeliveryError(
        error,
      )
    ) {
      throw createEmailDeliveryServiceError(
        locale,
      );
    }

    throw toDatabaseError(error);
  }

  return {
    accountId:
      account.accountId,

    username:
      account.username,

    email:
      account.email,

    verificationExpiresAt:
      verification.expiresAt
        .toISOString(),

    resendAvailableAt:
      verification
        .resendAvailableAt
        .toISOString(),
  };
}

export async function verifyUserEmail(
  request: EmailVerificationRequest,
  context: AuthRequestContext = {},
): Promise<VerifyEmailResult> {
  const currentDate =
    new Date();

  try {
    const result =
      await withSqlTransaction(
        async (
          transaction,
        ) => {
          const account =
            await findAccountById(
              request.accountId,
              transaction,
            );

          if (!account) {
            return {
              ok: false as const,

              error:
                new AuthServiceError(
                  "ACCOUNT_NOT_FOUND",
                  "La cuenta solicitada no existe.",
                  404,
                ),
            };
          }

          if (
            account.emailVerifiedAt
            && account.status === "ACTIVE"
          ) {
            return {
              ok: true as const,
              account,
            };
          }

          const verification =
            await findLatestVerificationCode(
              account.accountId,
              "EMAIL_VERIFICATION",
              transaction,
            );

          if (
            !verification
            || verification.consumed_at
          ) {
            return {
              ok: false as const,

              error:
                new AuthServiceError(
                  "INVALID_VERIFICATION_CODE",
                  "El código de verificación no es válido.",
                  400,
                ),
            };
          }

          if (
            verification.expires_at
              .getTime()
              <= currentDate.getTime()
          ) {
            return {
              ok: false as const,

              error:
                new AuthServiceError(
                  "VERIFICATION_CODE_EXPIRED",
                  "El código de verificación ha vencido.",
                  400,
                ),
            };
          }

          if (
            verification.attempts_used
              >= verification.maximum_attempts
          ) {
            return {
              ok: false as const,

              error:
                new AuthServiceError(
                  "VERIFICATION_ATTEMPTS_EXCEEDED",
                  "Se agotaron los intentos permitidos para este código.",
                  429,
                ),
            };
          }

          if (
            !verifyVerificationCodeHash(
              request.code,
              verification.code_hash,
            )
          ) {
            await registerFailedCodeAttempt(
              verification.verification_id,
              currentDate,
              transaction,
            );

            return {
              ok: false as const,

              error:
                new AuthServiceError(
                  "INVALID_VERIFICATION_CODE",
                  "El código de verificación no es válido.",
                  400,
                ),
            };
          }

          const consumed =
            await consumeVerificationCode(
              verification.verification_id,
              currentDate,
              transaction,
            );

          if (!consumed) {
            return {
              ok: false as const,

              error:
                new AuthServiceError(
                  "INVALID_VERIFICATION_CODE",
                  "El código de verificación no es válido.",
                  400,
                ),
            };
          }

          const updatedAccount =
            await markAccountEmailAsVerified(
              account.accountId,
              currentDate,
              transaction,
            );

          if (!updatedAccount) {
            throw new Error(
              "No se pudo activar la cuenta.",
            );
          }

          const notification =
            AUTH_NOTIFICATION_KEYS
              .userAccountCreated;

          await createNotification(
            {
              notificationId:
                randomUUID(),

              accountId:
                updatedAccount.accountId,

              type:
                notification.type,

              titleKey:
                notification.title,

              messageKey:
                notification.message,

              createdAt:
                currentDate,
            },
            transaction,
          );

          await createAuthAuditEvent(
            {
              eventId:
                randomUUID(),

              accountId:
                updatedAccount.accountId,

              eventType:
                AUTH_AUDIT_EVENTS
                  .emailVerified,

              successful:
                true,

              ipAddress:
                context.ipAddress,

              userAgent:
                context.userAgent,

              createdAt:
                currentDate,
            },
            transaction,
          );

          return {
            ok: true as const,
            account: updatedAccount,
          };
        },
        {
          isolationLevel:
            "SERIALIZABLE",
        },
      );

    if (!result.ok) {
      throw result.error;
    }

    return {
      account:
        toAccountPublicRecord(
          result.account,
        ),
    };
  } catch (error) {
    const nestedServiceError =
      findNestedAuthServiceError(
        error,
      );

    if (nestedServiceError) {
      throw nestedServiceError;
    }

    throw toDatabaseError(error);
  }
}

export async function signInUser(
  request: SignInRequest,
  context: AuthRequestContext = {},
): Promise<SignInResult> {
  return signInAccount(
    request,
    "USER",
    context,
  );
}

export async function signInAdmin(
  request: SignInRequest,
  context: AuthRequestContext = {},
): Promise<SignInResult> {
  return signInAccount(
    request,
    "ADMIN",
    context,
  );
}

export async function requestPasswordReset(
  request: PasswordResetRequest,
  context: AuthRequestContext = {},
): Promise<PasswordResetRequestResult> {
  const currentDate =
    new Date();

  const publicResult =
    createPublicPasswordResetTiming(
      currentDate,
    );

  const account =
    await findAccountByEmail(
      request.email,
      request.accountRole,
    );

  if (
    !account
    || account.role
      !== request.accountRole
    || account.status
      !== "ACTIVE"
    || !account.emailVerifiedAt
  ) {
    return publicResult;
  }

  if (
    resolveAccountAccessState(
      account,
      currentDate,
    ) !== "ACTIVE"
  ) {
    return publicResult;
  }

  try {
    await withSqlTransaction(
      async (
        transaction,
      ) => {
        const currentCode =
          await findLatestVerificationCode(
            account.accountId,
            "PASSWORD_RESET",
            transaction,
          );

        if (
          currentCode
          && !currentCode.consumed_at
          && currentCode
            .resend_available_at
            .getTime()
            > currentDate.getTime()
        ) {
          return;
        }

        const verification =
          await issueVerificationCode(
            account.accountId,
            "PASSWORD_RESET",
            transaction,
          );

        const template =
          createPasswordResetTemplate({
            locale:
              request.locale,

            username:
              account.username,

            code:
              verification.code,

            expiresInMinutes:
              Math.max(
                1,
                Math.ceil(
                  (
                    verification
                      .expiresAt
                      .getTime()
                    - currentDate
                      .getTime()
                  ) / 60_000,
                ),
              ),
          });

        await sendEmail({
          to:
            account.email,

          subject:
            template.subject,

          text:
            template.text,

          html:
            template.html,
        });

        await createAuthAuditEvent(
          {
            eventId:
              randomUUID(),

            accountId:
              account.accountId,

            eventType:
              AUTH_AUDIT_EVENTS
                .passwordResetRequested,

            successful:
              true,

            ipAddress:
              context.ipAddress,

            userAgent:
              context.userAgent,

            createdAt:
              currentDate,
          },
          transaction,
        );
      },
      {
        isolationLevel:
          "SERIALIZABLE",
      },
    );
  } catch (error) {
    if (
      findNestedEmailDeliveryError(
        error,
      )
    ) {
      await tryCreateAuthAuditEvent({
        eventId:
          randomUUID(),

        accountId:
          account.accountId,

        eventType:
          AUTH_AUDIT_EVENTS
            .passwordResetRequested,

        successful:
          false,

        ipAddress:
          context.ipAddress,

        userAgent:
          context.userAgent,

        metadata: {
          reason:
            "EMAIL_DELIVERY_FAILED",
        },

        createdAt:
          currentDate,
      });

      return publicResult;
    }

    const nestedServiceError =
      findNestedAuthServiceError(
        error,
      );

    if (nestedServiceError) {
      throw nestedServiceError;
    }

    throw toDatabaseError(error);
  }

  return publicResult;
}

export async function verifyPasswordResetCode(
  request: PasswordResetCodeVerificationRequest,
): Promise<PasswordResetCodeResult> {
  const currentDate =
    new Date();

  try {
    const result =
      await withSqlTransaction(
        async (
          transaction,
        ) => {
          const account =
            await findAccountByEmail(
              request.email,
              request.accountRole,
              transaction,
            );

          if (
            !account
            || account.role !== request.accountRole
            || account.status !== "ACTIVE"
            || !account.emailVerifiedAt
            || resolveAccountAccessState(
              account,
              currentDate,
            ) !== "ACTIVE"
          ) {
            return {
              ok: false as const,

              error:
                new AuthServiceError(
                  "INVALID_VERIFICATION_CODE",
                  "El código de verificación no es válido.",
                  400,
                ),
            };
          }

          const verification =
            await findLatestVerificationCode(
              account.accountId,
              "PASSWORD_RESET",
              transaction,
            );

          if (
            !verification
            || verification.consumed_at
          ) {
            return {
              ok: false as const,

              error:
                new AuthServiceError(
                  "INVALID_VERIFICATION_CODE",
                  "El código de verificación no es válido.",
                  400,
                ),
            };
          }

          if (
            verification.expires_at
              .getTime()
              <= currentDate.getTime()
          ) {
            return {
              ok: false as const,

              error:
                new AuthServiceError(
                  "VERIFICATION_CODE_EXPIRED",
                  "El código de verificación ha vencido.",
                  400,
                ),
            };
          }

          if (
            verification.attempts_used
              >= verification.maximum_attempts
          ) {
            return {
              ok: false as const,

              error:
                new AuthServiceError(
                  "VERIFICATION_ATTEMPTS_EXCEEDED",
                  "Se agotaron los intentos permitidos para este código.",
                  429,
                ),
            };
          }

          if (
            !verifyVerificationCodeHash(
              request.code,
              verification.code_hash,
            )
          ) {
            await registerFailedCodeAttempt(
              verification.verification_id,
              currentDate,
              transaction,
            );

            return {
              ok: false as const,

              error:
                new AuthServiceError(
                  "INVALID_VERIFICATION_CODE",
                  "El código de verificación no es válido.",
                  400,
                ),
            };
          }

          const consumed =
            await consumeVerificationCode(
              verification.verification_id,
              currentDate,
              transaction,
            );

          if (!consumed) {
            return {
              ok: false as const,

              error:
                new AuthServiceError(
                  "INVALID_VERIFICATION_CODE",
                  "El código de verificación no es válido.",
                  400,
                ),
            };
          }

          return {
            ok: true as const,

            token:
              createPasswordResetToken(
                account,
                currentDate,
              ),
          };
        },
        {
          isolationLevel:
            "SERIALIZABLE",
        },
      );

    if (!result.ok) {
      throw result.error;
    }

    return result.token;
  } catch (error) {
    const nestedServiceError =
      findNestedAuthServiceError(
        error,
      );

    if (nestedServiceError) {
      throw nestedServiceError;
    }

    throw toDatabaseError(error);
  }
}

export async function resetPassword(
  request: PasswordChangeRequest,
  context: AuthRequestContext = {},
): Promise<PasswordResetResult> {
  const currentDate =
    new Date();

  const payload =
    parsePasswordResetToken(
      request.resetToken,
      currentDate,
    );

  const account =
    await findAccountById(
      payload.accountId,
    );

  if (
    !account
    || account.role !== payload.accountRole
    || account.updatedAt.getTime()
      !== payload.passwordVersion
    || account.status !== "ACTIVE"
    || !account.emailVerifiedAt
    || resolveAccountAccessState(
      account,
      currentDate,
    ) !== "ACTIVE"
  ) {
    throw new AuthServiceError(
      "PASSWORD_RESET_TOKEN_INVALID",
      "El token de recuperación no es válido.",
      400,
    );
  }

  const passwordHash =
    await hashPassword(
      request.password,
      account.role,
    );

  try {
    const accountId =
      await withSqlTransaction(
        async (
          transaction,
        ) => {
          const lockedAccount =
            await findAccountById(
              payload.accountId,
              transaction,
            );

          if (
            !lockedAccount
            || lockedAccount.role !== payload.accountRole
            || lockedAccount.updatedAt.getTime()
              !== payload.passwordVersion
            || lockedAccount.status !== "ACTIVE"
            || !lockedAccount.emailVerifiedAt
            || resolveAccountAccessState(
              lockedAccount,
              currentDate,
            ) !== "ACTIVE"
          ) {
            throw new AuthServiceError(
              "PASSWORD_RESET_TOKEN_INVALID",
              "El token de recuperación ya fue utilizado o dejó de ser válido.",
              400,
            );
          }

          const updated =
            await updateAccountPassword(
              lockedAccount.accountId,
              passwordHash,
              currentDate,
              transaction,
            );

          if (!updated) {
            throw new Error(
              "No se pudo actualizar la contraseña.",
            );
          }

          await revokeAllAccountSessions(
            lockedAccount.accountId,
            "PASSWORD_RESET",
            currentDate,
            transaction,
          );

          const notification =
            AUTH_NOTIFICATION_KEYS
              .passwordChanged;

          await createNotification(
            {
              notificationId:
                randomUUID(),

              accountId:
                lockedAccount.accountId,

              type:
                notification.type,

              titleKey:
                notification.title,

              messageKey:
                notification.message,

              createdAt:
                currentDate,
            },
            transaction,
          );

          await createAuthAuditEvent(
            {
              eventId:
                randomUUID(),

              accountId:
                lockedAccount.accountId,

              eventType:
                AUTH_AUDIT_EVENTS
                  .passwordResetCompleted,

              successful:
                true,

              ipAddress:
                context.ipAddress,

              userAgent:
                context.userAgent,

              createdAt:
                currentDate,
            },
            transaction,
          );

          return lockedAccount.accountId;
        },
        {
          isolationLevel:
            "SERIALIZABLE",
        },
      );

    return {
      accountId,
    };
  } catch (error) {
    const nestedServiceError =
      findNestedAuthServiceError(
        error,
      );

    if (nestedServiceError) {
      throw nestedServiceError;
    }

    throw toDatabaseError(error);
  }
}

export function isAuthServiceError(
  error: unknown,
): error is AuthServiceError {
  return (
    error
    instanceof AuthServiceError
  );
}