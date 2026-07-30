import "server-only";

import {
  AUTH_ATTEMPT_RULES,
  VERIFICATION_CODE_RULES,
} from "@/config/auth.config";

import {
  createSecretHash,
  generateVerificationCode,
  verifySecretHash,
} from "@/lib/security/secure-random";

import type {
  VerificationPurpose,
} from "@/types/auth";

const DEFAULT_EMAIL_CODE_TTL_MINUTES =
  10;

const DEFAULT_PASSWORD_RESET_CODE_TTL_MINUTES =
  10;

export type GeneratedVerificationCode = {
  code: string;
  codeHash: string;

  purpose: VerificationPurpose;

  createdAt: Date;
  expiresAt: Date;

  maximumAttempts: number;
  resendAvailableAt: Date;
};

export type StoredVerificationCodeState = {
  codeHash: string;

  attemptsUsed: number;
  maximumAttempts: number;

  expiresAt: Date;
  consumedAt: Date | null;
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
    !Number.isSafeInteger(
      parsedValue,
    )
    || parsedValue < minimum
    || parsedValue > maximum
  ) {
    throw new Error(
      `${name} debe estar entre ${minimum} y ${maximum}.`,
    );
  }

  return parsedValue;
}

function getVerificationCodePepper():
  string {
  const pepper =
    process.env
      .AUTH_CODE_PEPPER
      ?.trim();

  if (
    !pepper
    || pepper.length < 32
  ) {
    throw new Error(
      "AUTH_CODE_PEPPER debe tener al menos 32 caracteres.",
    );
  }

  return pepper;
}

export function getVerificationCodeTtlMinutes(
  purpose: VerificationPurpose,
): number {
  if (purpose === "PASSWORD_RESET") {
    return readPositiveIntegerEnvironmentValue(
      "AUTH_PASSWORD_RESET_CODE_TTL_MINUTES",
      DEFAULT_PASSWORD_RESET_CODE_TTL_MINUTES,
      1,
      60,
    );
  }

  return readPositiveIntegerEnvironmentValue(
    "AUTH_VERIFICATION_CODE_TTL_MINUTES",
    DEFAULT_EMAIL_CODE_TTL_MINUTES,
    1,
    60,
  );
}

export function getMaximumVerificationAttempts():
  number {
  return readPositiveIntegerEnvironmentValue(
    "AUTH_CODE_MAX_ATTEMPTS",
    AUTH_ATTEMPT_RULES
      .maximumVerificationAttempts,
    1,
    20,
  );
}

export function normalizeCode(
  code: string,
): string {
  return code
    .trim()
    .toUpperCase()
    .replace(/\s+/gu, "");
}

export function isVerificationCodeFormatValid(
  code: string,
): boolean {
  return VERIFICATION_CODE_RULES
    .formatPattern
    .test(
      normalizeCode(code),
    );
}

export function createVerificationCodeHash(
  code: string,
): string {
  const normalizedCode =
    normalizeCode(code);

  if (
    !isVerificationCodeFormatValid(
      normalizedCode,
    )
  ) {
    throw new Error(
      "El código de verificación no tiene un formato válido.",
    );
  }

  return createSecretHash(
    normalizedCode,
    getVerificationCodePepper(),
  );
}

export function verifyVerificationCodeHash(
  code: string,
  expectedHash: string,
): boolean {
  const normalizedCode =
    normalizeCode(code);

  if (
    !isVerificationCodeFormatValid(
      normalizedCode,
    )
  ) {
    return false;
  }

  return verifySecretHash(
    normalizedCode,
    expectedHash,
    getVerificationCodePepper(),
  );
}

export function generateAuthVerificationCode(
  purpose: VerificationPurpose,
  currentDate = new Date(),
): GeneratedVerificationCode {
  if (
    Number.isNaN(
      currentDate.getTime(),
    )
  ) {
    throw new Error(
      "La fecha proporcionada no es válida.",
    );
  }

  const code =
    generateVerificationCode();

  const ttlMinutes =
    getVerificationCodeTtlMinutes(
      purpose,
    );

  const expiresAt =
    new Date(
      currentDate.getTime()
      + ttlMinutes * 60_000,
    );

  const resendAvailableAt =
    new Date(
      currentDate.getTime()
      + AUTH_ATTEMPT_RULES
        .verificationResendCooldownSeconds
        * 1_000,
    );

  return {
    code,

    codeHash:
      createVerificationCodeHash(
        code,
      ),

    purpose,

    createdAt:
      new Date(
        currentDate.getTime(),
      ),

    expiresAt,

    maximumAttempts:
      getMaximumVerificationAttempts(),

    resendAvailableAt,
  };
}

export function hasVerificationCodeExpired(
  expiresAt: Date,
  currentDate = new Date(),
): boolean {
  return (
    expiresAt.getTime()
    <= currentDate.getTime()
  );
}

export function hasVerificationCodeBeenConsumed(
  consumedAt: Date | null,
): boolean {
  return consumedAt !== null;
}

export function hasExceededVerificationAttempts(
  attemptsUsed: number,
  maximumAttempts: number,
): boolean {
  return (
    attemptsUsed
    >= maximumAttempts
  );
}

export function canAttemptVerification(
  state: StoredVerificationCodeState,
  currentDate = new Date(),
): boolean {
  if (
    state.consumedAt !== null
  ) {
    return false;
  }

  if (
    hasVerificationCodeExpired(
      state.expiresAt,
      currentDate,
    )
  ) {
    return false;
  }

  if (
    hasExceededVerificationAttempts(
      state.attemptsUsed,
      state.maximumAttempts,
    )
  ) {
    return false;
  }

  return true;
}

export function getRemainingVerificationAttempts(
  attemptsUsed: number,
  maximumAttempts: number,
): number {
  if (
    !Number.isSafeInteger(
      attemptsUsed,
    )
    || !Number.isSafeInteger(
      maximumAttempts,
    )
    || attemptsUsed < 0
    || maximumAttempts < 1
  ) {
    throw new Error(
      "Los intentos del código no son válidos.",
    );
  }

  return Math.max(
    0,
    maximumAttempts
      - attemptsUsed,
  );
}

export function canResendVerificationCode(
  resendAvailableAt: Date,
  currentDate = new Date(),
): boolean {
  return (
    currentDate.getTime()
    >= resendAvailableAt.getTime()
  );
}

export function getVerificationCodeRemainingSeconds(
  targetDate: Date,
  currentDate = new Date(),
): number {
  const remainingMilliseconds =
    targetDate.getTime()
    - currentDate.getTime();

  return Math.max(
    0,
    Math.ceil(
      remainingMilliseconds
      / 1_000,
    ),
  );
}