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
      .AUTH_PASSWORD_RESET_TOKEN_SECRET
      ?.trim()
    || process.env
      .AUTH_SESSION_PEPPER
      ?.trim();

  if (
    !secret
    || secret.length < 32
  ) {
    throw new Error(
      "AUTH_PASSWORD_RESET_TOKEN_SECRET o AUTH_SESSION_PEPPER debe tener al menos 32 caracteres.",
    );
  }

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
): ResetTokenPayload {
  const parts =
    token.split(".");

  if (parts.length !== 2) {
    throw new AuthServiceError(
      "PASSWORD_RESET_TOKEN_INVALID",
      "El token de recuperación no es válido.",
      400,
    );
  }

  const [
    encodedPayload,
    providedSignature,
  ] = parts;

  if (
    !encodedPayload
    || !providedSignature
  ) {
    throw new AuthServiceError(
      "PASSWORD_RESET_TOKEN_INVALID",
      "El token de recuperación no es válido.",
      400,
    );
  }

  const expectedSignature =
    createResetTokenSignature(
      encodedPayload,
    );

  const providedBuffer =
    Buffer.from(
      providedSignature,
      "utf8",
    );

  const expectedBuffer =
    Buffer.from(
      expectedSignature,
      "utf8",
    );

  if (
    providedBuffer.length
      !== expectedBuffer.length
    || !timingSafeEqual(
      providedBuffer,
      expectedBuffer,
    )
  ) {
    throw new AuthServiceError(
      "PASSWORD_RESET_TOKEN_INVALID",
      "El token de recuperación no es válido.",
      400,
    );
  }

  let parsedPayload:
    unknown;

  try {
    parsedPayload =
      JSON.parse(
        Buffer.from(
          encodedPayload,
          "base64url",
        ).toString(
          "utf8",
        ),
      ) as unknown;
  } catch {
    throw new AuthServiceError(
      "PASSWORD_RESET_TOKEN_INVALID",
      "El token de recuperación no es válido.",
      400,
    );
  }

  if (!isResetTokenPayload(parsedPayload)) {
    throw new AuthServiceError(
      "PASSWORD_RESET_TOKEN_INVALID",
      "El token de recuperación no es válido.",
      400,
    );
  }

  validateUuid(
    parsedPayload.accountId,
    "accountId",
  );

  if (
    !Number.isSafeInteger(
      parsedPayload.passwordVersion,
    )
    || !Number.isSafeInteger(
      parsedPayload.issuedAt,
    )
    || !Number.isSafeInteger(
      parsedPayload.expiresAt,
    )
    || parsedPayload.expiresAt
      <= parsedPayload.issuedAt
  ) {
    throw new AuthServiceError(
      "PASSWORD_RESET_TOKEN_INVALID",
      "El token de recuperación no es válido.",
      400,
    );
  }

  if (
    parsedPayload.expiresAt
      <= Date.now()
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
      FROM dbo.auth_verification_codes
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
  transaction?: Transaction,
): Promise<void> {
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

  await request.query(`
    UPDATE dbo.auth_verification_codes
    SET attempts_used =
      attempts_used + 1
    WHERE
      verification_id = @verificationId
      AND consumed_at IS NULL;
  `);
}

async function consumeVerificationCode(
  verificationId: string,
  consumedAt: Date,
  transaction?: Transaction,
): Promise<void> {
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

  await request.query(`
    UPDATE dbo.auth_verification_codes
    SET consumed_at = @consumedAt
    WHERE
      verification_id = @verificationId
      AND consumed_at IS NULL;
  `);
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
  const accountAlreadyLocked =
    account.lockedUntil !== null
    && account.lockedUntil.getTime()
      > currentDate.getTime();

  const canUpdateLockState =
    account.status === "ACTIVE"
    && account.emailVerifiedAt !== null
    && !accountAlreadyLocked;

  const failedAttempts =
    canUpdateLockState
      ? account.failedSignInAttempts + 1
      : account.failedSignInAttempts;

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
        ? account.lockedUntil
        : null;

  if (canUpdateLockState) {
    await updateFailedSignInState({
      accountId:
        account.accountId,

      failedAttempts,
      lockedUntil,

      updatedAt:
        currentDate,
    });
  }

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

      failedAttempts,

      locked:
        lockedUntil !== null,
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

  ensureAccountCanSignIn(
    account,
    expectedRole,
    currentDate,
  );

  if (
    needsPasswordRehash(
      account.passwordHash,
    )
  ) {
    const replacementHash =
      await hashPassword(
        request.password,
        account.role,
      );

    await updateAccountPassword(
      account.accountId,
      replacementHash,
      currentDate,
    );
  }

  await recordSuccessfulSignIn(
    account.accountId,
    currentDate,
  );

  const createdSession =
    await createAuthSession({
      accountId:
        account.accountId,

      ipAddress:
        context.ipAddress,

      userAgent:
        context.userAgent,

      currentDate,
    });

  await tryCreateAuthAuditEvent({
    eventId:
      randomUUID(),

    accountId:
      account.accountId,

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
  });

  const refreshedAccount =
    await findAccountById(
      account.accountId,
    );

  return {
    account:
      toAccountPublicRecord(
        refreshedAccount
        ?? account,
      ),

    session: {
      expiresAt:
        createdSession
          .session
          .expiresAt
          .toISOString(),

      cookieHeader:
        createdSession.cookieHeader,
    },
  };
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
      "El nombre de pila solicitado no está disponible.",
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
        async (
          transaction,
        ) => {
          const accountRequest =
            await createAuthRequest(
              transaction,
            );

          accountRequest.input(
            "accountId",
            UniqueIdentifier,
            accountId,
          );

          accountRequest.input(
            "firstNames",
            VarChar(100),
            request.firstNames,
          );

          accountRequest.input(
            "lastNames",
            VarChar(150),
            request.lastNames,
          );

          accountRequest.input(
            "username",
            VarChar(40),
            request.username,
          );

          accountRequest.input(
            "usernameNormalized",
            VarChar(40),
            normalizeUsername(
              request.username,
            ),
          );

          accountRequest.input(
            "usernameSkeleton",
            VarChar(40),
            usernameSkeleton,
          );

          accountRequest.input(
            "email",
            VarChar(320),
            request.email,
          );

          accountRequest.input(
            "passwordHash",
            VarChar(512),
            passwordHash,
          );

          accountRequest.input(
            "createdAt",
            DateTime2,
            currentDate,
          );

          await accountRequest.query(`
            INSERT INTO dbo.accounts (
              account_id,
              role,
              status,
              first_names,
              last_names,
              username,
              username_normalized,
              username_skeleton,
              email,
              email_normalized,
              password_hash,
              email_verified_at,
              failed_sign_in_attempts,
              locked_until,
              created_at,
              updated_at,
              last_sign_in_at
            )
            VALUES (
              @accountId,
              'USER',
              'PENDING_VERIFICATION',
              @firstNames,
              @lastNames,
              @username,
              @usernameNormalized,
              @usernameSkeleton,
              @email,
              LOWER(@email),
              @passwordHash,
              NULL,
              0,
              NULL,
              @createdAt,
              @createdAt,
              NULL
            );
          `);

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
        "El correo electrónico o el nombre de pila ya está registrado.",
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
  const account =
    await findAccountById(
      request.accountId,
    );

  if (!account) {
    throw new AuthServiceError(
      "ACCOUNT_NOT_FOUND",
      "La cuenta solicitada no existe.",
      404,
    );
  }

  if (
    account.emailVerifiedAt
    && account.status === "ACTIVE"
  ) {
    return {
      account:
        toAccountPublicRecord(
          account,
        ),
    };
  }

  const currentDate =
    new Date();

  const verification =
    await findLatestVerificationCode(
      account.accountId,
      "EMAIL_VERIFICATION",
    );

  if (
    !verification
    || verification.consumed_at
  ) {
    throw new AuthServiceError(
      "INVALID_VERIFICATION_CODE",
      "El código de verificación no es válido.",
      400,
    );
  }

  if (
    verification.expires_at
      .getTime()
      <= currentDate.getTime()
  ) {
    throw new AuthServiceError(
      "VERIFICATION_CODE_EXPIRED",
      "El código de verificación ha vencido.",
      400,
    );
  }

  if (
    verification.attempts_used
      >= verification.maximum_attempts
  ) {
    throw new AuthServiceError(
      "VERIFICATION_ATTEMPTS_EXCEEDED",
      "Se agotaron los intentos permitidos para este código.",
      429,
    );
  }

  const codeMatches =
    verifyVerificationCodeHash(
      request.code,
      verification.code_hash,
    );

  if (!codeMatches) {
    await registerFailedCodeAttempt(
      verification.verification_id,
    );

    throw new AuthServiceError(
      "INVALID_VERIFICATION_CODE",
      "El código de verificación no es válido.",
      400,
    );
  }

  const verifiedAccount =
    await withSqlTransaction(
      async (
        transaction,
      ) => {
        await consumeVerificationCode(
          verification.verification_id,
          currentDate,
          transaction,
        );

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

        return updatedAccount;
      },
      {
        isolationLevel:
          "SERIALIZABLE",
      },
    );

  return {
    account:
      toAccountPublicRecord(
        verifiedAccount,
      ),
  };
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
  const account =
    await findAccountByEmail(
      request.email,
      request.accountRole,
    );

  if (!account) {
    throw new AuthServiceError(
      "INVALID_VERIFICATION_CODE",
      "El código de verificación no es válido.",
      400,
    );
  }

  const verification =
    await findLatestVerificationCode(
      account.accountId,
      "PASSWORD_RESET",
    );

  const currentDate =
    new Date();

  if (
    !verification
    || verification.consumed_at
  ) {
    throw new AuthServiceError(
      "INVALID_VERIFICATION_CODE",
      "El código de verificación no es válido.",
      400,
    );
  }

  if (
    verification.expires_at
      .getTime()
      <= currentDate.getTime()
  ) {
    throw new AuthServiceError(
      "VERIFICATION_CODE_EXPIRED",
      "El código de verificación ha vencido.",
      400,
    );
  }

  if (
    verification.attempts_used
      >= verification.maximum_attempts
  ) {
    throw new AuthServiceError(
      "VERIFICATION_ATTEMPTS_EXCEEDED",
      "Se agotaron los intentos permitidos para este código.",
      429,
    );
  }

  if (
    !verifyVerificationCodeHash(
      request.code,
      verification.code_hash,
    )
  ) {
    await registerFailedCodeAttempt(
      verification.verification_id,
    );

    throw new AuthServiceError(
      "INVALID_VERIFICATION_CODE",
      "El código de verificación no es válido.",
      400,
    );
  }

  await consumeVerificationCode(
    verification.verification_id,
    currentDate,
  );

  return createPasswordResetToken(
    account,
    currentDate,
  );
}

export async function resetPassword(
  request: PasswordChangeRequest,
  context: AuthRequestContext = {},
): Promise<PasswordResetResult> {
  const payload =
    parsePasswordResetToken(
      request.resetToken,
    );

  const account =
    await findAccountById(
      payload.accountId,
    );

  if (!account) {
    throw new AuthServiceError(
      "PASSWORD_RESET_TOKEN_INVALID",
      "El token de recuperación no es válido.",
      400,
    );
  }

  if (
    account.role
      !== payload.accountRole
  ) {
    throw new AuthServiceError(
      "ROLE_MISMATCH",
      "El token no corresponde al tipo de cuenta solicitado.",
      400,
    );
  }

  if (
    account.updatedAt.getTime()
      !== payload.passwordVersion
  ) {
    throw new AuthServiceError(
      "PASSWORD_RESET_TOKEN_INVALID",
      "El token de recuperación ya fue utilizado o dejó de ser válido.",
      400,
    );
  }

  const currentDate =
    new Date();

  const passwordHash =
    await hashPassword(
      request.password,
      account.role,
    );

  await withSqlTransaction(
    async (
      transaction,
    ) => {
      const updated =
        await updateAccountPassword(
          account.accountId,
          passwordHash,
          currentDate,
          transaction,
        );

      if (!updated) {
        throw new Error(
          "No se pudo actualizar la contraseña.",
        );
      }

      const notification =
        AUTH_NOTIFICATION_KEYS
          .passwordChanged;

      await createNotification(
        {
          notificationId:
            randomUUID(),

          accountId:
            account.accountId,

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
            account.accountId,

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
    },
    {
      isolationLevel:
        "SERIALIZABLE",
    },
  );

  await revokeAllAccountSessions(
    account.accountId,
    "PASSWORD_RESET",
    currentDate,
  );

  return {
    accountId:
      account.accountId,
  };
}

export function isAuthServiceError(
  error: unknown,
): error is AuthServiceError {
  return (
    error
    instanceof AuthServiceError
  );
}