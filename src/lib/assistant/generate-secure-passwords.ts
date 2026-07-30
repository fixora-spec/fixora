import {
  randomInt,
} from "node:crypto";

export const MINIMUM_SECURE_PASSWORD_LENGTH =
  8;

export const MAXIMUM_SECURE_PASSWORD_LENGTH =
  30;

export const GENERATED_PASSWORD_COUNT =
  5;

const UPPERCASE_CHARACTERS =
  "ABCDEFGHJKLMNPQRSTUVWXYZ";

const LOWERCASE_CHARACTERS =
  "abcdefghijkmnopqrstuvwxyz";

const NUMBER_CHARACTERS =
  "23456789";

const SYMBOL_CHARACTERS =
  "!@#$%&*+-=?_";

const ALL_PASSWORD_CHARACTERS =
  [
    UPPERCASE_CHARACTERS,
    LOWERCASE_CHARACTERS,
    NUMBER_CHARACTERS,
    SYMBOL_CHARACTERS,
  ].join("");

export type SecurePasswordGenerationResult = {
  passwords:
    readonly string[];

  passwordLength:
    number;

  passwordCount:
    typeof GENERATED_PASSWORD_COUNT;
};

function assertValidCharacterSet(
  characterSet: string,
): void {
  if (
    characterSet.length === 0
  ) {
    throw new Error(
      "El conjunto de caracteres no puede estar vacío.",
    );
  }
}

function getSecureRandomCharacter(
  characterSet: string,
): string {
  assertValidCharacterSet(
    characterSet,
  );

  const characterIndex =
    randomInt(
      0,
      characterSet.length,
    );

  const selectedCharacter =
    characterSet[
      characterIndex
    ];

  if (
    selectedCharacter
    === undefined
  ) {
    throw new Error(
      "No se pudo seleccionar un carácter seguro.",
    );
  }

  return selectedCharacter;
}

function secureShuffle(
  characters:
    readonly string[],
): string[] {
  const shuffledCharacters =
    [...characters];

  for (
    let currentIndex =
      shuffledCharacters.length - 1;

    currentIndex > 0;

    currentIndex -= 1
  ) {
    const randomIndex =
      randomInt(
        0,
        currentIndex + 1,
      );

    const currentCharacter =
      shuffledCharacters[
        currentIndex
      ];

    const randomCharacter =
      shuffledCharacters[
        randomIndex
      ];

    if (
      currentCharacter
        === undefined
      || randomCharacter
        === undefined
    ) {
      throw new Error(
        "No se pudo mezclar la contraseña de forma segura.",
      );
    }

    shuffledCharacters[
      currentIndex
    ] =
      randomCharacter;

    shuffledCharacters[
      randomIndex
    ] =
      currentCharacter;
  }

  return shuffledCharacters;
}

function createSecurePassword(
  passwordLength:
    number,
): string {
  const characters:
    string[] = [
      getSecureRandomCharacter(
        UPPERCASE_CHARACTERS,
      ),

      getSecureRandomCharacter(
        LOWERCASE_CHARACTERS,
      ),

      getSecureRandomCharacter(
        NUMBER_CHARACTERS,
      ),

      getSecureRandomCharacter(
        SYMBOL_CHARACTERS,
      ),
    ];

  while (
    characters.length
    < passwordLength
  ) {
    characters.push(
      getSecureRandomCharacter(
        ALL_PASSWORD_CHARACTERS,
      ),
    );
  }

  return secureShuffle(
    characters,
  ).join("");
}

export function isSecurePasswordLength(
  value: unknown,
): value is number {
  return (
    typeof value === "number"
    && Number.isInteger(
      value,
    )
    && value
      >= MINIMUM_SECURE_PASSWORD_LENGTH
    && value
      <= MAXIMUM_SECURE_PASSWORD_LENGTH
  );
}

export function assertSecurePasswordLength(
  passwordLength:
    number,
): void {
  if (
    isSecurePasswordLength(
      passwordLength,
    )
  ) {
    return;
  }

  throw new RangeError(
    `La longitud debe estar entre ${MINIMUM_SECURE_PASSWORD_LENGTH} y ${MAXIMUM_SECURE_PASSWORD_LENGTH} caracteres.`,
  );
}

export function generateSecurePasswords(
  passwordLength:
    number,
): SecurePasswordGenerationResult {
  assertSecurePasswordLength(
    passwordLength,
  );

  const generatedPasswords =
    new Set<string>();

  while (
    generatedPasswords.size
    < GENERATED_PASSWORD_COUNT
  ) {
    generatedPasswords.add(
      createSecurePassword(
        passwordLength,
      ),
    );
  }

  return {
    passwords:
      Array.from(
        generatedPasswords,
      ),

    passwordLength,

    passwordCount:
      GENERATED_PASSWORD_COUNT,
  };
}