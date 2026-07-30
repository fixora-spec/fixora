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

const HASH_PARTS_COUNT = 7;

type PasswordRules = {
  minimumLength: number;
  maximumLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
  allowWhitespace: boolean;
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

export class PasswordValidationError
  extends Error {
  public readonly issues:
    readonly PasswordValidationIssue[];

  public constructor(
    issues: readonly PasswordValidationIssue[],
  ) {
    super(
      "La contraseña no cumple con los requisitos de seguridad.",
    );

    this.name =
      "PasswordValidationError";

    this.issues =
      issues;
  }
}

function getPasswordRules(
  accountRole: AccountRole,
): PasswordRules {
  return accountRole === "ADMIN"
    ? ADMIN_PASSWORD_RULES
    : USER_PASSWORD_RULES;
}

function derivePasswordKey(
  password: string,
  salt: Buffer,
  parameters: {
    cost: number;
    blockSize: number;
    parallelization: number;
    keyLength: number;
  },
): Promise<Buffer> {
  return new Promise(
    (resolveKey, rejectKey) => {
      scrypt(
        password,
        salt,
        parameters.keyLength,
        {
          cost:
            parameters.cost,

          blockSize:
            parameters.blockSize,

          parallelization:
            parameters.parallelization,

          maxmem:
            SCRYPT_MAX_MEMORY,
        },
        (
          error,
          derivedKey,
        ) => {
          if (error) {
            rejectKey(error);
            return;
          }

          resolveKey(
            Buffer.from(derivedKey),
          );
        },
      );
    },
  );
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

export function analyzePasswordStrength(
  password: string,
  accountRole: AccountRole = "USER",
): PasswordStrengthResult {
  const rules =
    getPasswordRules(accountRole);

  const hasMinimumLength =
    password.length
    >= rules.minimumLength;

  const hasUppercase =
    /[A-Z]/u.test(password);

  const hasLowercase =
    /[a-z]/u.test(password);

  const hasNumber =
    /\d/u.test(password);

  const hasSymbol =
    /[^\p{L}\p{N}\s]/u.test(
      password,
    );

  const hasWhitespace =
    /\s/u.test(password);

  const isWithinMaximumLength =
    password.length
    <= rules.maximumLength;

  const requirements = [
    hasMinimumLength,
    !rules.requireUppercase
      || hasUppercase,
    !rules.requireLowercase
      || hasLowercase,
    !rules.requireNumber
      || hasNumber,
    !rules.requireSymbol
      || hasSymbol,
    rules.allowWhitespace
      || !hasWhitespace,
    isWithinMaximumLength,
  ];

  let score =
    requirements.filter(Boolean).length;

  if (password.length >= 12) {
    score += 1;
  }

  if (password.length >= 16) {
    score += 1;
  }

  score =
    Math.min(score, 7);

  const isValid =
    requirements.every(Boolean)
    && password.length > 0;

  return {
    level:
      calculateStrengthLevel(
        password,
        score,
        isValid,
      ),

    score,

    hasMinimumLength,
    hasUppercase,
    hasLowercase,
    hasNumber,
    hasSymbol,
    hasWhitespace,

    isValid,
  };
}

export function validatePassword(
  password: string,
  accountRole: AccountRole = "USER",
): PasswordValidationResult {
  const rules =
    getPasswordRules(accountRole);

  const issues:
    PasswordValidationIssue[] = [];

  if (password.length === 0) {
    issues.push("REQUIRED");
  }

  if (
    password.length > 0
    && password.length
      < rules.minimumLength
  ) {
    issues.push("TOO_SHORT");
  }

  if (
    password.length
    > rules.maximumLength
  ) {
    issues.push("TOO_LONG");
  }

  if (
    rules.requireUppercase
    && !/[A-Z]/u.test(password)
  ) {
    issues.push(
      "MISSING_UPPERCASE",
    );
  }

  if (
    rules.requireLowercase
    && !/[a-z]/u.test(password)
  ) {
    issues.push(
      "MISSING_LOWERCASE",
    );
  }

  if (
    rules.requireNumber
    && !/\d/u.test(password)
  ) {
    issues.push(
      "MISSING_NUMBER",
    );
  }

  if (
    rules.requireSymbol
    && !/[^\p{L}\p{N}\s]/u.test(
      password,
    )
  ) {
    issues.push(
      "MISSING_SYMBOL",
    );
  }

  if (
    !rules.allowWhitespace
    && /\s/u.test(password)
  ) {
    issues.push(
      "CONTAINS_WHITESPACE",
    );
  }

  return {
    valid:
      issues.length === 0,

    issues,

    strength:
      analyzePasswordStrength(
        password,
        accountRole,
      ),
  };
}

export function assertValidPassword(
  password: string,
  accountRole: AccountRole = "USER",
): void {
  const validation =
    validatePassword(
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
  assertValidPassword(
    password,
    accountRole,
  );

  const salt =
    randomBytes(
      SCRYPT_SALT_LENGTH,
    );

  const derivedKey =
    await derivePasswordKey(
      password,
      salt,
      {
        cost:
          SCRYPT_COST,

        blockSize:
          SCRYPT_BLOCK_SIZE,

        parallelization:
          SCRYPT_PARALLELIZATION,

        keyLength:
          SCRYPT_KEY_LENGTH,
      },
    );

  return [
    PASSWORD_HASH_VERSION,
    PASSWORD_HASH_ALGORITHM,
    String(SCRYPT_COST),
    String(SCRYPT_BLOCK_SIZE),
    String(SCRYPT_PARALLELIZATION),
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

function parsePositiveInteger(
  value: string,
): number | null {
  if (!/^\d+$/u.test(value)) {
    return null;
  }

  const parsedValue =
    Number.parseInt(value, 10);

  if (
    !Number.isSafeInteger(
      parsedValue,
    )
    || parsedValue <= 0
  ) {
    return null;
  }

  return parsedValue;
}

function parsePasswordHash(
  encodedHash: string,
): ParsedPasswordHash | null {
  const parts =
    encodedHash.split("$");

  if (
    parts.length
    !== HASH_PARTS_COUNT
  ) {
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
    !version
    || !algorithm
    || !rawCost
    || !rawBlockSize
    || !rawParallelization
    || !rawSalt
    || !rawDerivedKey
  ) {
    return null;
  }

  if (
    version
      !== PASSWORD_HASH_VERSION
    || algorithm
      !== PASSWORD_HASH_ALGORITHM
  ) {
    return null;
  }

  const cost =
    parsePositiveInteger(rawCost);

  const blockSize =
    parsePositiveInteger(
      rawBlockSize,
    );

  const parallelization =
    parsePositiveInteger(
      rawParallelization,
    );

  if (
    cost === null
    || blockSize === null
    || parallelization === null
  ) {
    return null;
  }

  let salt:
    Buffer;

  let derivedKey:
    Buffer;

  try {
    salt =
      Buffer.from(
        rawSalt,
        "base64url",
      );

    derivedKey =
      Buffer.from(
        rawDerivedKey,
        "base64url",
      );
  } catch {
    return null;
  }

  if (
    salt.length < 16
    || derivedKey.length < 32
  ) {
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
    || password.length > 128
    || encodedHash.length === 0
    || encodedHash.length > 512
  ) {
    return false;
  }

  const parsedHash =
    parsePasswordHash(
      encodedHash,
    );

  if (!parsedHash) {
    return false;
  }

  try {
    const calculatedKey =
      await derivePasswordKey(
        password,
        parsedHash.salt,
        {
          cost:
            parsedHash.cost,

          blockSize:
            parsedHash.blockSize,

          parallelization:
            parsedHash.parallelization,

          keyLength:
            parsedHash
              .derivedKey
              .length,
        },
      );

    if (
      calculatedKey.length
      !== parsedHash
        .derivedKey
        .length
    ) {
      return false;
    }

    return timingSafeEqual(
      calculatedKey,
      parsedHash.derivedKey,
    );
  } catch {
    return false;
  }
}

export function needsPasswordRehash(
  encodedHash: string,
): boolean {
  const parsedHash =
    parsePasswordHash(
      encodedHash,
    );

  if (!parsedHash) {
    return true;
  }

  return (
    parsedHash.version
      !== PASSWORD_HASH_VERSION
    || parsedHash.algorithm
      !== PASSWORD_HASH_ALGORITHM
    || parsedHash.cost
      !== SCRYPT_COST
    || parsedHash.blockSize
      !== SCRYPT_BLOCK_SIZE
    || parsedHash.parallelization
      !== SCRYPT_PARALLELIZATION
    || parsedHash.salt.length
      !== SCRYPT_SALT_LENGTH
    || parsedHash.derivedKey.length
      !== SCRYPT_KEY_LENGTH
  );
}