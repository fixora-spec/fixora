import {
  USERNAME_RULES,
} from "@/config/auth.config";

const USERNAME_SIMILARITY_THRESHOLD = 0.88;
const SHORT_USERNAME_MINIMUM_LENGTH = 5;
const DEFAULT_MAXIMUM_CANDIDATES = 12;
const ABSOLUTE_MAXIMUM_CANDIDATES = 50;
const MAXIMUM_SIMILARITY_INPUT_LENGTH = 256;

const VISUAL_EQUIVALENCES: Readonly<Record<string, string>> = Object.freeze({
  "0": "o",
  "1": "l",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
});

export type UsernameValidationIssue =
  | "REQUIRED"
  | "TOO_SHORT"
  | "TOO_LONG"
  | "INVALID_CHARACTERS"
  | "INVALID_NORMALIZED_VALUE"
  | "RESERVED";

export type UsernameValidationResult = {
  valid: boolean;
  value: string;
  normalizedValue: string;
  comparisonSkeleton: string;
  issues: readonly UsernameValidationIssue[];
};

export type UsernameSimilarityResult = {
  similar: boolean;
  exact: boolean;
  sameSkeleton: boolean;
  distance: number;
  similarity: number;
};

export type UsernameCandidateInput = {
  requestedUsername: string;
  firstNames?: string;
  maximumCandidates?: number;
};

