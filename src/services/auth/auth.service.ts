import {
  isAccountRole,
  isAccountStatus,
  type AccountRole,
  type AccountStatus,
} from "@/types/account";

import {
  isAuthErrorCode,
} from "@/types/auth";

import type {
  AuthApiError,
  AuthErrorCode,
  AuthFieldError,
  AuthFieldName,
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

export type AuthApiRequestOptions = {
  signal?: AbortSignal;
};

export type AuthAccountData = {
  accountId: string;

  role: AccountRole;
  status: AccountStatus;

  firstNames: string;
  lastNames: string;

  username: string;
  email: string;

  emailVerifiedAt: string | null;

  createdAt: string;
  lastSignInAt: string | null;
};

export type RegisterUserResponseData = {
  accountId: string;
  username: string;
  email: string;

  verificationExpiresAt: string;
  resendAvailableAt: string;
};

export type VerifyEmailResponseData = {
  account: AuthAccountData;
};

export type SignInResponseData = {
  account: AuthAccountData;

  session: {
    expiresAt: string;
  };
};

export type ResendVerificationCodeInput = {
  accountId: string;
  locale: Locale;
};

export type PasswordResetRequestResponseData = {
  accepted: true;

  expiresAt: string | null;
  resendAvailableAt: string | null;
};

export type PasswordResetCodeResponseData = {
  resetToken: string;
  expiresAt: string;
};

export type PasswordResetResponseData = {
  accountId: string;
};

export type UsernameAvailabilityResponseData = {
  username: string;
  normalizedUsername: string;

  available: boolean;

  reason:
    | "TAKEN"
    | "TOO_SIMILAR"
    | "INVALID"
    | null;

  suggestions: readonly string[];
};

export type UsernameSuggestionsInput = {
  username: string;
  firstNames?: string;
};

export type UsernameSuggestionsResponseData = {
  suggestions: readonly string[];
};

export type AuthSessionResponseData =
  | {
      authenticated: false;
      account: null;
      expiresAt: null;
    }
  | {
      authenticated: true;
      account: AuthAccountData;
      expiresAt: string;
    };

export type SignOutResponseData = {
  signedOut: true;
};

export class AuthApiClientError extends Error {
  public readonly code: AuthErrorCode | "UNKNOWN_ERROR";
  public readonly status: number;
  public readonly fieldErrors: readonly AuthFieldError[];
  public readonly retryAfterSeconds: number | null;

  public constructor(input: {
    code: AuthErrorCode | "UNKNOWN_ERROR";
    message: string;
    status: number;
    fieldErrors?: readonly AuthFieldError[];
    retryAfterSeconds?: number | null;
  }) {
    super(input.message);

    this.name = "AuthApiClientError";
    this.code = input.code;
    this.status = input.status;
    this.fieldErrors = Object.freeze([...(input.fieldErrors ?? [])]);
    this.retryAfterSeconds = input.retryAfterSeconds ?? null;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

type UnknownRecord = Record<string, unknown>;
type ResponseValidator<TData> = (value: unknown) => TData;

const AUTH_API_PATH_PREFIX = "/api/auth/";
const MAXIMUM_RESPONSE_BODY_BYTES = 256 * 1_024;
const REQUEST_TIMEOUT_MILLISECONDS = 30_000;
const MAXIMUM_ERROR_MESSAGE_LENGTH = 1_000;
const MAXIMUM_FIELD_ERRORS = 20;
const MAXIMUM_TEXT_VALUE_LENGTH = 2_048;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ISO_DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?Z$/u;
const AUTH_FIELD_NAMES = new Set<AuthFieldName>([
  "firstNames",
  "lastNames",
  "username",
  "email",
  "password",
  "passwordConfirmation",
  "code",
]);

function isUnknownRecord(value: unknown): value is UnknownRecord {
  return (
    typeof value === "object"
    && value !== null
    && !Array.isArray(value)
  );
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error
    && error.name === "AbortError"
  );
}

function requireRecord(value: unknown): UnknownRecord {
  if (!isUnknownRecord(value)) {
    throw new Error("INVALID_RESPONSE_RECORD");
  }

  return value;
}

function requireString(
  value: unknown,
  maximumLength = MAXIMUM_TEXT_VALUE_LENGTH,
): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > maximumLength
    || /[\r\n\0]/u.test(value)
  ) {
    throw new Error("INVALID_RESPONSE_STRING");
  }

  return value;
}

