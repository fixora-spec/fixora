import "server-only";

import {
  EMAIL_RULES,
  PERSON_NAME_RULES,
  VERIFICATION_CODE_RULES,
} from "@/config/auth.config";

import {
  isAccountRole,
} from "@/types/account";

import type {
  AccountRole,
} from "@/types/account";

import type {
  AuthFieldError,
  EmailVerificationRequest,
  PasswordChangeRequest,
  PasswordResetCodeVerificationRequest,
  PasswordResetRequest,
  SignInRequest,
  UserRegistrationRequest,
} from "@/types/auth";

import type {
  Locale,
} from "@/types/locale";

import {
  validatePassword,
} from "./password";

import {
  validateUsername,
} from "./username";

const SUPPORTED_AUTH_LOCALES = [
  "es",
  "en",
] as const satisfies readonly Locale[];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const RESET_TOKEN_PATTERN =
  /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;

const EMAIL_LOCAL_PART_PATTERN =
  /^[^\s@<>(),:;"\[\]\\]+$/u;

const EMAIL_DOMAIN_PATTERN =
  /^(?=.{1,255}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))+$/u;

const MINIMUM_RESET_TOKEN_LENGTH = 32;
const MAXIMUM_RESET_TOKEN_LENGTH = 4_096;
const MAXIMUM_PASSWORD_INPUT_LENGTH = 128;
const MAXIMUM_VERIFICATION_CODE_INPUT_LENGTH = 64;

type UnknownRecord = Record<string, unknown>;

export class AuthValidationError extends Error {
  public readonly fieldErrors: readonly AuthFieldError[];

  public constructor(
    message: string,
    fieldErrors: readonly AuthFieldError[] = [],
  ) {
    super(message);

    this.name = "AuthValidationError";
    this.fieldErrors = Object.freeze(
      fieldErrors.map((fieldError) => Object.freeze({ ...fieldError })),
    );
  }
}

function isUnknownRecord(value: unknown): value is UnknownRecord {
  return (
    typeof value === "object"
    && value !== null
    && !Array.isArray(value)
  );
}

function requireObject(value: unknown): UnknownRecord {
  if (!isUnknownRecord(value)) {
    throw new AuthValidationError(
      "La solicitud debe contener un objeto válido.",
    );
  }

  return value;
}

/*
 * AuthFieldName todavía no incluye algunos nombres internos como
 * accountId, accountRole, resetToken y locale. Este método conserva
 * el nombre que ya utilizan las respuestas de la API.
 */
function asAuthFieldName(field: string): AuthFieldError["field"] {
  return field as AuthFieldError["field"];
}

function createRequiredFieldError(
  field: AuthFieldError["field"],
): AuthValidationError {
  return new AuthValidationError(
    "Falta un campo obligatorio.",
    [
      {
        field,
        code: "FIELD_REQUIRED",
      },
    ],
  );
}

function readRequiredString(
  record: UnknownRecord,
  key: string,
  field: AuthFieldError["field"],
  maximumLength: number,
): string {
  const value = record[key];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw createRequiredFieldError(field);
  }

  const normalizedValue = value.trim();

  if (
    normalizedValue.length > maximumLength
    || /[\r\n\0]/u.test(normalizedValue)
  ) {
    throw new AuthValidationError(
      "El campo proporcionado no es válido.",
      [
        {
          field,
          code: "INVALID_REQUEST",
        },
      ],
    );
  }

  return normalizedValue;
}

function readRequiredPassword(
  record: UnknownRecord,
  key: "password" | "passwordConfirmation",
): string {
  const value = record[key];

  if (typeof value !== "string" || value.length === 0) {
    throw createRequiredFieldError(key);
  }

  if (
    value.length > MAXIMUM_PASSWORD_INPUT_LENGTH
    || /[\r\n\0]/u.test(value)
  ) {
    throw new AuthValidationError(
      "La contraseña no es válida.",
      [
        {
          field: key,
          code: "INVALID_PASSWORD",
        },
      ],
    );
  }

  // La contraseña se conserva exactamente como fue escrita.
  return value;
}

function normalizeInternalWhitespace(value: string): string {
  return value
    .trim()
    .replace(/\s+/gu, " ");
}

export function normalizePersonName(value: string): string {
  return normalizeInternalWhitespace(value.normalize("NFC"));
}

export function normalizeEmail(value: string): string {
  return value
    .trim()
    .normalize("NFC")
    .toLowerCase();
}

export function normalizeVerificationCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/gu, "");
}

