import "server-only";

import {
  DateTime2,
  Int,
  NVarChar,
  VarChar,
} from "mssql";

import {
  AUTH_RATE_LIMIT_ACTIONS,
} from "@/config/auth.config";

import {
  executeSqlQuery,
  executeSqlSingle,
} from "@/lib/database";

import {
  createSecretHash,
} from "@/lib/security/secure-random";

export type AuthRateLimitAction =
  (typeof AUTH_RATE_LIMIT_ACTIONS)[
    keyof typeof AUTH_RATE_LIMIT_ACTIONS
  ];

export type AuthRateLimitPolicy = {
  maximumAttempts: number;
  windowSeconds: number;
  blockSeconds: number;
};

export type ConsumeRateLimitInput = {
  action: AuthRateLimitAction;
  identifier: string;
  policy: AuthRateLimitPolicy;
  currentDate?: Date;
};

export type RateLimitResult = {
  allowed: boolean;
  blocked: boolean;

  attemptsUsed: number;
  attemptsRemaining: number;

  retryAfterSeconds: number;

  windowStartedAt: Date;
  windowEndsAt: Date;
  blockedUntil: Date | null;
};

type RateLimitDatabaseRecord = {
  attempt_count: number;
  window_started_at: Date;
  blocked_until: Date | null;
};

const MAXIMUM_RATE_LIMIT_DURATION_SECONDS = 86_400 * 30;
const MAXIMUM_RATE_LIMIT_ATTEMPTS = 1_000;
const MAXIMUM_IDENTIFIER_LENGTH = 512;
const MAXIMUM_PEPPER_LENGTH = 1_024;

const AUTH_RATE_LIMIT_ACTION_VALUES = new Set<AuthRateLimitAction>(
  Object.values(AUTH_RATE_LIMIT_ACTIONS),
);

const AUTH_RATE_LIMIT_POLICIES: Readonly<
  Record<AuthRateLimitAction, Readonly<AuthRateLimitPolicy>>
> = Object.freeze({
  USER_REGISTRATION: Object.freeze({
    maximumAttempts: 5,
    windowSeconds: 60 * 60,
    blockSeconds: 60 * 60,
  }),

  USER_SIGN_IN: Object.freeze({
    maximumAttempts: 5,
    windowSeconds: 15 * 60,
    blockSeconds: 15 * 60,
  }),

  ADMIN_SIGN_IN: Object.freeze({
    maximumAttempts: 5,
    windowSeconds: 15 * 60,
    blockSeconds: 30 * 60,
  }),

  EMAIL_VERIFICATION: Object.freeze({
    maximumAttempts: 5,
    windowSeconds: 15 * 60,
    blockSeconds: 15 * 60,
  }),

  VERIFICATION_RESEND: Object.freeze({
    maximumAttempts: 3,
    windowSeconds: 15 * 60,
    blockSeconds: 15 * 60,
  }),

  PASSWORD_RESET_REQUEST: Object.freeze({
    maximumAttempts: 5,
    windowSeconds: 60 * 60,
    blockSeconds: 60 * 60,
  }),

  PASSWORD_RESET_VERIFICATION: Object.freeze({
    maximumAttempts: 5,
    windowSeconds: 15 * 60,
    blockSeconds: 15 * 60,
  }),

  PASSWORD_RESET_COMPLETION: Object.freeze({
    maximumAttempts: 5,
    windowSeconds: 15 * 60,
    blockSeconds: 30 * 60,
  }),

  USERNAME_AVAILABILITY: Object.freeze({
    maximumAttempts: 60,
    windowSeconds: 60,
    blockSeconds: 60,
  }),
});

function containsForbiddenControlCharacters(value: string): boolean {
  return /[\r\n\0]/u.test(value);
}

function validateRateLimitAction(
  action: AuthRateLimitAction,
): AuthRateLimitAction {
  if (!AUTH_RATE_LIMIT_ACTION_VALUES.has(action)) {
    throw new Error("La acción del límite de intentos no es válida.");
  }

  return action;
}

function getRateLimitPepper(): string {
  const pepper = process.env.AUTH_RATE_LIMIT_PEPPER;

  if (
    typeof pepper !== "string"
    || pepper.trim().length < 32
    || pepper.length > MAXIMUM_PEPPER_LENGTH
    || containsForbiddenControlCharacters(pepper)
  ) {
    throw new Error(
      "AUTH_RATE_LIMIT_PEPPER debe contener un secreto válido de al menos 32 caracteres.",
    );
  }

  // El pepper se conserva exactamente como fue configurado.
  return pepper;
}