function requireUuid(value: unknown): string {
  const uuid = requireString(value, 36);

  if (!UUID_PATTERN.test(uuid)) {
    throw new Error("INVALID_RESPONSE_UUID");
  }

  return uuid.toLowerCase();
}

function requireIsoDate(value: unknown): string {
  const dateValue = requireString(value, 64);

  if (
    !ISO_DATE_PATTERN.test(dateValue)
    || Number.isNaN(Date.parse(dateValue))
  ) {
    throw new Error("INVALID_RESPONSE_DATE");
  }

  return dateValue;
}

function requireNullableIsoDate(value: unknown): string | null {
  return value === null
    ? null
    : requireIsoDate(value);
}

function requireBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new Error("INVALID_RESPONSE_BOOLEAN");
  }

  return value;
}

function requireStringArray(
  value: unknown,
  maximumItems = 20,
): readonly string[] {
  if (!Array.isArray(value) || value.length > maximumItems) {
    throw new Error("INVALID_RESPONSE_ARRAY");
  }

  return Object.freeze(
    value.map((item) => requireString(item, 128)),
  );
}

function validateAuthAccountData(value: unknown): AuthAccountData {
  const record = requireRecord(value);

  if (!isAccountRole(record.role) || !isAccountStatus(record.status)) {
    throw new Error("INVALID_RESPONSE_ACCOUNT");
  }

  return Object.freeze({
    accountId: requireUuid(record.accountId),
    role: record.role,
    status: record.status,
    firstNames: requireString(record.firstNames, 100),
    lastNames: requireString(record.lastNames, 150),
    username: requireString(record.username, 40),
    email: requireString(record.email, 320),
    emailVerifiedAt: requireNullableIsoDate(record.emailVerifiedAt),
    createdAt: requireIsoDate(record.createdAt),
    lastSignInAt: requireNullableIsoDate(record.lastSignInAt),
  });
}

function validateRegisterUserResponse(
  value: unknown,
): RegisterUserResponseData {
  const record = requireRecord(value);

  return Object.freeze({
    accountId: requireUuid(record.accountId),
    username: requireString(record.username, 40),
    email: requireString(record.email, 320),
    verificationExpiresAt: requireIsoDate(record.verificationExpiresAt),
    resendAvailableAt: requireIsoDate(record.resendAvailableAt),
  });
}

function validateVerifyEmailResponse(
  value: unknown,
): VerifyEmailResponseData {
  const record = requireRecord(value);

  return Object.freeze({
    account: validateAuthAccountData(record.account),
  });
}

function validateSignInResponse(value: unknown): SignInResponseData {
  const record = requireRecord(value);
  const session = requireRecord(record.session);

  return Object.freeze({
    account: validateAuthAccountData(record.account),
    session: Object.freeze({
      expiresAt: requireIsoDate(session.expiresAt),
    }),
  });
}

function validatePasswordResetRequestResponse(
  value: unknown,
): PasswordResetRequestResponseData {
  const record = requireRecord(value);

  if (record.accepted !== true) {
    throw new Error("INVALID_RESPONSE_ACCEPTED");
  }

  return Object.freeze({
    accepted: true,
    expiresAt: requireNullableIsoDate(record.expiresAt),
    resendAvailableAt: requireNullableIsoDate(record.resendAvailableAt),
  });
}

function validatePasswordResetCodeResponse(
  value: unknown,
): PasswordResetCodeResponseData {
  const record = requireRecord(value);
  const resetToken = requireString(record.resetToken, 2_048);

  if (!/^[A-Za-z0-9_-]+$/u.test(resetToken)) {
    throw new Error("INVALID_RESPONSE_RESET_TOKEN");
  }

  return Object.freeze({
    resetToken,
    expiresAt: requireIsoDate(record.expiresAt),
  });
}

function validatePasswordResetResponse(
  value: unknown,
): PasswordResetResponseData {
  const record = requireRecord(value);

  return Object.freeze({
    accountId: requireUuid(record.accountId),
  });
}

