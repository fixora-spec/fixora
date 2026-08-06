import type {
  NextResponse,
} from "next/server";

import {
  AUTH_RATE_LIMIT_ACTIONS,
  AUTH_REQUEST_LIMITS,
} from "@/config/auth.config";

import {
  isAuthServiceError,
  signInAdmin,
  type AuthServiceErrorCode,
} from "@/lib/auth/auth.service";

import {
  consumeDefaultAuthRateLimit,
  resetAuthRateLimit,
} from "@/lib/auth/rate-limit";

import {
  getRequestIpAddress,
  getRequestUserAgent,
} from "@/lib/auth/session";

import {
  isAuthValidationError,
  validateSignInRequest,
} from "@/lib/auth/validation";

import {
  createApiErrorResponse,
  createApiSuccessResponse,
} from "@/lib/http/api-response";

import {
  isJsonBodyError,
  parseJsonBody,
} from "@/lib/http/parse-json-body";

import {
  isRequestOriginError,
  verifyRequestOrigin,
} from "@/lib/http/verify-request-origin";

import type {
  AuthErrorCode,
  AuthFieldError,
} from "@/types/auth";

import type {
  Locale,
} from "@/types/locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BODY_LIMIT_BYTES = Math.min(
  AUTH_REQUEST_LIMITS.maximumJsonBodyBytes,
  8_192,
);

type Messages = {
  forbiddenOrigin: string;
  invalidRequest: string;
  rateLimited: string;
  invalidCredentials: string;
  accountLocked: string;
  accountInactive: string;
  emailNotVerified: string;
  accessNotStarted: string;
  accessExpired: string;
  accessInvalid: string;
  roleNotAllowed: string;
  internalError: string;
};

function resolveLocale(
  request: Request,
  body?: unknown,
): Locale {
  if (
    typeof body === "object"
    && body !== null
    && !Array.isArray(body)
    && "locale" in body
    && (body.locale === "es" || body.locale === "en")
  ) {
    return body.locale;
  }

  const explicitLocale = request.headers
    .get("x-fixora-locale")
    ?.trim()
    .toLowerCase();

  if (explicitLocale === "en") {
    return "en";
  }

  const acceptedLanguage = request.headers
    .get("accept-language")
    ?.trim()
    .toLowerCase();

  return acceptedLanguage?.startsWith("en")
    ? "en"
    : "es";
}

function getMessages(locale: Locale): Messages {
  if (locale === "en") {
    return {
      forbiddenOrigin:
        "The request origin is not allowed.",
      invalidRequest:
        "Enter a valid administrator email address and password.",
      rateLimited:
        "Too many administrator sign-in attempts were made. Please wait before trying again.",
      invalidCredentials:
        "The administrator email or password is incorrect.",
      accountLocked:
        "The administrator account is temporarily locked.",
      accountInactive:
        "The administrator account is not active.",
      emailNotVerified:
        "Verify the administrator email address before signing in.",
      accessNotStarted:
        "Administrator access has not started yet.",
      accessExpired:
        "Administrator access has expired.",
      accessInvalid:
        "The administrator access period is invalid.",
      roleNotAllowed:
        "This account cannot use the administrator sign-in form.",
      internalError:
        "Administrator access is temporarily unavailable.",
    };
  }

  return {
    forbiddenOrigin:
      "El origen de la solicitud no está permitido.",
    invalidRequest:
      "Ingresa un correo electrónico y una contraseña de administrador válidos.",
    rateLimited:
      "Se realizaron demasiados intentos de acceso administrativo. Espera antes de intentarlo nuevamente.",
    invalidCredentials:
      "El correo o la contraseña del administrador son incorrectos.",
    accountLocked:
      "La cuenta administradora está bloqueada temporalmente.",
    accountInactive:
      "La cuenta administradora no se encuentra activa.",
    emailNotVerified:
      "Verifica el correo de la cuenta administradora antes de iniciar sesión.",
    accessNotStarted:
      "El acceso administrativo todavía no ha iniciado.",
    accessExpired:
      "El acceso administrativo ha vencido.",
    accessInvalid:
      "La vigencia del acceso administrativo no es válida.",
    roleNotAllowed:
      "Esta cuenta no puede utilizar el acceso administrativo.",
    internalError:
      "El acceso administrativo no está disponible temporalmente.",
  };
}

function mapServiceErrorCode(
  code: AuthServiceErrorCode,
): AuthErrorCode {
  switch (code) {
    case "INVALID_CREDENTIALS":
      return "INVALID_CREDENTIALS";

    case "EMAIL_NOT_VERIFIED":
      return "ACCOUNT_NOT_VERIFIED";

    case "ACCOUNT_INACTIVE":
    case "ACCOUNT_ACCESS_NOT_STARTED":
    case "ACCOUNT_ACCESS_EXPIRED":
    case "ACCOUNT_ACCESS_INVALID":
      return "ACCOUNT_DISABLED";

    case "ACCOUNT_LOCKED":
      return "ACCOUNT_LOCKED";

    case "ROLE_MISMATCH":
      return "ROLE_NOT_ALLOWED";

    default:
      return "INTERNAL_ERROR";
  }
}