function validateRateLimitPolicy(
  policy: AuthRateLimitPolicy,
): AuthRateLimitPolicy {
  if (!policy || typeof policy !== "object") {
    throw new Error("La política del límite de intentos no es válida.");
  }

  if (
    !Number.isSafeInteger(policy.maximumAttempts)
    || policy.maximumAttempts < 1
    || policy.maximumAttempts > MAXIMUM_RATE_LIMIT_ATTEMPTS
    || !Number.isSafeInteger(policy.windowSeconds)
    || policy.windowSeconds < 1
    || policy.windowSeconds > MAXIMUM_RATE_LIMIT_DURATION_SECONDS
    || !Number.isSafeInteger(policy.blockSeconds)
    || policy.blockSeconds < 1
    || policy.blockSeconds > MAXIMUM_RATE_LIMIT_DURATION_SECONDS
  ) {
    throw new Error("La política del límite de intentos no es válida.");
  }

  return policy;
}

function normalizeIdentifier(identifier: string): string {
  if (typeof identifier !== "string") {
    throw new Error("El identificador del límite de intentos no es válido.");
  }

  const normalizedIdentifier = identifier
    .trim()
    .normalize("NFC")
    .toLowerCase();

  if (
    normalizedIdentifier.length === 0
    || normalizedIdentifier.length > MAXIMUM_IDENTIFIER_LENGTH
    || containsForbiddenControlCharacters(normalizedIdentifier)
  ) {
    throw new Error("El identificador del límite de intentos no es válido.");
  }

  return normalizedIdentifier;
}

function hashRateLimitIdentifier(
  action: AuthRateLimitAction,
  identifier: string,
): string {
  return createSecretHash(
    `${validateRateLimitAction(action)}:${normalizeIdentifier(identifier)}`,
    getRateLimitPepper(),
  );
}

function validateCurrentDate(currentDate: Date): Date {
  const normalizedDate = new Date(currentDate);

  if (Number.isNaN(normalizedDate.getTime())) {
    throw new Error("La fecha del límite de intentos no es válida.");
  }

  return normalizedDate;
}

function calculateRetryAfterSeconds(
  targetDate: Date,
  currentDate: Date,
): number {
  return Math.max(
    0,
    Math.ceil((targetDate.getTime() - currentDate.getTime()) / 1_000),
  );
}

function validateDatabaseRecord(
  record: RateLimitDatabaseRecord,
): RateLimitDatabaseRecord {
  const windowStartedAt = new Date(record.window_started_at);
  const blockedUntil = record.blocked_until === null
    ? null
    : new Date(record.blocked_until);

  if (
    !Number.isSafeInteger(record.attempt_count)
    || record.attempt_count < 0
    || Number.isNaN(windowStartedAt.getTime())
    || (blockedUntil !== null && Number.isNaN(blockedUntil.getTime()))
  ) {
    throw new Error(
      "SQL Server devolvió un registro de límite de intentos no válido.",
    );
  }

  return {
    attempt_count: record.attempt_count,
    window_started_at: windowStartedAt,
    blocked_until: blockedUntil,
  };
}

function mapRateLimitResult(
  rawRecord: RateLimitDatabaseRecord,
  policy: AuthRateLimitPolicy,
  currentDate: Date,
): RateLimitResult {
  const record = validateDatabaseRecord(rawRecord);
  const windowStartedAt = record.window_started_at;
  const windowEndsAt = new Date(
    windowStartedAt.getTime() + policy.windowSeconds * 1_000,
  );
  const blockedUntil = record.blocked_until;
  const blocked = blockedUntil !== null
    && blockedUntil.getTime() > currentDate.getTime();

  return {
    allowed: !blocked,
    blocked,
    attemptsUsed: record.attempt_count,
    attemptsRemaining: Math.max(
      0,
      policy.maximumAttempts - record.attempt_count,
    ),
    retryAfterSeconds: blocked && blockedUntil
      ? calculateRetryAfterSeconds(blockedUntil, currentDate)
      : 0,
    windowStartedAt,
    windowEndsAt,
    blockedUntil,
  };
}

export function getAuthRateLimitPolicy(
  action: AuthRateLimitAction,
): AuthRateLimitPolicy {
  const validatedAction = validateRateLimitAction(action);
  const policy = AUTH_RATE_LIMIT_POLICIES[validatedAction];

  return {
    maximumAttempts: policy.maximumAttempts,
    windowSeconds: policy.windowSeconds,
    blockSeconds: policy.blockSeconds,
  };
}

