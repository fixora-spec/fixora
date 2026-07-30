import {
  USERNAME_RULES,
} from "@/config/auth.config";

const USERNAME_SIMILARITY_THRESHOLD =
  0.88;

const SHORT_USERNAME_MINIMUM_LENGTH =
  5;

const VISUAL_EQUIVALENCES:
  Readonly<Record<string, string>> = {
    "0": "o",
    "1": "l",
    "3": "e",
    "4": "a",
    "5": "s",
    "7": "t",
    "8": "b",
  };

export type UsernameValidationIssue =
  | "REQUIRED"
  | "TOO_SHORT"
  | "TOO_LONG"
  | "INVALID_CHARACTERS"
  | "INVALID_NORMALIZED_VALUE";

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

function removeDiacritics(
  value: string,
): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "");
}

function replaceVisualEquivalences(
  value: string,
): string {
  return [...value]
    .map(
      (character) =>
        VISUAL_EQUIVALENCES[
          character
        ] ?? character,
    )
    .join("");
}

function ensureMaximumCandidates(
  value: number | undefined,
): number {
  if (
    typeof value === "undefined"
  ) {
    return 12;
  }

  if (
    !Number.isSafeInteger(value)
    || value < 1
    || value > 50
  ) {
    throw new Error(
      "maximumCandidates debe estar entre 1 y 50.",
    );
  }

  return value;
}

function sanitizeCandidateBase(
  value: string,
): string {
  return removeDiacritics(value)
    .replace(/[^\p{L}\p{N}._-]/gu, "")
    .slice(
      0,
      USERNAME_RULES.maximumLength,
    );
}

function createNumericSeed(
  value: string,
): number {
  let seed = 0;

  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    seed =
      (
        seed * 31
        + value.charCodeAt(index)
      ) % 10_000;
  }

  return seed;
}

function appendCandidate(
  candidates: string[],
  seenNormalizedValues: Set<string>,
  candidate: string,
  maximumCandidates: number,
): void {
  if (
    candidates.length
    >= maximumCandidates
  ) {
    return;
  }

  const sanitizedCandidate =
    sanitizeCandidateBase(
      candidate,
    );

  const validation =
    validateUsername(
      sanitizedCandidate,
    );

  if (!validation.valid) {
    return;
  }

  if (
    seenNormalizedValues.has(
      validation.normalizedValue,
    )
  ) {
    return;
  }

  seenNormalizedValues.add(
    validation.normalizedValue,
  );

  candidates.push(
    validation.value,
  );
}

export function normalizeUsername(
  username: string,
): string {
  return removeDiacritics(
    username.trim(),
  )
    .toLowerCase()
    .replace(
      USERNAME_RULES
        .normalizationPattern,
      "",
    )
    .replace(/[^a-z0-9]/gu, "");
}

export function createUsernameComparisonSkeleton(
  username: string,
): string {
  return replaceVisualEquivalences(
    normalizeUsername(username),
  );
}

export function validateUsername(
  username: string,
): UsernameValidationResult {
  const value =
    username.trim();

  const normalizedValue =
    normalizeUsername(value);

  const comparisonSkeleton =
    createUsernameComparisonSkeleton(
      value,
    );

  const issues:
    UsernameValidationIssue[] = [];

  if (value.length === 0) {
    issues.push("REQUIRED");
  }

  if (
    value.length > 0
    && value.length
      < USERNAME_RULES.minimumLength
  ) {
    issues.push("TOO_SHORT");
  }

  if (
    value.length
    > USERNAME_RULES.maximumLength
  ) {
    issues.push("TOO_LONG");
  }

  if (
    value.length > 0
    && !USERNAME_RULES
      .allowedPattern
      .test(value)
  ) {
    issues.push(
      "INVALID_CHARACTERS",
    );
  }

  if (
    normalizedValue.length
      < USERNAME_RULES.minimumLength
    || normalizedValue.length
      > USERNAME_RULES.maximumLength
  ) {
    issues.push(
      "INVALID_NORMALIZED_VALUE",
    );
  }

  return {
    valid:
      issues.length === 0,

    value,
    normalizedValue,
    comparisonSkeleton,
    issues,
  };
}

