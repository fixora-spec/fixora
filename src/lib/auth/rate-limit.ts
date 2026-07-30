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

const AUTH_RATE_LIMIT_POLICIES:
  Readonly<
    Record<
      AuthRateLimitAction,
      AuthRateLimitPolicy
    >
  > = {
  USER_REGISTRATION: {
    maximumAttempts:
      5,

    windowSeconds:
      60 * 60,

    blockSeconds:
      60 * 60,
  },

  USER_SIGN_IN: {
    maximumAttempts:
      5,

    windowSeconds:
      15 * 60,

    blockSeconds:
      15 * 60,
  },

  ADMIN_SIGN_IN: {
    maximumAttempts:
      5,

    windowSeconds:
      15 * 60,

    blockSeconds:
      30 * 60,
  },

  EMAIL_VERIFICATION: {
    maximumAttempts:
      5,

    windowSeconds:
      15 * 60,

    blockSeconds:
      15 * 60,
  },

  VERIFICATION_RESEND: {
    maximumAttempts:
      3,

    windowSeconds:
      15 * 60,

    blockSeconds:
      15 * 60,
  },

  PASSWORD_RESET_REQUEST: {
    maximumAttempts:
      5,

    windowSeconds:
      60 * 60,

    blockSeconds:
      60 * 60,
  },

  PASSWORD_RESET_VERIFICATION: {
    maximumAttempts:
      5,

    windowSeconds:
      15 * 60,

    blockSeconds:
      15 * 60,
  },

  PASSWORD_RESET_COMPLETION: {
    maximumAttempts:
      5,

    windowSeconds:
      15 * 60,

    blockSeconds:
      30 * 60,
  },

  USERNAME_AVAILABILITY: {
    maximumAttempts:
      60,

    windowSeconds:
      60,

    blockSeconds:
      60,
  },
};

function getRateLimitPepper():
  string {
  const pepper =
    process.env
      .AUTH_RATE_LIMIT_PEPPER
      ?.trim()
    || process.env
      .AUTH_CODE_PEPPER
      ?.trim();

  if (
    !pepper
    || pepper.length < 32
  ) {
    throw new Error(
      "AUTH_RATE_LIMIT_PEPPER debe tener al menos 32 caracteres.",
    );
  }

  return pepper;
}

function validateRateLimitPolicy(
  policy: AuthRateLimitPolicy,
): void {
  const values = [
    policy.maximumAttempts,
    policy.windowSeconds,
    policy.blockSeconds,
  ];

  if (
    values.some(
      (value) =>
        !Number.isSafeInteger(value)
        || value < 1
        || value > 86_400 * 30,
    )
  ) {
    throw new Error(
      "La política del límite de intentos no es válida.",
    );
  }
}

function normalizeIdentifier(
  identifier: string,
): string {
  const normalizedIdentifier =
    identifier
      .trim()
      .normalize("NFC")
      .toLowerCase();

  if (
    normalizedIdentifier.length === 0
    || normalizedIdentifier.length > 512
  ) {
    throw new Error(
      "El identificador del límite de intentos no es válido.",
    );
  }

  return normalizedIdentifier;
}

function hashRateLimitIdentifier(
  action: AuthRateLimitAction,
  identifier: string,
): string {
  return createSecretHash(
    `${action}:${normalizeIdentifier(identifier)}`,
    getRateLimitPepper(),
  );
}

function validateCurrentDate(
  currentDate: Date,
): Date {
  if (
    Number.isNaN(
      currentDate.getTime(),
    )
  ) {
    throw new Error(
      "La fecha del límite de intentos no es válida.",
    );
  }

  return currentDate;
}

function calculateRetryAfterSeconds(
  targetDate: Date,
  currentDate: Date,
): number {
  return Math.max(
    0,
    Math.ceil(
      (
        targetDate.getTime()
        - currentDate.getTime()
      ) / 1_000,
    ),
  );
}

function mapRateLimitResult(
  record: RateLimitDatabaseRecord,
  policy: AuthRateLimitPolicy,
  currentDate: Date,
): RateLimitResult {
  const windowStartedAt =
    new Date(
      record.window_started_at,
    );

  const windowEndsAt =
    new Date(
      windowStartedAt.getTime()
      + policy.windowSeconds
        * 1_000,
    );

  const blockedUntil =
    record.blocked_until
      ? new Date(
          record.blocked_until,
        )
      : null;

  const blocked =
    blockedUntil !== null
    && blockedUntil.getTime()
      > currentDate.getTime();

  const attemptsRemaining =
    Math.max(
      0,
      policy.maximumAttempts
      - record.attempt_count,
    );

  const retryTarget =
    blockedUntil
    ?? windowEndsAt;

  return {
    allowed:
      !blocked,

    blocked,

    attemptsUsed:
      record.attempt_count,

    attemptsRemaining,

    retryAfterSeconds:
      blocked
        ? calculateRetryAfterSeconds(
            retryTarget,
            currentDate,
          )
        : 0,

    windowStartedAt,
    windowEndsAt,
    blockedUntil,
  };
}

