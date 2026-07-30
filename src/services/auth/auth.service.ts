import type {
  AccountRole,
  AccountStatus,
} from "@/types/account";

import type {
  AuthApiError,
  AuthApiSuccess,
  AuthErrorCode,
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

  suggestions:
    readonly string[];
};

export type UsernameSuggestionsInput = {
  username: string;
  firstNames?: string;
};

export type UsernameSuggestionsResponseData = {
  suggestions:
    readonly string[];
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

export class AuthApiClientError
  extends Error {
  public readonly code:
    AuthErrorCode | "UNKNOWN_ERROR";

  public readonly status:
    number;

  public readonly fieldErrors:
    readonly AuthFieldError[];

  public readonly retryAfterSeconds:
    number | null;

  public constructor(
    input: {
      code:
        AuthErrorCode
        | "UNKNOWN_ERROR";

      message: string;
      status: number;

      fieldErrors?:
        readonly AuthFieldError[];

      retryAfterSeconds?:
        number | null;
    },
  ) {
    super(input.message);

    this.name =
      "AuthApiClientError";

    this.code =
      input.code;

    this.status =
      input.status;

    this.fieldErrors =
      input.fieldErrors ?? [];

    this.retryAfterSeconds =
      input.retryAfterSeconds
      ?? null;
  }
}

type UnknownRecord =
  Record<string, unknown>;

function isUnknownRecord(
  value: unknown,
): value is UnknownRecord {
  return (
    typeof value === "object"
    && value !== null
    && !Array.isArray(value)
  );
}

function isApiSuccessPayload<TData>(
  value: unknown,
): value is AuthApiSuccess<TData> {
  return (
    isUnknownRecord(value)
    && value.success === true
    && "data" in value
  );
}

function isApiErrorPayload(
  value: unknown,
): value is AuthApiError {
  return (
    isUnknownRecord(value)
    && value.success === false
    && isUnknownRecord(
      value.error,
    )
    && typeof value
      .error
      .code === "string"
    && typeof value
      .error
      .message === "string"
  );
}

async function parseResponseBody(
  response: Response,
): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const contentType =
    response.headers
      .get("content-type")
      ?.toLowerCase()
    ?? "";

  if (
    !contentType.includes(
      "application/json",
    )
  ) {
    return null;
  }

  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

function createClientError(
  response: Response,
  payload: unknown,
): AuthApiClientError {
  if (isApiErrorPayload(payload)) {
    return new AuthApiClientError({
      code:
        payload.error.code,

      message:
        payload.error.message,

      status:
        response.status,

      fieldErrors:
        payload.error
          .fieldErrors,

      retryAfterSeconds:
        payload.error
          .retryAfterSeconds
        ?? null,
    });
  }

  return new AuthApiClientError({
    code:
      "UNKNOWN_ERROR",

    message:
      response.status >= 500
        ? "El servidor no pudo completar la solicitud."
        : "No se pudo completar la solicitud.",

    status:
      response.status,
  });
}

async function requestAuthApi<
  TResponseData,
>(
  url: string,
  init: RequestInit,
): Promise<TResponseData> {
  let response:
    Response;

  try {
    response =
      await fetch(
        url,
        {
          ...init,

          headers: {
            Accept:
              "application/json",

            ...init.headers,
          },

          cache:
            "no-store",

          credentials:
            "same-origin",
        },
      );
  } catch (error) {
    if (
      error instanceof DOMException
      && error.name === "AbortError"
    ) {
      throw error;
    }

    throw new AuthApiClientError({
      code:
        "UNKNOWN_ERROR",

      message:
        "No se pudo establecer comunicación con el servidor.",

      status:
        0,
    });
  }

  const payload =
    await parseResponseBody(
      response,
    );

  if (!response.ok) {
    throw createClientError(
      response,
      payload,
    );
  }

  if (
    !isApiSuccessPayload<
      TResponseData
    >(payload)
  ) {
    throw new AuthApiClientError({
      code:
        "UNKNOWN_ERROR",

      message:
        "El servidor devolvió una respuesta no válida.",

      status:
        response.status,
    });
  }

  return payload.data;
}

function createJsonPostRequest(
  body: unknown,
  options:
    AuthApiRequestOptions,
): RequestInit {
  return {
    method:
      "POST",

    headers: {
      "Content-Type":
        "application/json",
    },

    body:
      JSON.stringify(body),

    signal:
      options.signal,
  };
}

export async function registerUser(
  input: UserRegistrationRequest,
  options:
    AuthApiRequestOptions = {},
): Promise<RegisterUserResponseData> {
  return requestAuthApi<
    RegisterUserResponseData
  >(
    "/api/auth/user/register",
    createJsonPostRequest(
      input,
      options,
    ),
  );
}

export async function verifyUserEmail(
  input: EmailVerificationRequest,
  options:
    AuthApiRequestOptions = {},
): Promise<VerifyEmailResponseData> {
  return requestAuthApi<
    VerifyEmailResponseData
  >(
    "/api/auth/user/verify-email",
    createJsonPostRequest(
      input,
      options,
    ),
  );
}

export async function signInUser(
  input: SignInRequest,
  options:
    AuthApiRequestOptions = {},
): Promise<SignInResponseData> {
  return requestAuthApi<
    SignInResponseData
  >(
    "/api/auth/user/sign-in",
    createJsonPostRequest(
      input,
      options,
    ),
  );
}

export async function signInAdmin(
  input: SignInRequest,
  options:
    AuthApiRequestOptions = {},
): Promise<SignInResponseData> {
  return requestAuthApi<
    SignInResponseData
  >(
    "/api/auth/admin/sign-in",
    createJsonPostRequest(
      input,
      options,
    ),
  );
}

export async function checkUsernameAvailability(
  username: string,
  options:
    AuthApiRequestOptions = {},
): Promise<
  UsernameAvailabilityResponseData
> {
  const searchParameters =
    new URLSearchParams({
      username:
        username.trim(),
    });

  return requestAuthApi<
    UsernameAvailabilityResponseData
  >(
    `/api/auth/username/availability?${searchParameters.toString()}`,
    {
      method:
        "GET",

      signal:
        options.signal,
    },
  );
}

export async function getUsernameSuggestions(
  input: UsernameSuggestionsInput,
  options:
    AuthApiRequestOptions = {},
): Promise<
  UsernameSuggestionsResponseData
> {
  const searchParameters =
    new URLSearchParams({
      username:
        input.username.trim(),
    });

  if (
    input.firstNames
    ?.trim()
  ) {
    searchParameters.set(
      "firstNames",
      input.firstNames.trim(),
    );
  }

  return requestAuthApi<
    UsernameSuggestionsResponseData
  >(
    `/api/auth/username/suggestions?${searchParameters.toString()}`,
    {
      method:
        "GET",

      signal:
        options.signal,
    },
  );
}

export async function resendVerificationCode(
  input: ResendVerificationCodeInput,
  options:
    AuthApiRequestOptions = {},
): Promise<RegisterUserResponseData> {
  return requestAuthApi<
    RegisterUserResponseData
  >(
    "/api/auth/verification/resend",
    createJsonPostRequest(
      input,
      options,
    ),
  );
}

export async function requestPasswordReset(
  input: PasswordResetRequest,
  options:
    AuthApiRequestOptions = {},
): Promise<
  PasswordResetRequestResponseData
> {
  return requestAuthApi<
    PasswordResetRequestResponseData
  >(
    "/api/auth/password/request-reset",
    createJsonPostRequest(
      input,
      options,
    ),
  );
}

export async function verifyPasswordResetCode(
  input:
    PasswordResetCodeVerificationRequest,
  options:
    AuthApiRequestOptions = {},
): Promise<
  PasswordResetCodeResponseData
> {
  return requestAuthApi<
    PasswordResetCodeResponseData
  >(
    "/api/auth/password/verify-code",
    createJsonPostRequest(
      input,
      options,
    ),
  );
}

export async function resetPassword(
  input: PasswordChangeRequest,
  options:
    AuthApiRequestOptions = {},
): Promise<
  PasswordResetResponseData
> {
  return requestAuthApi<
    PasswordResetResponseData
  >(
    "/api/auth/password/reset",
    createJsonPostRequest(
      input,
      options,
    ),
  );
}

export async function getAuthSession(
  options:
    AuthApiRequestOptions = {},
): Promise<
  AuthSessionResponseData
> {
  return requestAuthApi<
    AuthSessionResponseData
  >(
    "/api/auth/session",
    {
      method:
        "GET",

      signal:
        options.signal,
    },
  );
}

export async function signOut(
  options:
    AuthApiRequestOptions = {},
): Promise<SignOutResponseData> {
  return requestAuthApi<
    SignOutResponseData
  >(
    "/api/auth/sign-out",
    createJsonPostRequest(
      {},
      options,
    ),
  );
}

export function isAuthApiClientError(
  error: unknown,
): error is AuthApiClientError {
  return (
    error
    instanceof AuthApiClientError
  );
}

export const authService = {
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
} as const;