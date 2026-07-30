import "server-only";

import {
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

import {
  VERIFICATION_CODE_RULES,
} from "@/config/auth.config";

const DEFAULT_TOKEN_BYTES = 48;
const SHA_256_HEX_LENGTH = 64;

function validatePositiveInteger(
  value: number,
  name: string,
): void {
  if (
    !Number.isSafeInteger(value)
    || value <= 0
  ) {
    throw new Error(
      `${name} debe ser un número entero positivo.`,
    );
  }
}

function validateAlphabet(
  alphabet: string,
): void {
  if (alphabet.length < 2) {
    throw new Error(
      "El alfabeto debe contener al menos dos caracteres.",
    );
  }

  const uniqueCharacters =
    new Set(alphabet);

  if (
    uniqueCharacters.size
    !== alphabet.length
  ) {
    throw new Error(
      "El alfabeto no debe contener caracteres repetidos.",
    );
  }
}

export function generateSecureRandomString(
  length: number,
  alphabet: string,
): string {
  validatePositiveInteger(
    length,
    "length",
  );

  validateAlphabet(alphabet);

  let result = "";

  for (
    let index = 0;
    index < length;
    index += 1
  ) {
    const randomIndex =
      randomInt(0, alphabet.length);

    result += alphabet[randomIndex];
  }

  return result;
}

export function generateVerificationCode():
  string {
  return generateSecureRandomString(
    VERIFICATION_CODE_RULES.length,
    VERIFICATION_CODE_RULES.alphabet,
  );
}

export function generateOpaqueToken(
  byteLength = DEFAULT_TOKEN_BYTES,
): string {
  validatePositiveInteger(
    byteLength,
    "byteLength",
  );

  return randomBytes(
    byteLength,
  ).toString("base64url");
}

export function generateRandomHex(
  byteLength: number,
): string {
  validatePositiveInteger(
    byteLength,
    "byteLength",
  );

  return randomBytes(
    byteLength,
  ).toString("hex");
}

export function createSecretHash(
  secret: string,
  pepper: string,
): string {
  if (!secret) {
    throw new Error(
      "No se puede proteger un secreto vacío.",
    );
  }

  if (pepper.length < 32) {
    throw new Error(
      "El pepper debe tener al menos 32 caracteres.",
    );
  }

  return createHmac(
    "sha256",
    pepper,
  )
    .update(secret, "utf8")
    .digest("hex");
}

export function verifySecretHash(
  secret: string,
  expectedHash: string,
  pepper: string,
): boolean {
  if (
    !secret
    || expectedHash.length
      !== SHA_256_HEX_LENGTH
    || !/^[a-f0-9]{64}$/iu.test(
      expectedHash,
    )
  ) {
    return false;
  }

  const calculatedHash =
    createSecretHash(
      secret,
      pepper,
    );

  const calculatedBuffer =
    Buffer.from(
      calculatedHash,
      "hex",
    );

  const expectedBuffer =
    Buffer.from(
      expectedHash,
      "hex",
    );

  if (
    calculatedBuffer.length
    !== expectedBuffer.length
  ) {
    return false;
  }

  return timingSafeEqual(
    calculatedBuffer,
    expectedBuffer,
  );
}

export function generateRandomInteger(
  minimum: number,
  maximumExclusive: number,
): number {
  if (
    !Number.isSafeInteger(minimum)
    || !Number.isSafeInteger(
      maximumExclusive,
    )
    || minimum < 0
    || maximumExclusive <= minimum
  ) {
    throw new Error(
      "El intervalo numérico solicitado no es válido.",
    );
  }

  return randomInt(
    minimum,
    maximumExclusive,
  );
}