import "server-only";

import {
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";

import {
  ADMIN_PASSWORD_RULES,
  USER_PASSWORD_RULES,
} from "@/config/auth.config";

import type {
  AccountRole,
} from "@/types/account";

import type {
  PasswordStrengthLevel,
  PasswordStrengthResult,
} from "@/types/auth";

const PASSWORD_HASH_VERSION = "v1";
const PASSWORD_HASH_ALGORITHM = "scrypt";

const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_SALT_LENGTH = 32;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;

const MINIMUM_ACCEPTED_SCRYPT_COST = 1_024;
const MAXIMUM_ACCEPTED_SCRYPT_COST = 262_144;
const MAXIMUM_ACCEPTED_BLOCK_SIZE = 32;
const MAXIMUM_ACCEPTED_PARALLELIZATION = 16;
const MINIMUM_ACCEPTED_SALT_LENGTH = 16;
const MAXIMUM_ACCEPTED_SALT_LENGTH = 64;
const MINIMUM_ACCEPTED_KEY_LENGTH = 32;
const MAXIMUM_ACCEPTED_KEY_LENGTH = 128;

const HASH_PARTS_COUNT = 7;
const MAXIMUM_ENCODED_HASH_LENGTH = 512;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;

const MAXIMUM_PASSWORD_LENGTH = Math.max(
  USER_PASSWORD_RULES.maximumLength,
  ADMIN_PASSWORD_RULES.maximumLength,
);

type PasswordRules = {
  minimumLength: number;
  maximumLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
  allowWhitespace: boolean;
};

type ScryptParameters = {
  cost: number;
  blockSize: number;
  parallelization: number;
  keyLength: number;
};

type ParsedPasswordHash = {
  version: string;
  algorithm: string;
  cost: number;
  blockSize: number;
  parallelization: number;
  salt: Buffer;
  derivedKey: Buffer;
};

export type PasswordValidationIssue =
  | "REQUIRED"
  | "TOO_SHORT"
  | "TOO_LONG"
  | "MISSING_UPPERCASE"
  | "MISSING_LOWERCASE"
  | "MISSING_NUMBER"
  | "MISSING_SYMBOL"
  | "CONTAINS_WHITESPACE";

export type PasswordValidationResult = {
  valid: boolean;
  issues: readonly PasswordValidationIssue[];
  strength: PasswordStrengthResult;
};

export class PasswordValidationError extends Error {
  public readonly issues: readonly PasswordValidationIssue[];

  public constructor(
    issues: readonly PasswordValidationIssue[],
  ) {
    super(
      "La contraseña no cumple con los requisitos de seguridad.",
    );

    this.name = "PasswordValidationError";
    this.issues = Object.freeze([...issues]);
  }
}

function getPasswordRules(
  accountRole: AccountRole,
): PasswordRules {
  return accountRole === "ADMIN"
    ? ADMIN_PASSWORD_RULES
    : USER_PASSWORD_RULES;
}

function isPowerOfTwo(value: number): boolean {
  return (
    Number.isSafeInteger(value)
    && value > 1
    && (value & (value - 1)) === 0
  );
}

function areScryptParametersSafe(
  parameters: ScryptParameters,
): boolean {
  const {
    cost,
    blockSize,
    parallelization,
    keyLength,
  } = parameters;

  if (
    !isPowerOfTwo(cost)
    || cost < MINIMUM_ACCEPTED_SCRYPT_COST
    || cost > MAXIMUM_ACCEPTED_SCRYPT_COST
    || !Number.isSafeInteger(blockSize)
    || blockSize < 1
    || blockSize > MAXIMUM_ACCEPTED_BLOCK_SIZE
    || !Number.isSafeInteger(parallelization)
    || parallelization < 1
    || parallelization > MAXIMUM_ACCEPTED_PARALLELIZATION
    || !Number.isSafeInteger(keyLength)
    || keyLength < MINIMUM_ACCEPTED_KEY_LENGTH
    || keyLength > MAXIMUM_ACCEPTED_KEY_LENGTH
  ) {
    return false;
  }

  const estimatedMemory =
    128 * cost * blockSize
    + 128 * blockSize * parallelization
    + 256 * blockSize
    + keyLength;

  return (
    Number.isSafeInteger(estimatedMemory)
    && estimatedMemory < SCRYPT_MAX_MEMORY
  );
}

function derivePasswordKey(
  password: string,
  salt: Buffer,
  parameters: ScryptParameters,
): Promise<Buffer> {
  if (!areScryptParametersSafe(parameters)) {
    return Promise.reject(
      new Error("Los parámetros de derivación no son válidos."),
    );
  }

  if (
    salt.length < MINIMUM_ACCEPTED_SALT_LENGTH
    || salt.length > MAXIMUM_ACCEPTED_SALT_LENGTH
  ) {
    return Promise.reject(
      new Error("La sal de la contraseña no es válida."),
    );
  }

  return new Promise((resolveKey, rejectKey) => {
    scrypt(
      password,
      salt,
      parameters.keyLength,
      {
        cost: parameters.cost,
        blockSize: parameters.blockSize,
        parallelization: parameters.parallelization,
        maxmem: SCRYPT_MAX_MEMORY,
      },
      (error, derivedKey) => {
        if (error) {
          rejectKey(error);
          return;
        }

        resolveKey(Buffer.from(derivedKey));
      },
    );
  });
}

function calculateStrengthLevel(
  password: string,
  score: number,
  isValid: boolean,
): PasswordStrengthLevel {
  if (password.length === 0) {
    return "EMPTY";
  }

  if (
    score <= 2
    || password.length < 8
  ) {
    return "WEAK";
  }

  if (
    score <= 4
    || !isValid
    || password.length < 12
  ) {
    return "MEDIUM";
  }

  return "STRONG";
}

function hasUppercaseLetter(password: string): boolean {
  return /\p{Lu}/u.test(password);
}

function hasLowercaseLetter(password: string): boolean {
  return /\p{Ll}/u.test(password);
}

function hasNumber(password: string): boolean {
  return /\p{N}/u.test(password);
}

function hasSymbol(password: string): boolean {
  return /[^\p{L}\p{N}\s]/u.test(password);
}

export function analyzePasswordStrength(
  password: string,
  accountRole: AccountRole = "USER",
): PasswordStrengthResult {
  const rules = getPasswordRules(accountRole);

  const hasMinimumLength =
    password.length >= rules.minimumLength;

  const hasUppercase = hasUppercaseLetter(password);
  const hasLowercase = hasLowercaseLetter(password);
  const containsNumber = hasNumber(password);
  const containsSymbol = hasSymbol(password);
  const hasWhitespace = /\s/u.test(password);

  const isWithinMaximumLength =
    password.length <= rules.maximumLength;

  const requirements = [
    hasMinimumLength,
    !rules.requireUppercase || hasUppercase,
    !rules.requireLowercase || hasLowercase,
    !rules.requireNumber || containsNumber,
    !rules.requireSymbol || containsSymbol,
    rules.allowWhitespace || !hasWhitespace,
    isWithinMaximumLength,
  ];

  let score = requirements.filter(Boolean).length;

  if (password.length >= 12) {
    score += 1;
  }

  if (password.length >= 16) {
    score += 1;
  }

  score = Math.min(score, 7);

  const isValid =
    requirements.every(Boolean)
    && password.length > 0;

  return {
    level: calculateStrengthLevel(
      password,
      score,
      isValid,
    ),
    score,
    hasMinimumLength,
    hasUppercase,
    hasLowercase,
    hasNumber: containsNumber,
    hasSymbol: containsSymbol,
    hasWhitespace,
    isValid,
  };
}

export function validatePassword(
  password: string,
  accountRole: AccountRole = "USER",
): PasswordValidationResult {
  const rules = getPasswordRules(accountRole);
  const issues: PasswordValidationIssue[] = [];

  if (password.length === 0) {
    issues.push("REQUIRED");
  }

  if (
    password.length > 0
    && password.length < rules.minimumLength
  ) {
    issues.push("TOO_SHORT");
  }

  if (password.length > rules.maximumLength) {
    issues.push("TOO_LONG");
  }

  if (
    rules.requireUppercase
    && !hasUppercaseLetter(password)
  ) {
    issues.push("MISSING_UPPERCASE");
  }

  if (
    rules.requireLowercase
    && !hasLowercaseLetter(password)
  ) {
    issues.push("MISSING_LOWERCASE");
  }

  if (
    rules.requireNumber
    && !hasNumber(password)
  ) {
    issues.push("MISSING_NUMBER");
  }

  if (
    rules.requireSymbol
    && !hasSymbol(password)
  ) {
    issues.push("MISSING_SYMBOL");
  }

  if (
    !rules.allowWhitespace
    && /\s/u.test(password)
  ) {
    issues.push("CONTAINS_WHITESPACE");
  }

  const immutableIssues = Object.freeze([...issues]);

  return {
    valid: immutableIssues.length === 0,
    issues: immutableIssues,
    strength: analyzePasswordStrength(
      password,
      accountRole,
    ),
  };
}

export function assertValidPassword(
  password: string,
  accountRole: AccountRole = "USER",
): void {
  const validation = validatePassword(
    password,
    accountRole,
  );

  if (!validation.valid) {
    throw new PasswordValidationError(
      validation.issues,
    );
  }
}

export async function hashPassword(
  password: string,
  accountRole: AccountRole = "USER",
): Promise<string> {
  assertValidPassword(password, accountRole);

  const salt = randomBytes(SCRYPT_SALT_LENGTH);
  const derivedKey = await derivePasswordKey(
    password,
    salt,
    {
      cost: SCRYPT_COST,
      blockSize: SCRYPT_BLOCK_SIZE,
      parallelization: SCRYPT_PARALLELIZATION,
      keyLength: SCRYPT_KEY_LENGTH,
    },
  );

  try {
    return [
      PASSWORD_HASH_VERSION,
      PASSWORD_HASH_ALGORITHM,
      String(SCRYPT_COST),
      String(SCRYPT_BLOCK_SIZE),
      String(SCRYPT_PARALLELIZATION),
      salt.toString("base64url"),
      derivedKey.toString("base64url"),
    ].join("$");
  } finally {
    derivedKey.fill(0);
  }
}

function parsePositiveInteger(
  value: string,
): number | null {
  if (!/^\d+$/u.test(value)) {
    return null;
  }

  const parsedValue = Number.parseInt(value, 10);

  if (
    !Number.isSafeInteger(parsedValue)
    || parsedValue <= 0
  ) {
    return null;
  }

  return parsedValue;
}

function decodeCanonicalBase64Url(
  value: string,
  minimumLength: number,
  maximumLength: number,
): Buffer | null {
  if (
    value.length === 0
    || !BASE64URL_PATTERN.test(value)
  ) {
    return null;
  }

  let decodedValue: Buffer;

  try {
    decodedValue = Buffer.from(value, "base64url");
  } catch {
    return null;
  }

  if (
    decodedValue.length < minimumLength
    || decodedValue.length > maximumLength
    || decodedValue.toString("base64url") !== value
  ) {
    decodedValue.fill(0);
    return null;
  }

  return decodedValue;
}

function parsePasswordHash(
  encodedHash: string,
): ParsedPasswordHash | null {
  if (
    encodedHash.length === 0
    || encodedHash.length > MAXIMUM_ENCODED_HASH_LENGTH
  ) {
    return null;
  }

  const parts = encodedHash.split("$");

  if (parts.length !== HASH_PARTS_COUNT) {
    return null;
  }

  const [
    version,
    algorithm,
    rawCost,
    rawBlockSize,
    rawParallelization,
    rawSalt,
    rawDerivedKey,
  ] = parts;

  if (
    version !== PASSWORD_HASH_VERSION
    || algorithm !== PASSWORD_HASH_ALGORITHM
  ) {
    return null;
  }

  const cost = parsePositiveInteger(rawCost ?? "");
  const blockSize = parsePositiveInteger(rawBlockSize ?? "");
  const parallelization = parsePositiveInteger(
    rawParallelization ?? "",
  );

  if (
    cost === null
    || blockSize === null
    || parallelization === null
  ) {
    return null;
  }

  const salt = decodeCanonicalBase64Url(
    rawSalt ?? "",
    MINIMUM_ACCEPTED_SALT_LENGTH,
    MAXIMUM_ACCEPTED_SALT_LENGTH,
  );

  const derivedKey = decodeCanonicalBase64Url(
    rawDerivedKey ?? "",
    MINIMUM_ACCEPTED_KEY_LENGTH,
    MAXIMUM_ACCEPTED_KEY_LENGTH,
  );

  if (!salt || !derivedKey) {
    salt?.fill(0);
    derivedKey?.fill(0);
    return null;
  }

  if (
    !areScryptParametersSafe({
      cost,
      blockSize,
      parallelization,
      keyLength: derivedKey.length,
    })
  ) {
    salt.fill(0);
    derivedKey.fill(0);
    return null;
  }

  return {
    version,
    algorithm,
    cost,
    blockSize,
    parallelization,
    salt,
    derivedKey,
  };
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  if (
    password.length === 0
    || password.length > MAXIMUM_PASSWORD_LENGTH
    || encodedHash.length === 0
    || encodedHash.length > MAXIMUM_ENCODED_HASH_LENGTH
  ) {
    return false;
  }

  const parsedHash = parsePasswordHash(encodedHash);

  if (!parsedHash) {
    return false;
  }

  let calculatedKey: Buffer | null = null;

  try {
    calculatedKey = await derivePasswordKey(
      password,
      parsedHash.salt,
      {
        cost: parsedHash.cost,
        blockSize: parsedHash.blockSize,
        parallelization: parsedHash.parallelization,
        keyLength: parsedHash.derivedKey.length,
      },
    );

    if (
      calculatedKey.length
      !== parsedHash.derivedKey.length
    ) {
      return false;
    }

    return timingSafeEqual(
      calculatedKey,
      parsedHash.derivedKey,
    );
  } catch {
    return false;
  } finally {
    calculatedKey?.fill(0);
    parsedHash.salt.fill(0);
    parsedHash.derivedKey.fill(0);
  }
}

export function needsPasswordRehash(
  encodedHash: string,
): boolean {
  const parsedHash = parsePasswordHash(encodedHash);

  if (!parsedHash) {
    return true;
  }

  try {
    return (
      parsedHash.version !== PASSWORD_HASH_VERSION
      || parsedHash.algorithm !== PASSWORD_HASH_ALGORITHM
      || parsedHash.cost !== SCRYPT_COST
      || parsedHash.blockSize !== SCRYPT_BLOCK_SIZE
      || parsedHash.parallelization !== SCRYPT_PARALLELIZATION
      || parsedHash.salt.length !== SCRYPT_SALT_LENGTH
      || parsedHash.derivedKey.length !== SCRYPT_KEY_LENGTH
    );
  } finally {
    parsedHash.salt.fill(0);
    parsedHash.derivedKey.fill(0);
  }
}