export function validatePersonName(
  value: string,
  field: "firstNames" | "lastNames",
): string {
  const normalizedValue = normalizePersonName(value);
  const maximumLength = field === "firstNames"
    ? PERSON_NAME_RULES.firstNamesMaximumLength
    : PERSON_NAME_RULES.lastNamesMaximumLength;

  const beginsOrEndsWithSeparator =
    /^[\s'’\-]|[\s'’\-]$/u.test(normalizedValue);

  if (
    normalizedValue.length < PERSON_NAME_RULES.minimumLength
    || normalizedValue.length > maximumLength
    || !PERSON_NAME_RULES.allowedPattern.test(normalizedValue)
    || !/\p{L}/u.test(normalizedValue)
    || beginsOrEndsWithSeparator
  ) {
    throw new AuthValidationError(
      "El nombre proporcionado no es válido.",
      [
        {
          field,
          code: "INVALID_NAME",
        },
      ],
    );
  }

  return normalizedValue;
}

export function validateEmailAddress(value: string): string {
  const normalizedEmail = normalizeEmail(value);
  const firstAtIndex = normalizedEmail.indexOf("@");
  const lastAtIndex = normalizedEmail.lastIndexOf("@");

  if (
    normalizedEmail.length < EMAIL_RULES.minimumLength
    || normalizedEmail.length > EMAIL_RULES.maximumLength
    || firstAtIndex <= 0
    || firstAtIndex !== lastAtIndex
    || firstAtIndex === normalizedEmail.length - 1
  ) {
    throwInvalidEmail();
  }

  const localPart = normalizedEmail.slice(0, firstAtIndex);
  const domain = normalizedEmail.slice(firstAtIndex + 1);

  if (
    localPart.length > EMAIL_RULES.localPartMaximumLength
    || domain.length > EMAIL_RULES.domainMaximumLength
    || localPart.startsWith(".")
    || localPart.endsWith(".")
    || localPart.includes("..")
    || !EMAIL_LOCAL_PART_PATTERN.test(localPart)
    || !EMAIL_DOMAIN_PATTERN.test(domain)
    || !EMAIL_RULES.formatPattern.test(normalizedEmail)
  ) {
    throwInvalidEmail();
  }

  return normalizedEmail;
}

function throwInvalidEmail(): never {
  throw new AuthValidationError(
    "El correo electrónico no es válido.",
    [
      {
        field: "email",
        code: "INVALID_EMAIL",
      },
    ],
  );
}

export function validateAuthLocale(value: unknown): Locale {
  if (
    typeof value !== "string"
    || !SUPPORTED_AUTH_LOCALES.includes(value as Locale)
  ) {
    throw new AuthValidationError(
      "El idioma solicitado no es válido.",
      [
        {
          field: asAuthFieldName("locale"),
          code: "INVALID_REQUEST",
        },
      ],
    );
  }

  return value as Locale;
}

export function validateAccountRole(value: unknown): AccountRole {
  if (!isAccountRole(value)) {
    throw new AuthValidationError(
      "El tipo de cuenta solicitado no es válido.",
      [
        {
          field: asAuthFieldName("accountRole"),
          code: "INVALID_REQUEST",
        },
      ],
    );
  }

  return value;
}

export function validateVerificationCode(value: string): string {
  if (
    typeof value !== "string"
    || value.length > MAXIMUM_VERIFICATION_CODE_INPUT_LENGTH
  ) {
    throwInvalidVerificationCode();
  }

  const normalizedCode = normalizeVerificationCode(value);

  if (!VERIFICATION_CODE_RULES.formatPattern.test(normalizedCode)) {
    throwInvalidVerificationCode();
  }

  return normalizedCode;
}

function throwInvalidVerificationCode(): never {
  throw new AuthValidationError(
    "El código de verificación no es válido.",
    [
      {
        field: "code",
        code: "INVALID_VERIFICATION_CODE",
      },
    ],
  );
}

export function validateUserRegistrationRequest(
  input: unknown,
): UserRegistrationRequest {
  const record = requireObject(input);

  const firstNames = validatePersonName(
    readRequiredString(
      record,
      "firstNames",
      "firstNames",
      PERSON_NAME_RULES.firstNamesMaximumLength,
    ),
    "firstNames",
  );

  const lastNames = validatePersonName(
    readRequiredString(
      record,
      "lastNames",
      "lastNames",
      PERSON_NAME_RULES.lastNamesMaximumLength,
    ),
    "lastNames",
  );

  const usernameValue = readRequiredString(
    record,
    "username",
    "username",
    256,
  );
  const usernameValidation = validateUsername(usernameValue);

  if (!usernameValidation.valid) {
    throw new AuthValidationError(
      "El nombre de usuario no es válido.",
      [
        {
          field: "username",
          code: "INVALID_USERNAME",
        },
      ],
    );
  }

  const email = validateEmailAddress(
    readRequiredString(
      record,
      "email",
      "email",
      EMAIL_RULES.maximumLength,
    ),
  );

  const password = readRequiredPassword(record, "password");
  const passwordConfirmation = readRequiredPassword(
    record,
    "passwordConfirmation",
  );

  if (password !== passwordConfirmation) {
    throw new AuthValidationError(
      "Las contraseñas no coinciden.",
      [
        {
          field: "passwordConfirmation",
          code: "PASSWORDS_DO_NOT_MATCH",
        },
      ],
    );
  }

  const passwordValidation = validatePassword(password, "USER");

  if (!passwordValidation.valid) {
    throw new AuthValidationError(
      "La contraseña no cumple los requisitos de seguridad.",
      [
        {
          field: "password",
          code: "INVALID_PASSWORD",
        },
      ],
    );
  }

  return {
    firstNames,
    lastNames,
    username: usernameValidation.value,
    email,
    password,
    passwordConfirmation,
    locale: validateAuthLocale(record.locale),
  };
}