function validateUsernameAvailabilityResponse(
  value: unknown,
): UsernameAvailabilityResponseData {
  const record = requireRecord(value);
  const reason = record.reason;

  if (
    reason !== null
    && reason !== "TAKEN"
    && reason !== "TOO_SIMILAR"
    && reason !== "INVALID"
  ) {
    throw new Error("INVALID_RESPONSE_USERNAME_REASON");
  }

  return Object.freeze({
    username: typeof record.username === "string"
      ? record.username
      : (() => {
          throw new Error("INVALID_RESPONSE_USERNAME");
        })(),
    normalizedUsername: typeof record.normalizedUsername === "string"
      ? record.normalizedUsername
      : (() => {
          throw new Error("INVALID_RESPONSE_USERNAME");
        })(),
    available: requireBoolean(record.available),
    reason,
    suggestions: requireStringArray(record.suggestions, 10),
  });
}

function validateUsernameSuggestionsResponse(
  value: unknown,
): UsernameSuggestionsResponseData {
  const record = requireRecord(value);

  return Object.freeze({
    suggestions: requireStringArray(record.suggestions, 5),
  });
}

function validateAuthSessionResponse(
  value: unknown,
): AuthSessionResponseData {
  const record = requireRecord(value);

  if (record.authenticated === false) {
    if (record.account !== null || record.expiresAt !== null) {
      throw new Error("INVALID_RESPONSE_SESSION");
    }

    return Object.freeze({
      authenticated: false,
      account: null,
      expiresAt: null,
    });
  }

  if (record.authenticated !== true) {
    throw new Error("INVALID_RESPONSE_SESSION");
  }

  return Object.freeze({
    authenticated: true,
    account: validateAuthAccountData(record.account),
    expiresAt: requireIsoDate(record.expiresAt),
  });
}

function validateSignOutResponse(value: unknown): SignOutResponseData {
  const record = requireRecord(value);

  if (record.signedOut !== true) {
    throw new Error("INVALID_RESPONSE_SIGN_OUT");
  }

  return Object.freeze({
    signedOut: true,
  });
}

function isJsonContentType(contentType: string): boolean {
  const mediaType = contentType
    .split(";", 1)[0]
    ?.trim()
    .toLowerCase();

  return mediaType === "application/json" || mediaType?.endsWith("+json") === true;
}

async function readResponseText(response: Response): Promise<string> {
  const contentLengthHeader = response.headers.get("content-length");

  if (contentLengthHeader !== null) {
    const contentLength = Number.parseInt(contentLengthHeader, 10);

    if (
      Number.isSafeInteger(contentLength)
      && contentLength > MAXIMUM_RESPONSE_BODY_BYTES
    ) {
      throw new Error("RESPONSE_BODY_TOO_LARGE");
    }
  }

  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", {
    fatal: true,
  });
  const parts: string[] = [];
  let receivedBytes = 0;

  try {
    while (true) {
      const result = await reader.read();

      if (result.done) {
        break;
      }

      receivedBytes += result.value.byteLength;

      if (receivedBytes > MAXIMUM_RESPONSE_BODY_BYTES) {
        await reader.cancel("RESPONSE_BODY_TOO_LARGE");
        throw new Error("RESPONSE_BODY_TOO_LARGE");
      }

      parts.push(decoder.decode(result.value, {
        stream: true,
      }));
    }

    parts.push(decoder.decode());
    return parts.join("");
  } finally {
    reader.releaseLock();
  }
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (!isJsonContentType(contentType)) {
    return null;
  }

  const responseText = await readResponseText(response);

  if (!responseText.trim()) {
    return null;
  }

  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    return null;
  }
}

function parseFieldErrors(value: unknown): readonly AuthFieldError[] {
  if (typeof value === "undefined") {
    return [];
  }

  if (!Array.isArray(value) || value.length > MAXIMUM_FIELD_ERRORS) {
    return [];
  }

  const fieldErrors: AuthFieldError[] = [];

  for (const item of value) {
    if (!isUnknownRecord(item)) {
      continue;
    }

    if (
      typeof item.field !== "string"
      || !AUTH_FIELD_NAMES.has(item.field as AuthFieldName)
      || !isAuthErrorCode(item.code)
    ) {
      continue;
    }

    fieldErrors.push({
      field: item.field as AuthFieldName,
      code: item.code,
    });
  }

  return Object.freeze(fieldErrors);
}

function parseRetryAfterSeconds(value: unknown): number | null {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < 1
    || value > 86_400
  ) {
    return null;
  }

  return value;
}