export async function consumeAuthRateLimitAttempt(
  input: ConsumeRateLimitInput,
): Promise<RateLimitResult> {
  if (!input || typeof input !== "object") {
    throw new Error("La solicitud del límite de intentos no es válida.");
  }

  const action = validateRateLimitAction(input.action);
  const policy = validateRateLimitPolicy(input.policy);
  const currentDate = validateCurrentDate(input.currentDate ?? new Date());
  const identifierHash = hashRateLimitIdentifier(action, input.identifier);
  const blockUntil = new Date(
    currentDate.getTime() + policy.blockSeconds * 1_000,
  );

  const result = await executeSqlSingle<RateLimitDatabaseRecord>(
    `
      SET XACT_ABORT ON;
      SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

      BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE
          @attemptCount INT,
          @windowStartedAt DATETIME2(7),
          @existingBlockedUntil DATETIME2(7);

        SELECT
          @attemptCount = attempt_count,
          @windowStartedAt = window_started_at,
          @existingBlockedUntil = blocked_until
        FROM dbo.auth_rate_limits
        WITH (UPDLOCK, HOLDLOCK)
        WHERE
          action_name = @actionName
          AND identifier_hash = @identifierHash;

        IF @attemptCount IS NULL
        BEGIN
          INSERT INTO dbo.auth_rate_limits (
            action_name,
            identifier_hash,
            attempt_count,
            window_started_at,
            blocked_until,
            created_at,
            updated_at
          )
          VALUES (
            @actionName,
            @identifierHash,
            1,
            @currentDate,
            CASE
              WHEN @maximumAttempts <= 1 THEN @blockUntil
              ELSE NULL
            END,
            @currentDate,
            @currentDate
          );
        END
        ELSE IF
          @existingBlockedUntil IS NOT NULL
          AND @existingBlockedUntil > @currentDate
        BEGIN
          UPDATE dbo.auth_rate_limits
          SET updated_at = @currentDate
          WHERE
            action_name = @actionName
            AND identifier_hash = @identifierHash;
        END
        ELSE IF
          DATEADD(SECOND, @windowSeconds, @windowStartedAt) <= @currentDate
        BEGIN
          UPDATE dbo.auth_rate_limits
          SET
            attempt_count = 1,
            window_started_at = @currentDate,
            blocked_until = CASE
              WHEN @maximumAttempts <= 1 THEN @blockUntil
              ELSE NULL
            END,
            updated_at = @currentDate
          WHERE
            action_name = @actionName
            AND identifier_hash = @identifierHash;
        END
        ELSE
        BEGIN
          UPDATE dbo.auth_rate_limits
          SET
            attempt_count = attempt_count + 1,
            blocked_until = CASE
              WHEN attempt_count + 1 >= @maximumAttempts THEN @blockUntil
              ELSE NULL
            END,
            updated_at = @currentDate
          WHERE
            action_name = @actionName
            AND identifier_hash = @identifierHash;
        END;

        SELECT TOP (1)
          attempt_count,
          window_started_at,
          blocked_until
        FROM dbo.auth_rate_limits
        WITH (HOLDLOCK)
        WHERE
          action_name = @actionName
          AND identifier_hash = @identifierHash;

        COMMIT TRANSACTION;
      END TRY
      BEGIN CATCH
        IF XACT_STATE() <> 0
          ROLLBACK TRANSACTION;

        THROW;
      END CATCH;
    `,
    (sqlRequest) => {
      sqlRequest.input("actionName", NVarChar(80), action);
      sqlRequest.input("identifierHash", VarChar(64), identifierHash);
      sqlRequest.input("maximumAttempts", Int, policy.maximumAttempts);
      sqlRequest.input("windowSeconds", Int, policy.windowSeconds);
      sqlRequest.input("currentDate", DateTime2(7), currentDate);
      sqlRequest.input("blockUntil", DateTime2(7), blockUntil);
    },
  );

  if (!result.record) {
    throw new Error(
      "SQL Server no devolvió el límite de intentos actualizado.",
    );
  }

  return mapRateLimitResult(result.record, policy, currentDate);
}

export async function consumeDefaultAuthRateLimit(
  action: AuthRateLimitAction,
  identifier: string,
  currentDate = new Date(),
): Promise<RateLimitResult> {
  return consumeAuthRateLimitAttempt({
    action,
    identifier,
    policy: getAuthRateLimitPolicy(action),
    currentDate,
  });
}

export async function resetAuthRateLimit(
  action: AuthRateLimitAction,
  identifier: string,
): Promise<void> {
  const validatedAction = validateRateLimitAction(action);
  const identifierHash = hashRateLimitIdentifier(
    validatedAction,
    identifier,
  );

  await executeSqlQuery(
    `
      DELETE FROM dbo.auth_rate_limits
      WHERE
        action_name = @actionName
        AND identifier_hash = @identifierHash;
    `,
    (sqlRequest) => {
      sqlRequest.input("actionName", NVarChar(80), validatedAction);
      sqlRequest.input("identifierHash", VarChar(64), identifierHash);
    },
  );
}

export async function clearExpiredAuthRateLimits(
  currentDate = new Date(),
): Promise<number> {
  const normalizedCurrentDate = validateCurrentDate(currentDate);

  const result = await executeSqlQuery(
    `
      DELETE FROM dbo.auth_rate_limits
      WHERE
        DATEADD(DAY, 1, window_started_at) < @currentDate
        AND (
          blocked_until IS NULL
          OR blocked_until <= @currentDate
        );
    `,
    (sqlRequest) => {
      sqlRequest.input(
        "currentDate",
        DateTime2(7),
        normalizedCurrentDate,
      );
    },
  );

  return result.rowsAffected.reduce(
    (total, affectedRows) => total + affectedRows,
    0,
  );
}