export function calculateLevenshteinDistance(
  firstValue: string,
  secondValue: string,
): number {
  if (firstValue === secondValue) {
    return 0;
  }

  if (firstValue.length === 0) {
    return secondValue.length;
  }

  if (secondValue.length === 0) {
    return firstValue.length;
  }

  let previousRow =
    Array.from(
      {
        length:
          secondValue.length + 1,
      },
      (_, index) => index,
    );

  for (
    let firstIndex = 1;
    firstIndex
      <= firstValue.length;
    firstIndex += 1
  ) {
    const currentRow =
      [firstIndex];

    for (
      let secondIndex = 1;
      secondIndex
        <= secondValue.length;
      secondIndex += 1
    ) {
      const substitutionCost =
        firstValue[
          firstIndex - 1
        ]
        === secondValue[
          secondIndex - 1
        ]
          ? 0
          : 1;

      currentRow[secondIndex] =
        Math.min(
          (currentRow[
            secondIndex - 1
          ] ?? 0) + 1,

          (previousRow[
            secondIndex
          ] ?? 0) + 1,

          (previousRow[
            secondIndex - 1
          ] ?? 0)
            + substitutionCost,
        );
    }

    previousRow =
      currentRow;
  }

  return (
    previousRow[
      secondValue.length
    ] ?? 0
  );
}

export function calculateUsernameSimilarity(
  firstUsername: string,
  secondUsername: string,
): UsernameSimilarityResult {
  const firstNormalized =
    normalizeUsername(
      firstUsername,
    );

  const secondNormalized =
    normalizeUsername(
      secondUsername,
    );

  const firstSkeleton =
    createUsernameComparisonSkeleton(
      firstUsername,
    );

  const secondSkeleton =
    createUsernameComparisonSkeleton(
      secondUsername,
    );

  const exact =
    firstNormalized.length > 0
    && firstNormalized
      === secondNormalized;

  const sameSkeleton =
    firstSkeleton.length > 0
    && firstSkeleton
      === secondSkeleton;

  const maximumLength =
    Math.max(
      firstSkeleton.length,
      secondSkeleton.length,
    );

  const distance =
    calculateLevenshteinDistance(
      firstSkeleton,
      secondSkeleton,
    );

  const similarity =
    maximumLength === 0
      ? 1
      : 1 - distance
        / maximumLength;

  const minimumLength =
    Math.min(
      firstSkeleton.length,
      secondSkeleton.length,
    );

  let similar =
    exact || sameSkeleton;

  if (
    !similar
    && minimumLength
      >= SHORT_USERNAME_MINIMUM_LENGTH
  ) {
    const maximumAllowedDistance =
      minimumLength >= 8
        ? 2
        : 1;

    similar =
      distance
        <= maximumAllowedDistance
      && similarity
        >= USERNAME_SIMILARITY_THRESHOLD;
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
  const maximumCandidates =
    ensureMaximumCandidates(
      input.maximumCandidates,
    );

  const requestedBase =
    sanitizeCandidateBase(
      input.requestedUsername,
    );

  const firstNameBase =
    sanitizeCandidateBase(
      input.firstNames
      ?.trim()
      .split(/\s+/u)[0]
      ?? "",
    );

  const seed =
    createNumericSeed(
      `${requestedBase}:${firstNameBase}`,
    );

  const candidates:
    string[] = [];

  const seenNormalizedValues =
    new Set<string>();

  const suffixes = [
    String(
      (seed % 90) + 10,
    ),

    String(
      (seed % 900) + 100,
    ),

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
      `${requestedBase}${suffix}`,
      maximumCandidates,
    );

    appendCandidate(
      candidates,
      seenNormalizedValues,
      `${requestedBase}_${suffix}`,
      maximumCandidates,
    );
  }

  if (firstNameBase) {
    appendCandidate(
      candidates,
      seenNormalizedValues,
      `${firstNameBase}${requestedBase}`,
      maximumCandidates,
    );

    appendCandidate(
      candidates,
      seenNormalizedValues,
      `${requestedBase}${firstNameBase}`,
      maximumCandidates,
    );

    appendCandidate(
      candidates,
      seenNormalizedValues,
      `${firstNameBase}${seed % 100}`,
      maximumCandidates,
    );
  }

  let incrementalSuffix = 1;

  while (
    candidates.length
      < maximumCandidates
    && incrementalSuffix <= 999
  ) {
    appendCandidate(
      candidates,
      seenNormalizedValues,
      `${requestedBase}${incrementalSuffix}`,
      maximumCandidates,
    );

    incrementalSuffix += 1;
  }

  return candidates;
}