function parseApiErrorPayload(value: unknown): AuthApiError["error"] | null {
  if (!isUnknownRecord(value) || value.success !== false) {
    return null;
  }

  const error = value.error;

  if (
    !isUnknownRecord(error)
    || !isAuthErrorCode(error.code)
    || typeof error.message !== "string"
  ) {
    return null;
  }

  const message = error.message.trim();

  if (
    message.length === 0
    || message.length > MAXIMUM_ERROR_MESSAGE_LENGTH
    || /[\r\n\0]/u.test(message)
  ) {
    return null;
  }

  const fieldErrors = parseFieldErrors(error.fieldErrors);
  const retryAfterSeconds = parseRetryAfterSeconds(error.retryAfterSeconds);

  return {
    code: error.code,
    message,
    ...(fieldErrors.length > 0 ? { fieldErrors } : {}),
    ...(retryAfterSeconds !== null ? { retryAfterSeconds } : {}),
  };
}

function createClientError(
  response: Response,
  payload: unknown,
): AuthApiClientError {
  const apiError = parseApiErrorPayload(payload);

  if (apiError) {
    return new AuthApiClientError({
      code: apiError.code,
      message: apiError.message,
      status: response.status,
      fieldErrors: apiError.fieldErrors,
      retryAfterSeconds: apiError.retryAfterSeconds ?? null,
    });
  }

  return new AuthApiClientError({
    code: "UNKNOWN_ERROR",
    message: response.status >= 500
      ? "El servidor no pudo completar la solicitud."
      : "No se pudo completar la solicitud.",
    status: response.status,
  });
}

function validateAuthApiUrl(url: string): string {
  if (
    typeof url !== "string"
    || !url.startsWith(AUTH_API_PATH_PREFIX)
    || url.startsWith("//")
    || /[\r\n\0]/u.test(url)
  ) {
    throw new Error("La ruta de autenticación no es válida.");
  }

  return url;
}

function createRequestHeaders(initHeaders: HeadersInit | undefined): Headers {
  const headers = new Headers(initHeaders);

  headers.set("Accept", "application/json");
  headers.set("X-Fixora-Client", "web");

  return headers;
}

async function requestAuthApi<TResponseData>(
  url: string,
  init: RequestInit,
  validateData: ResponseValidator<TResponseData>,
): Promise<TResponseData> {
  const requestUrl = validateAuthApiUrl(url);
  const abortController = new AbortController();
  const externalSignal = init.signal;
  let timedOut = false;

  const abortFromExternalSignal = (): void => {
    abortController.abort(externalSignal?.reason);
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      abortController.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener("abort", abortFromExternalSignal, {
        once: true,
      });
    }
  }

  const timeoutIdentifier = globalThis.setTimeout(() => {
    timedOut = true;
    abortController.abort();
  }, REQUEST_TIMEOUT_MILLISECONDS);

  try {
    const response = await fetch(requestUrl, {
      ...init,
      headers: createRequestHeaders(init.headers),
      cache: "no-store",
      credentials: "same-origin",
      mode: "same-origin",
      redirect: "error",
      referrerPolicy: "same-origin",
      signal: abortController.signal,
    });

    const payload = await parseResponseBody(response);

    if (!response.ok) {
      throw createClientError(response, payload);
    }

    if (
      !isUnknownRecord(payload)
      || payload.success !== true
      || !("data" in payload)
    ) {
      throw new AuthApiClientError({
        code: "UNKNOWN_ERROR",
        message: "El servidor devolvió una respuesta no válida.",
        status: response.status,
      });
    }

    try {
      return validateData(payload.data);
    } catch {
      throw new AuthApiClientError({
        code: "UNKNOWN_ERROR",
        message: "El servidor devolvió datos de autenticación no válidos.",
        status: response.status,
      });
    }
  } catch (error) {
    if (isAuthApiClientError(error)) {
      throw error;
    }

    if (externalSignal?.aborted) {
      throw error;
    }

    if (timedOut) {
      throw new AuthApiClientError({
        code: "UNKNOWN_ERROR",
        message: "La solicitud tardó demasiado tiempo en responder.",
        status: 0,
      });
    }

    if (isAbortError(error)) {
      throw error;
    }

    throw new AuthApiClientError({
      code: "UNKNOWN_ERROR",
      message: "No se pudo establecer comunicación con el servidor.",
      status: 0,
    });
  } finally {
    globalThis.clearTimeout(timeoutIdentifier);
    externalSignal?.removeEventListener("abort", abortFromExternalSignal);
  }
}

function createJsonPostRequest(
  body: unknown,
  options: AuthApiRequestOptions,
): RequestInit {
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
    signal: options.signal,
  };
}

