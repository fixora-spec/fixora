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

const DEFAULT_EMAIL_CODE_TTL_MINUTES = 10;
const DEFAULT_PASSWORD_RESET_CODE_TTL_MINUTES = 10;

const MINIMUM_PEPPER_LENGTH = 32;
const MAXIMUM_PEPPER_LENGTH = 1_024;
const MAXIMUM_CODE_INPUT_LENGTH = 64;
const SHA_256_HEX_LENGTH = 64;
const SHA_256_HEX_PATTERN = /^[a-f0-9]{64}$/iu;

const VERIFICATION_PURPOSES = new Set<VerificationPurpose>([
  "EMAIL_VERIFICATION",
  "PASSWORD_RESET",
  "ADMIN_ACTIVATION",
]);

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
  const rawValue = process.env[name]?.trim();

  if (!rawValue) {
    return fallbackValue;
  }

  if (!/^\d+$/u.test(rawValue)) {
    throw new Error(
      `${name} debe contener un número entero válido.`,
    );
  }

  const parsedValue = Number.parseInt(rawValue, 10);

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

function isVerificationPurpose(
  purpose: VerificationPurpose,
): boolean {
  return VERIFICATION_PURPOSES.has(purpose);
}

function assertVerificationPurpose(
  purpose: VerificationPurpose,
): void {
  if (!isVerificationPurpose(purpose)) {
    throw new Error(
      "El propósito del código de verificación no es válido.",
    );
  }
}

function isValidDate(value: Date): boolean {
  return (
    value instanceof Date
    && !Number.isNaN(value.getTime())
  );
}

function assertValidDate(
  value: Date,
  name: string,
): void {
  if (!isValidDate(value)) {
    throw new Error(`${name} no contiene una fecha válida.`);
  }
}

function isValidAttemptState(
  attemptsUsed: number,
  maximumAttempts: number,
): boolean {
  return (
    Number.isSafeInteger(attemptsUsed)
    && Number.isSafeInteger(maximumAttempts)
    && attemptsUsed >= 0
    && maximumAttempts >= 1
    && attemptsUsed <= maximumAttempts
  );
}

function getVerificationCodePepper(): string {
  const pepper = process.env.AUTH_CODE_PEPPER;

  if (
    typeof pepper !== "string"
    || pepper.trim().length === 0
    || pepper.length < MINIMUM_PEPPER_LENGTH
    || pepper.length > MAXIMUM_PEPPER_LENGTH
    || /[\r\n\0]/u.test(pepper)
  ) {
    throw new Error(
      `AUTH_CODE_PEPPER debe contener un secreto de ${MINIMUM_PEPPER_LENGTH} a ${MAXIMUM_PEPPER_LENGTH} caracteres sin saltos de línea.`,
    );
  }

  // El pepper se conserva exactamente como fue configurado.
  return pepper;
}

function getVerificationResendCooldownSeconds(): number {
  const cooldownSeconds =
    AUTH_ATTEMPT_RULES.verificationResendCooldownSeconds;

  if (
    !Number.isSafeInteger(cooldownSeconds)
    || cooldownSeconds < 0
    || cooldownSeconds > 3_600
  ) {
    throw new Error(
      "El tiempo de espera para reenviar códigos no es válido.",
    );
  }

  return cooldownSeconds;
}