function getServiceErrorMessage(
  code: AuthServiceErrorCode,
  messages: Messages,
): string {
  switch (code) {
    case "INVALID_CREDENTIALS":
      return messages.invalidCredentials;

    case "EMAIL_NOT_VERIFIED":
      return messages.emailNotVerified;

    case "ACCOUNT_INACTIVE":
      return messages.accountInactive;

    case "ACCOUNT_LOCKED":
      return messages.accountLocked;

    case "ACCOUNT_ACCESS_NOT_STARTED":
      return messages.accessNotStarted;

    case "ACCOUNT_ACCESS_EXPIRED":
      return messages.accessExpired;

    case "ACCOUNT_ACCESS_INVALID":
      return messages.accessInvalid;

    case "ROLE_MISMATCH":
      return messages.roleNotAllowed;

    default:
      return messages.internalError;
  }
}

function createValidationResponse(
  locale: Locale,
  fieldErrors: readonly AuthFieldError[],
): NextResponse {
  return createApiErrorResponse({
    status: 400,
    code: "VALIDATION_ERROR",
    message: getMessages(locale).invalidRequest,
    fieldErrors,
  });
}

function getRateLimitIdentifiers(
  request: Request,
  email: string,
): readonly string[] {
  const ipAddress = getRequestIpAddress(request) ?? "unknown";

  return [
    `ip:${ipAddress}`,
    `account:ADMIN:${email}`,
  ];
}

async function consumeSignInLimits(
  identifiers: readonly string[],
): Promise<{
  allowed: boolean;
  retryAfterSeconds: number;
}> {
  let retryAfterSeconds = 0;

  for (const identifier of identifiers) {
    const result = await consumeDefaultAuthRateLimit(
      AUTH_RATE_LIMIT_ACTIONS.adminSignIn,
      identifier,
    );

    if (!result.allowed) {
      retryAfterSeconds = Math.max(
        retryAfterSeconds,
        result.retryAfterSeconds,
      );
    }
  }

  return {
    allowed: retryAfterSeconds === 0,
    retryAfterSeconds,
  };
}

async function clearSignInLimits(
  identifiers: readonly string[],
): Promise<void> {
  await Promise.allSettled(
    identifiers.map((identifier) =>
      resetAuthRateLimit(
        AUTH_RATE_LIMIT_ACTIONS.adminSignIn,
        identifier,
      ),
    ),
  );
}

function serializeAccount(
  account: Awaited<
    ReturnType<typeof signInAdmin>
  >["account"],
) {
  return {
    accountId: account.accountId,
    role: account.role,
    status: account.status,
    firstNames: account.firstNames,
    lastNames: account.lastNames,
    username: account.username,
    email: account.email,
    emailVerifiedAt: account.emailVerifiedAt?.toISOString() ?? null,
    createdAt: account.createdAt.toISOString(),
    lastSignInAt: account.lastSignInAt?.toISOString() ?? null,
  };
}

export async function POST(
  request: Request,
): Promise<NextResponse> {
  const fallbackLocale = resolveLocale(request);

  try {
    verifyRequestOrigin(request);
  } catch (error) {
    if (isRequestOriginError(error)) {
      return createApiErrorResponse({
        status: error.status,
        code: error.code,
        message: getMessages(fallbackLocale).forbiddenOrigin,
      });
    }

    return createApiErrorResponse({
      status: 500,
      code: "INTERNAL_ERROR",
      message: getMessages(fallbackLocale).internalError,
    });
  }

  let body: unknown;

  try {
    body = await parseJsonBody(
      request,
      {
        maximumBytes: BODY_LIMIT_BYTES,
        requireObject: true,
      },
    );
  } catch (error) {
    if (isJsonBodyError(error)) {
      return createApiErrorResponse({
        status: error.status,
        code: error.code,
        message: error.message,
      });
    }

    return createApiErrorResponse({
      status: 500,
      code: "INTERNAL_ERROR",
      message: getMessages(fallbackLocale).internalError,
    });
  }

  const locale = resolveLocale(request, body);
  const messages = getMessages(locale);

  let input: ReturnType<typeof validateSignInRequest>;

  try {
    input = validateSignInRequest(body);
  } catch (error) {
    if (isAuthValidationError(error)) {
      return createValidationResponse(
        locale,
        error.fieldErrors,
      );
    }

    return createApiErrorResponse({
      status: 500,
      code: "INTERNAL_ERROR",
      message: messages.internalError,
    });
  }

  const rateLimitIdentifiers = getRateLimitIdentifiers(
    request,
    input.email,
  );

  try {
    const rateLimit = await consumeSignInLimits(
      rateLimitIdentifiers,
    );

    if (!rateLimit.allowed) {
      return createApiErrorResponse({
        status: 429,
        code: "RATE_LIMITED",
        message: messages.rateLimited,
        retryAfterSeconds: Math.max(
          1,
          rateLimit.retryAfterSeconds,
        ),
      });
    }

    const result = await signInAdmin(
      input,
      {
        ipAddress: getRequestIpAddress(request),
        userAgent: getRequestUserAgent(request),
      },
    );

    await clearSignInLimits(rateLimitIdentifiers);

    const response = createApiSuccessResponse({
      account: serializeAccount(result.account),
      session: {
        expiresAt: result.session.expiresAt,
      },
    });

    response.headers.append(
      "Set-Cookie",
      result.session.cookieHeader,
    );

    return response;
  } catch (error) {
    if (isAuthServiceError(error)) {
      const publicCode = mapServiceErrorCode(error.code);

      return createApiErrorResponse({
        status: publicCode === "INTERNAL_ERROR"
          ? 500
          : error.status,
        code: publicCode,
        message: getServiceErrorMessage(
          error.code,
          messages,
        ),
      });
    }

    return createApiErrorResponse({
      status: 500,
      code: "INTERNAL_ERROR",
      message: messages.internalError,
    });
  }
}