export async function registerUser(
  input: UserRegistrationRequest,
  options: AuthApiRequestOptions = {},
): Promise<RegisterUserResponseData> {
  return requestAuthApi(
    "/api/auth/user/register",
    createJsonPostRequest(input, options),
    validateRegisterUserResponse,
  );
}

export async function verifyUserEmail(
  input: EmailVerificationRequest,
  options: AuthApiRequestOptions = {},
): Promise<VerifyEmailResponseData> {
  return requestAuthApi(
    "/api/auth/user/verify-email",
    createJsonPostRequest(input, options),
    validateVerifyEmailResponse,
  );
}

export async function signInUser(
  input: SignInRequest,
  options: AuthApiRequestOptions = {},
): Promise<SignInResponseData> {
  return requestAuthApi(
    "/api/auth/user/sign-in",
    createJsonPostRequest(input, options),
    validateSignInResponse,
  );
}

export async function signInAdmin(
  input: SignInRequest,
  options: AuthApiRequestOptions = {},
): Promise<SignInResponseData> {
  return requestAuthApi(
    "/api/auth/admin/sign-in",
    createJsonPostRequest(input, options),
    validateSignInResponse,
  );
}

export async function checkUsernameAvailability(
  username: string,
  options: AuthApiRequestOptions = {},
): Promise<UsernameAvailabilityResponseData> {
  return requestAuthApi(
    "/api/auth/username/availability",
    createJsonPostRequest(
      {
        username: username.trim(),
      },
      options,
    ),
    validateUsernameAvailabilityResponse,
  );
}

export async function getUsernameSuggestions(
  input: UsernameSuggestionsInput,
  options: AuthApiRequestOptions = {},
): Promise<UsernameSuggestionsResponseData> {
  return requestAuthApi(
    "/api/auth/username/suggestions",
    createJsonPostRequest(
      {
        username: input.username.trim(),
        ...(input.firstNames?.trim()
          ? {
              firstNames: input.firstNames.trim(),
            }
          : {}),
      },
      options,
    ),
    validateUsernameSuggestionsResponse,
  );
}

export async function resendVerificationCode(
  input: ResendVerificationCodeInput,
  options: AuthApiRequestOptions = {},
): Promise<RegisterUserResponseData> {
  return requestAuthApi(
    "/api/auth/verification/resend",
    createJsonPostRequest(input, options),
    validateRegisterUserResponse,
  );
}

export async function requestPasswordReset(
  input: PasswordResetRequest,
  options: AuthApiRequestOptions = {},
): Promise<PasswordResetRequestResponseData> {
  return requestAuthApi(
    "/api/auth/password/request-reset",
    createJsonPostRequest(input, options),
    validatePasswordResetRequestResponse,
  );
}

export async function verifyPasswordResetCode(
  input: PasswordResetCodeVerificationRequest,
  options: AuthApiRequestOptions = {},
): Promise<PasswordResetCodeResponseData> {
  return requestAuthApi(
    "/api/auth/password/verify-code",
    createJsonPostRequest(input, options),
    validatePasswordResetCodeResponse,
  );
}

export async function resetPassword(
  input: PasswordChangeRequest,
  options: AuthApiRequestOptions = {},
): Promise<PasswordResetResponseData> {
  return requestAuthApi(
    "/api/auth/password/reset",
    createJsonPostRequest(input, options),
    validatePasswordResetResponse,
  );
}

export async function getAuthSession(
  options: AuthApiRequestOptions = {},
): Promise<AuthSessionResponseData> {
  return requestAuthApi(
    "/api/auth/session",
    {
      method: "GET",
      signal: options.signal,
    },
    validateAuthSessionResponse,
  );
}

export async function signOut(
  options: AuthApiRequestOptions = {},
): Promise<SignOutResponseData> {
  return requestAuthApi(
    "/api/auth/sign-out",
    createJsonPostRequest({}, options),
    validateSignOutResponse,
  );
}

export function isAuthApiClientError(
  error: unknown,
): error is AuthApiClientError {
  return error instanceof AuthApiClientError;
}

export const authService = Object.freeze({
  registerUser,
  verifyUserEmail,
  signInUser,
  signInAdmin,
  checkUsernameAvailability,
  getUsernameSuggestions,
  resendVerificationCode,
  requestPasswordReset,
  verifyPasswordResetCode,
  resetPassword,
  getAuthSession,
  signOut,
});