export function getVerificationCodeTtlMinutes(
  purpose: VerificationPurpose,
): number {
  assertVerificationPurpose(purpose);

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

export function getMaximumVerificationAttempts(): number {
  return readPositiveIntegerEnvironmentValue(
    "AUTH_CODE_MAX_ATTEMPTS",
    AUTH_ATTEMPT_RULES.maximumVerificationAttempts,
    1,
    20,
  );
}

export function normalizeCode(
  code: string,
): string {
  if (code.length > MAXIMUM_CODE_INPUT_LENGTH) {
    return "";
  }

  return code
    .trim()
    .toUpperCase()
    .replace(/\s+/gu, "");
}

export function isVerificationCodeFormatValid(
  code: string,
): boolean {
  const normalizedCode = normalizeCode(code);

  return (
    normalizedCode.length === VERIFICATION_CODE_RULES.length
    && VERIFICATION_CODE_RULES.formatPattern.test(
      normalizedCode,
    )
  );
}

export function createVerificationCodeHash(
  code: string,
): string {
  const normalizedCode = normalizeCode(code);

  if (!isVerificationCodeFormatValid(normalizedCode)) {
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
  const normalizedCode = normalizeCode(code);

  if (
    !isVerificationCodeFormatValid(normalizedCode)
    || expectedHash.length !== SHA_256_HEX_LENGTH
    || !SHA_256_HEX_PATTERN.test(expectedHash)
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
  assertVerificationPurpose(purpose);
  assertValidDate(currentDate, "currentDate");

  const code = generateVerificationCode();

  if (!isVerificationCodeFormatValid(code)) {
    throw new Error(
      "El generador produjo un código de verificación no válido.",
    );
  }

  const ttlMinutes = getVerificationCodeTtlMinutes(purpose);
  const resendCooldownSeconds =
    getVerificationResendCooldownSeconds();

  const createdAt = new Date(currentDate.getTime());
  const expiresAt = new Date(
    createdAt.getTime() + ttlMinutes * 60_000,
  );
  const resendAvailableAt = new Date(
    createdAt.getTime() + resendCooldownSeconds * 1_000,
  );

  assertValidDate(expiresAt, "expiresAt");
  assertValidDate(resendAvailableAt, "resendAvailableAt");

  return {
    code,
    codeHash: createVerificationCodeHash(code),
    purpose,
    createdAt,
    expiresAt,
    maximumAttempts: getMaximumVerificationAttempts(),
    resendAvailableAt,
  };
}

export function hasVerificationCodeExpired(
  expiresAt: Date,
  currentDate = new Date(),
): boolean {
  if (
    !isValidDate(expiresAt)
    || !isValidDate(currentDate)
  ) {
    return true;
  }

  return expiresAt.getTime() <= currentDate.getTime();
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
  if (!isValidAttemptState(attemptsUsed, maximumAttempts)) {
    return true;
  }

  return attemptsUsed >= maximumAttempts;
}

export function canAttemptVerification(
  state: StoredVerificationCodeState,
  currentDate = new Date(),
): boolean {
  if (
    state.consumedAt !== null
    || !isValidDate(state.expiresAt)
    || !isValidDate(currentDate)
    || !isValidAttemptState(
      state.attemptsUsed,
      state.maximumAttempts,
    )
    || hasVerificationCodeExpired(
      state.expiresAt,
      currentDate,
    )
    || hasExceededVerificationAttempts(
      state.attemptsUsed,
      state.maximumAttempts,
    )
  ) {
    return false;
  }

  return (
    state.codeHash.length === SHA_256_HEX_LENGTH
    && SHA_256_HEX_PATTERN.test(state.codeHash)
  );
}

export function getRemainingVerificationAttempts(
  attemptsUsed: number,
  maximumAttempts: number,
): number {
  if (!isValidAttemptState(attemptsUsed, maximumAttempts)) {
    throw new Error(
      "Los intentos del código no son válidos.",
    );
  }

  return Math.max(0, maximumAttempts - attemptsUsed);
}

export function canResendVerificationCode(
  resendAvailableAt: Date,
  currentDate = new Date(),
): boolean {
  if (
    !isValidDate(resendAvailableAt)
    || !isValidDate(currentDate)
  ) {
    return false;
  }

  return currentDate.getTime() >= resendAvailableAt.getTime();
}

export function getVerificationCodeRemainingSeconds(
  targetDate: Date,
  currentDate = new Date(),
): number {
  assertValidDate(targetDate, "targetDate");
  assertValidDate(currentDate, "currentDate");

  const remainingMilliseconds =
    targetDate.getTime() - currentDate.getTime();

  return Math.max(
    0,
    Math.ceil(remainingMilliseconds / 1_000),
  );
}