export function getAuthRateLimitPolicy(
  action: AuthRateLimitAction,
): AuthRateLimitPolicy {
  return {
    ...AUTH_RATE_LIMIT_POLICIES[
      action
    ],
  };
}

export async function consumeAuthRateLimitAttempt(
  input: ConsumeRateLimitInput,
): Promise<RateLimitResult> {
  validateRateLimitPolicy(
    input.policy,
  );

  const currentDate =
    validateCurrentDate(
      input.currentDate
        ? new Date(
            input.currentDate,
          )
        : new Date(),
    );

  const identifierHash =
    hashRateLimitIdentifier(
      input.action,
      input.identifier,
    );

  const windowEndsAt =
    new Date(
      currentDate.getTime()
      + input.policy
        .windowSeconds
        * 1_000,
    );

  const blockUntil =
    new Date(
      currentDate.getTime()
      + input.policy
        .blockSeconds
        * 1_000,
    );

  const result =
    await executeSqlSingle<
      RateLimitDatabaseRecord
    >(
      `
        SET XACT_ABORT ON;
        SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

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
        WITH (
          UPDLOCK,
          HOLDLOCK
        )
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
              WHEN @maximumAttempts <= 1
                THEN @blockUntil
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
          DATEADD(
            SECOND,
            @windowSeconds,
            @windowStartedAt
          ) <= @currentDate
        BEGIN
          UPDATE dbo.auth_rate_limits
          SET
            attempt_count = 1,
            window_started_at = @currentDate,
            blocked_until =
              CASE
                WHEN @maximumAttempts <= 1
                  THEN @blockUntil
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
            attempt_count =
              attempt_count + 1,

            blocked_until =
              CASE
                WHEN
                  attempt_count + 1
                  >= @maximumAttempts
                THEN @blockUntil
                ELSE NULL
              END,

            updated_at =
              @currentDate
          WHERE
            action_name = @actionName
            AND identifier_hash = @identifierHash;
        END;

        COMMIT TRANSACTION;

        SELECT TOP (1)
          attempt_count,
          window_started_at,
          blocked_until
        FROM dbo.auth_rate_limits
        WHERE
          action_name = @actionName
          AND identifier_hash = @identifierHash;
      `,
      (sqlRequest) => {
        sqlRequest.input(
          "actionName",
          NVarChar(80),
          input.action,
        );

        sqlRequest.input(
          "identifierHash",
          VarChar(64),
          identifierHash,
        );

        sqlRequest.input(
          "maximumAttempts",
          Int,
          input.policy
            .maximumAttempts,
        );

        sqlRequest.input(
          "windowSeconds",
          Int,
          input.policy
            .windowSeconds,
        );

        sqlRequest.input(
          "currentDate",
          DateTime2,
          currentDate,
        );

        sqlRequest.input(
          "windowEndsAt",
          DateTime2,
          windowEndsAt,
        );

        sqlRequest.input(
          "blockUntil",
          DateTime2,
          blockUntil,
        );
      },
    );

  if (!result.record) {
    throw new Error(
      "SQL Server no devolvió el límite de intentos actualizado.",
    );
  }

  return mapRateLimitResult(
    result.record,
    input.policy,
    currentDate,
  );
}

export async function consumeDefaultAuthRateLimit(
  action: AuthRateLimitAction,
  identifier: string,
  currentDate = new Date(),
): Promise<RateLimitResult> {
  return consumeAuthRateLimitAttempt({
    action,
    identifier,

    policy:
      getAuthRateLimitPolicy(
        action,
      ),

    currentDate,
  });
}

export async function resetAuthRateLimit(
  action: AuthRateLimitAction,
  identifier: string,
): Promise<void> {
  const identifierHash =
    hashRateLimitIdentifier(
      action,
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
      sqlRequest.input(
        "actionName",
        NVarChar(80),
        action,
      );

      sqlRequest.input(
        "identifierHash",
        VarChar(64),
        identifierHash,
      );
    },
  );
}

export async function clearExpiredAuthRateLimits(
  currentDate = new Date(),
): Promise<number> {
  const normalizedCurrentDate =
    validateCurrentDate(
      currentDate,
    );

  const result =
    await executeSqlQuery(
      `
        DELETE FROM dbo.auth_rate_limits
        WHERE
          blocked_until IS NULL
          AND DATEADD(
            DAY,
            1,
            window_started_at
          ) < @currentDate;
      `,
      (sqlRequest) => {
        sqlRequest.input(
          "currentDate",
          DateTime2,
          normalizedCurrentDate,
        );
      },
    );

  return result.rowsAffected[0]
    ?? 0;
}