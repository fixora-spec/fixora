import type {
  NextResponse,
} from "next/server";

import {
  AUTH_RATE_LIMIT_ACTIONS,
  AUTH_REQUEST_LIMITS,
} from "@/config/auth.config";

import {
  isAuthServiceError,
  verifyUserEmail,
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
  validateEmailVerificationRequest,
} from "@/lib/auth/validation";

import {
  createApiErrorResponse,
  createApiSuccessResponse,
} from "@/lib/http/api-response";

import {
  isJsonBodyError,
  parseJsonBody,
  type JsonBodyError,
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

const UNKNOWN_IP_IDENTIFIER = "unknown";

type Messages = {
  forbiddenOrigin: string;
  invalidContentType: string;
  requestTooLarge: string;
  invalidJson: string;
  invalidRequest: string;
  rateLimited: string;
  accountNotFound: string;
  invalidCode: string;
  expiredCode: string;
  attemptsExceeded: string;
  accountUnavailable: string;
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

  return request.headers
    .get("accept-language")
    ?.trim()
    .toLowerCase()
    .startsWith("en")
    ? "en"
    : "es";
}

function getMessages(locale: Locale): Messages {
  if (locale === "en") {
    return {
      forbiddenOrigin: "The request origin is not allowed.",
      invalidContentType:
        "The request must use an uncompressed JSON body.",
      requestTooLarge: "The request body is too large.",
      invalidJson: "The request body does not contain valid JSON.",
      invalidRequest:
        "The account identifier or verification code is invalid.",
      rateLimited:
        "Too many verification attempts were made. Please wait before trying again.",
      accountNotFound: "The requested account does not exist.",
      invalidCode: "The verification code is invalid.",
      expiredCode: "The verification code has expired.",
      attemptsExceeded:
        "The allowed attempts for this verification code have been exhausted.",
      accountUnavailable:
        "The account cannot be verified in its current state.",
      internalError: "The email could not be verified at this time.",
    };
  }

  return {
    forbiddenOrigin: "El origen de la solicitud no está permitido.",
    invalidContentType:
      "La solicitud debe utilizar un cuerpo JSON sin compresión.",
    requestTooLarge: "El contenido de la solicitud es demasiado grande.",
    invalidJson: "El contenido de la solicitud no contiene un JSON válido.",
    invalidRequest:
      "El identificador de la cuenta o el código de verificación no es válido.",
    rateLimited:
      "Se realizaron demasiados intentos de verificación. Espera antes de intentarlo nuevamente.",
    accountNotFound: "La cuenta solicitada no existe.",
    invalidCode: "El código de verificación no es válido.",
    expiredCode: "El código de verificación ha vencido.",
    attemptsExceeded:
      "Se agotaron los intentos permitidos para este código de verificación.",
    accountUnavailable:
      "La cuenta no puede verificarse en su estado actual.",
    internalError: "No se pudo verificar el correo en este momento.",
  };
}

function getJsonBodyErrorMessage(
  error: JsonBodyError,
  messages: Messages,
): string {
  if (error.status === 415) {
    return messages.invalidContentType;
  }

  switch (error.code) {
    case "BODY_TOO_LARGE":
      return messages.requestTooLarge;

    case "INVALID_JSON":
      return messages.invalidJson;

    case "INVALID_REQUEST":
    default:
      return messages.invalidRequest;
  }
}

function mapServiceErrorCode(
  code: AuthServiceErrorCode,
): AuthErrorCode {
  switch (code) {
    case "ACCOUNT_NOT_FOUND":
      return "ACCOUNT_NOT_FOUND";

    case "INVALID_VERIFICATION_CODE":
      return "INVALID_VERIFICATION_CODE";

    case "VERIFICATION_CODE_EXPIRED":
      return "VERIFICATION_CODE_EXPIRED";

    case "VERIFICATION_ATTEMPTS_EXCEEDED":
      return "VERIFICATION_ATTEMPTS_EXCEEDED";

    case "ACCOUNT_INACTIVE":
      return "ACCOUNT_DISABLED";

    default:
      return "INTERNAL_ERROR";
  }
}

function getServiceErrorMessage(
  code: AuthServiceErrorCode,
  messages: Messages,
): string {
  switch (code) {
    case "ACCOUNT_NOT_FOUND":
      return messages.accountNotFound;

    case "INVALID_VERIFICATION_CODE":
      return messages.invalidCode;

    case "VERIFICATION_CODE_EXPIRED":
      return messages.expiredCode;

    case "VERIFICATION_ATTEMPTS_EXCEEDED":
      return messages.attemptsExceeded;

    case "ACCOUNT_INACTIVE":
      return messages.accountUnavailable;

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
  accountId: string,
): readonly string[] {
  const ipAddress = getRequestIpAddress(request) ?? UNKNOWN_IP_IDENTIFIER;

  return [
    `ip:${ipAddress}`,
    `account:${accountId}`,
  ];
}

async function consumeVerificationLimits(
  identifiers: readonly string[],
): Promise<{
  allowed: boolean;
  retryAfterSeconds: number;
}> {
  let retryAfterSeconds = 0;

  for (const identifier of identifiers) {
    const result = await consumeDefaultAuthRateLimit(
      AUTH_RATE_LIMIT_ACTIONS.emailVerification,
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

async function clearVerificationLimits(
  identifiers: readonly string[],
): Promise<void> {
  await Promise.allSettled(
    identifiers.map((identifier) =>
      resetAuthRateLimit(
        AUTH_RATE_LIMIT_ACTIONS.emailVerification,
        identifier,
      ),
    ),
  );
}

function serializeVerifiedAccount(
  account: Awaited<ReturnType<typeof verifyUserEmail>>["account"],
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
    body = await parseJsonBody(request, {
      maximumBytes: BODY_LIMIT_BYTES,
      requireObject: true,
    });
  } catch (error) {
    if (isJsonBodyError(error)) {
      return createApiErrorResponse({
        status: error.status,
        code: error.code,
        message: getJsonBodyErrorMessage(
          error,
          getMessages(fallbackLocale),
        ),
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

  let input: ReturnType<typeof validateEmailVerificationRequest>;

  try {
    input = validateEmailVerificationRequest(body);
  } catch (error) {
    if (isAuthValidationError(error)) {
      return createValidationResponse(locale, error.fieldErrors);
    }

    return createApiErrorResponse({
      status: 500,
      code: "INTERNAL_ERROR",
      message: messages.internalError,
    });
  }

  const rateLimitIdentifiers = getRateLimitIdentifiers(
    request,
    input.accountId,
  );

  try {
    const rateLimit = await consumeVerificationLimits(
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

    const result = await verifyUserEmail(input, {
      ipAddress: getRequestIpAddress(request),
      userAgent: getRequestUserAgent(request),
    });

    await clearVerificationLimits(rateLimitIdentifiers);

    return createApiSuccessResponse({
      account: serializeVerifiedAccount(result.account),
    });
  } catch (error) {
    if (isAuthServiceError(error)) {
      return createApiErrorResponse({
        status: error.status,
        code: mapServiceErrorCode(error.code),
        message: getServiceErrorMessage(error.code, messages),
        ...(error.retryAfterSeconds
          ? {
              retryAfterSeconds: Math.max(
                1,
                error.retryAfterSeconds,
              ),
            }
          : {}),
      });
    }

    return createApiErrorResponse({
      status: 500,
      code: "INTERNAL_ERROR",
      message: messages.internalError,
    });
  }
}