function requireString(value: string, fieldName: string): string {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} debe ser una cadena de texto.`);
  }

  return value;
}

function removeDiacritics(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "");
}

function replaceVisualEquivalences(value: string): string {
  return [...value]
    .map((character) => VISUAL_EQUIVALENCES[character] ?? character)
    .join("");
}

function ensureMaximumCandidates(value: number | undefined): number {
  if (typeof value === "undefined") {
    return DEFAULT_MAXIMUM_CANDIDATES;
  }

  if (
    !Number.isSafeInteger(value)
    || value < 1
    || value > ABSOLUTE_MAXIMUM_CANDIDATES
  ) {
    throw new Error(
      `maximumCandidates debe estar entre 1 y ${ABSOLUTE_MAXIMUM_CANDIDATES}.`,
    );
  }

  return value;
}

function sanitizeCandidateBase(value: string): string {
  return removeDiacritics(requireString(value, "value").trim())
    .replace(/[^\p{L}\p{N}._-]/gu, "")
    .slice(0, USERNAME_RULES.maximumLength);
}

function createNumericSeed(value: string): number {
  let seed = 0;

  for (const character of value) {
    seed = (seed * 31 + (character.codePointAt(0) ?? 0)) % 10_000;
  }

  return seed;
}

function fitCandidateParts(
  base: string,
  suffix: string,
  separator = "",
): string {
  const maximumBaseLength = Math.max(
    0,
    USERNAME_RULES.maximumLength - separator.length - suffix.length,
  );

  return `${base.slice(0, maximumBaseLength)}${separator}${suffix}`;
}

function appendCandidate(
  candidates: string[],
  seenNormalizedValues: Set<string>,
  candidate: string,
  maximumCandidates: number,
): void {
  if (candidates.length >= maximumCandidates) {
    return;
  }

  const sanitizedCandidate = sanitizeCandidateBase(candidate);
  const validation = validateUsername(sanitizedCandidate);

  if (
    !validation.valid
    || seenNormalizedValues.has(validation.normalizedValue)
  ) {
    return;
  }

  seenNormalizedValues.add(validation.normalizedValue);
  candidates.push(validation.value);
}

export function normalizeUsername(username: string): string {
  return removeDiacritics(requireString(username, "username").trim())
    .toLowerCase()
    .replace(USERNAME_RULES.normalizationPattern, "")
    .replace(/[^a-z0-9]/gu, "");
}

export function createUsernameComparisonSkeleton(
  username: string,
): string {
  return replaceVisualEquivalences(normalizeUsername(username));
}

const RESERVED_NORMALIZED_VALUES = new Set<string>(
  USERNAME_RULES.reservedNormalizedValues.map((value) =>
    normalizeUsername(value),
  ),
);

const RESERVED_COMPARISON_SKELETONS = new Set<string>(
  USERNAME_RULES.reservedNormalizedValues.map((value) =>
    createUsernameComparisonSkeleton(value),
  ),
);

function isReservedUsername(
  normalizedValue: string,
  comparisonSkeleton: string,
): boolean {
  return (
    RESERVED_NORMALIZED_VALUES.has(normalizedValue)
    || RESERVED_COMPARISON_SKELETONS.has(comparisonSkeleton)
  );
}

export function validateUsername(
  username: string,
): UsernameValidationResult {
  const rawValue = requireString(username, "username");
  const value = rawValue.trim().normalize("NFC");
  const normalizedValue = normalizeUsername(value);
  const comparisonSkeleton = createUsernameComparisonSkeleton(value);
  const issues: UsernameValidationIssue[] = [];

  if (value.length === 0) {
    issues.push("REQUIRED");
  }

  if (
    value.length > 0
    && value.length < USERNAME_RULES.minimumLength
  ) {
    issues.push("TOO_SHORT");
  }

  if (value.length > USERNAME_RULES.maximumLength) {
    issues.push("TOO_LONG");
  }

  if (
    value.length > 0
    && !USERNAME_RULES.allowedPattern.test(value)
  ) {
    issues.push("INVALID_CHARACTERS");
  }

  if (
    normalizedValue.length < USERNAME_RULES.minimumLength
    || normalizedValue.length > USERNAME_RULES.maximumLength
  ) {
    issues.push("INVALID_NORMALIZED_VALUE");
  }

  if (
    normalizedValue.length > 0
    && isReservedUsername(normalizedValue, comparisonSkeleton)
  ) {
    issues.push("RESERVED");
  }

  return {
    valid: issues.length === 0,
    value,
    normalizedValue,
    comparisonSkeleton,
    issues: Object.freeze([...issues]),
  };
}

function validateSimilarityValue(value: string, fieldName: string): string {
  const normalizedValue = requireString(value, fieldName);

  if (normalizedValue.length > MAXIMUM_SIMILARITY_INPUT_LENGTH) {
    throw new Error(
      `${fieldName} no puede superar ${MAXIMUM_SIMILARITY_INPUT_LENGTH} caracteres.`,
    );
  }

  return normalizedValue;
}

export function calculateLevenshteinDistance(
  firstValue: string,
  secondValue: string,
): number {
  const firstCharacters = [
    ...validateSimilarityValue(firstValue, "firstValue"),
  ];
  const secondCharacters = [
    ...validateSimilarityValue(secondValue, "secondValue"),
  ];

  if (firstCharacters.join("") === secondCharacters.join("")) {
    return 0;
  }

  if (firstCharacters.length === 0) {
    return secondCharacters.length;
  }

  if (secondCharacters.length === 0) {
    return firstCharacters.length;
  }

  // Mantiene la fila más corta para limitar el uso de memoria.
  if (secondCharacters.length > firstCharacters.length) {
    return calculateLevenshteinDistance(secondValue, firstValue);
  }

  let previousRow = Array.from(
    { length: secondCharacters.length + 1 },
    (_, index) => index,
  );

  for (
    let firstIndex = 1;
    firstIndex <= firstCharacters.length;
    firstIndex += 1
  ) {
    const currentRow = [firstIndex];

    for (
      let secondIndex = 1;
      secondIndex <= secondCharacters.length;
      secondIndex += 1
    ) {
      const substitutionCost =
        firstCharacters[firstIndex - 1]
          === secondCharacters[secondIndex - 1]
          ? 0
          : 1;

      currentRow[secondIndex] = Math.min(
        (currentRow[secondIndex - 1] ?? 0) + 1,
        (previousRow[secondIndex] ?? 0) + 1,
        (previousRow[secondIndex - 1] ?? 0) + substitutionCost,
      );
    }

    previousRow = currentRow;
  }

  return previousRow[secondCharacters.length] ?? 0;
}

export function calculateUsernameSimilarity(
  firstUsername: string,
  secondUsername: string,
): UsernameSimilarityResult {
  validateSimilarityValue(firstUsername, "firstUsername");
  validateSimilarityValue(secondUsername, "secondUsername");

  const firstNormalized = normalizeUsername(firstUsername);
  const secondNormalized = normalizeUsername(secondUsername);
  const firstSkeleton = createUsernameComparisonSkeleton(firstUsername);
  const secondSkeleton = createUsernameComparisonSkeleton(secondUsername);

  const exact = firstNormalized.length > 0
    && firstNormalized === secondNormalized;
  const sameSkeleton = firstSkeleton.length > 0
    && firstSkeleton === secondSkeleton;
  const maximumLength = Math.max(
    firstSkeleton.length,
    secondSkeleton.length,
  );
  const distance = calculateLevenshteinDistance(
    firstSkeleton,
    secondSkeleton,
  );
  const similarity = maximumLength === 0
    ? 1
    : 1 - distance / maximumLength;
  const minimumLength = Math.min(
    firstSkeleton.length,
    secondSkeleton.length,
  );

  let similar = exact || sameSkeleton;

  if (!similar && minimumLength >= SHORT_USERNAME_MINIMUM_LENGTH) {
    const maximumAllowedDistance = minimumLength >= 8 ? 2 : 1;

    similar =
      distance <= maximumAllowedDistance
      && similarity >= USERNAME_SIMILARITY_THRESHOLD;
  }

  return {
    similar,
    exact,
    sameSkeleton,
    distance,
    similarity,
  };
}

export function areUsernamesConfusinglySimilar(
  firstUsername: string,
  secondUsername: string,
): boolean {
  return calculateUsernameSimilarity(
    firstUsername,
    secondUsername,
  ).similar;
}

export function generateUsernameCandidates(
  input: UsernameCandidateInput,
): readonly string[] {
  if (!input || typeof input !== "object") {
    throw new Error("La solicitud de sugerencias no es válida.");
  }

  const maximumCandidates = ensureMaximumCandidates(
    input.maximumCandidates,
  );
  const requestedBase = sanitizeCandidateBase(input.requestedUsername);
  const firstNameBase = sanitizeCandidateBase(
    input.firstNames
      ?.trim()
      .split(/\s+/u)[0]
      ?? "",
  );
  const fallbackBase = requestedBase || firstNameBase || "usuario";
  const seed = createNumericSeed(`${requestedBase}:${firstNameBase}`);
  const candidates: string[] = [];
  const seenNormalizedValues = new Set<string>();
  const suffixes = [
    String((seed % 90) + 10),
    String((seed % 900) + 100),
    "01",
    "07",
    "21",
    "24",
    "fix",
    "plus",
  ];

  for (const suffix of suffixes) {
    appendCandidate(
      candidates,
      seenNormalizedValues,
      fitCandidateParts(fallbackBase, suffix),
      maximumCandidates,
    );
    appendCandidate(
      candidates,
      seenNormalizedValues,
      fitCandidateParts(fallbackBase, suffix, "_"),
      maximumCandidates,
    );
  }

  if (firstNameBase) {
    appendCandidate(
      candidates,
      seenNormalizedValues,
      fitCandidateParts(firstNameBase, fallbackBase),
      maximumCandidates,
    );
    appendCandidate(
      candidates,
      seenNormalizedValues,
      fitCandidateParts(fallbackBase, firstNameBase),
      maximumCandidates,
    );
    appendCandidate(
      candidates,
      seenNormalizedValues,
      fitCandidateParts(firstNameBase, String(seed % 100)),
      maximumCandidates,
    );
  }

  let incrementalSuffix = 1;

  while (
    candidates.length < maximumCandidates
    && incrementalSuffix <= 999
  ) {
    appendCandidate(
      candidates,
      seenNormalizedValues,
      fitCandidateParts(fallbackBase, String(incrementalSuffix)),
      maximumCandidates,
    );
    incrementalSuffix += 1;
  }

  return Object.freeze([...candidates]);
}