export function validateSignInRequest(input: unknown): SignInRequest {
  const record = requireObject(input);

  return {
    email: validateEmailAddress(
      readRequiredString(
        record,
        "email",
        "email",
        EMAIL_RULES.maximumLength,
      ),
    ),
    password: readRequiredPassword(record, "password"),
    locale: validateAuthLocale(record.locale),
  };
}

export function validateEmailVerificationRequest(
  input: unknown,
): EmailVerificationRequest {
  const record = requireObject(input);
  const accountIdField = asAuthFieldName("accountId");
  const accountId = readRequiredString(
    record,
    "accountId",
    accountIdField,
    36,
  );

  if (!UUID_PATTERN.test(accountId)) {
    throw new AuthValidationError(
      "El identificador de la cuenta no es válido.",
      [
        {
          field: accountIdField,
          code: "INVALID_REQUEST",
        },
      ],
    );
  }

  return {
    accountId: accountId.toLowerCase(),
    code: validateVerificationCode(
      readRequiredString(
        record,
        "code",
        "code",
        MAXIMUM_VERIFICATION_CODE_INPUT_LENGTH,
      ),
    ),
    locale: validateAuthLocale(record.locale),
  };
}

export function validatePasswordResetRequest(
  input: unknown,
): PasswordResetRequest {
  const record = requireObject(input);

  return {
    email: validateEmailAddress(
      readRequiredString(
        record,
        "email",
        "email",
        EMAIL_RULES.maximumLength,
      ),
    ),
    accountRole: validateAccountRole(record.accountRole),
    locale: validateAuthLocale(record.locale),
  };
}

export function validatePasswordResetCodeRequest(
  input: unknown,
): PasswordResetCodeVerificationRequest {
  const record = requireObject(input);

  return {
    email: validateEmailAddress(
      readRequiredString(
        record,
        "email",
        "email",
        EMAIL_RULES.maximumLength,
      ),
    ),
    accountRole: validateAccountRole(record.accountRole),
    code: validateVerificationCode(
      readRequiredString(
        record,
        "code",
        "code",
        MAXIMUM_VERIFICATION_CODE_INPUT_LENGTH,
      ),
    ),
    locale: validateAuthLocale(record.locale),
  };
}

export function validatePasswordChangeRequest(
  input: unknown,
): PasswordChangeRequest {
  const record = requireObject(input);
  const resetTokenField = asAuthFieldName("resetToken");
  const resetToken = readRequiredString(
    record,
    "resetToken",
    resetTokenField,
    MAXIMUM_RESET_TOKEN_LENGTH,
  );

  if (
    resetToken.length < MINIMUM_RESET_TOKEN_LENGTH
    || !RESET_TOKEN_PATTERN.test(resetToken)
  ) {
    throw new AuthValidationError(
      "El token de recuperación no es válido.",
      [
        {
          field: resetTokenField,
          code: "INVALID_RESET_TOKEN",
        },
      ],
    );
  }

  const password = readRequiredPassword(record, "password");
  const passwordConfirmation = readRequiredPassword(
    record,
    "passwordConfirmation",
  );

  if (password !== passwordConfirmation) {
    throw new AuthValidationError(
      "Las contraseñas no coinciden.",
      [
        {
          field: "passwordConfirmation",
          code: "PASSWORDS_DO_NOT_MATCH",
        },
      ],
    );
  }

  const passwordValidation = validatePassword(password, "USER");

  if (!passwordValidation.valid) {
    throw new AuthValidationError(
      "La contraseña no cumple los requisitos de seguridad.",
      [
        {
          field: "password",
          code: "INVALID_PASSWORD",
        },
      ],
    );
  }

  return {
    resetToken,
    password,
    passwordConfirmation,
    locale: validateAuthLocale(record.locale),
  };
}

export function isAuthValidationError(
  error: unknown,
): error is AuthValidationError {
  return error instanceof AuthValidationError;
}