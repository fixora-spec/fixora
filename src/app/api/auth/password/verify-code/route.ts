import { NextResponse } from "next/server";

import {
  AUTH_RATE_LIMIT_ACTIONS,
  AUTH_REQUEST_LIMITS,
} from "@/config/auth.config";
import {
  isAuthServiceError,
  verifyPasswordResetCode,
  type AuthServiceErrorCode,
} from "@/lib/auth/auth.service";
import {
  consumeDefaultAuthRateLimit,
  resetAuthRateLimit,
} from "@/lib/auth/rate-limit";
import { getRequestIpAddress } from "@/lib/auth/session";
import {
  isAuthValidationError,
  validatePasswordResetCodeRequest,
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
import type { Locale } from "@/types/locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BODY_LIMIT_BYTES = Math.min(
  AUTH_REQUEST_LIMITS.maximumJsonBodyBytes,
  8_192,
);

const UNKNOWN_IP_IDENTIFIER = "unknown";

type Messages = {
  forbiddenOrigin: string;
  invalidRequest: string;
  rateLimited: string;
  invalidCode: string;
  expiredCode: string;
  attemptsExceeded: string;
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
    ?.toLowerCase()
    .startsWith("en")
    ? "en"
    : "es";
}

function getMessages(locale: Locale): Messages {
  return locale === "en"
    ? {
        forbiddenOrigin: "The request origin is not allowed.",
        invalidRequest:
          "Review the email address, account type, and recovery code and try again.",
        rateLimited:
          "Too many recovery-code attempts were made. Please wait before trying again.",
        invalidCode: "The recovery code is invalid.",
        expiredCode: "The recovery code has expired.",
        attemptsExceeded:
          "The allowed attempts for this recovery code have been exhausted.",
        internalError:
          "The recovery code could not be verified at this time.",
      }
    : {
        forbiddenOrigin: "El origen de la solicitud no está permitido.",
        invalidRequest:
          "Revisa el correo electrónico, el tipo de cuenta y el código de recuperación e inténtalo nuevamente.",
        rateLimited:
          "Se realizaron demasiados intentos con el código de recuperación. Espera antes de intentarlo nuevamente.",
        invalidCode: "El código de recuperación no es válido.",
        expiredCode: "El código de recuperación ha vencido.",
        attemptsExceeded:
          "Se agotaron los intentos permitidos para este código de recuperación.",
        internalError:
          "No se pudo verificar el código de recuperación en este momento.",
      };
}

function mapServiceErrorCode(
  code: AuthServiceErrorCode,
): AuthErrorCode {
  switch (code) {
    case "INVALID_VERIFICATION_CODE":
      return "INVALID_VERIFICATION_CODE";

    case "VERIFICATION_CODE_EXPIRED":
      return "VERIFICATION_CODE_EXPIRED";

    case "VERIFICATION_ATTEMPTS_EXCEEDED":
      return "VERIFICATION_ATTEMPTS_EXCEEDED";

    default:
      return "INTERNAL_ERROR";
  }
}

function getServiceErrorMessage(
  code: AuthServiceErrorCode,
  messages: Messages,
): string {
  switch (code) {
    case "INVALID_VERIFICATION_CODE":
      return messages.invalidCode;

    case "VERIFICATION_CODE_EXPIRED":
      return messages.expiredCode;

    case "VERIFICATION_ATTEMPTS_EXCEEDED":
      return messages.attemptsExceeded;

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
  accountRole: string,
): readonly string[] {
  const ipAddress = getRequestIpAddress(request) ?? UNKNOWN_IP_IDENTIFIER;

  return [
    `ip:${ipAddress}`,
    `account:${accountRole}:${email}`,
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
      AUTH_RATE_LIMIT_ACTIONS.passwordResetVerification,
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
        AUTH_RATE_LIMIT_ACTIONS.passwordResetVerification,
        identifier,
      ),
    ),
  );
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

  let input: ReturnType<typeof validatePasswordResetCodeRequest>;

  try {
    input = validatePasswordResetCodeRequest(body);
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
    input.email,
    input.accountRole,
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
        retryAfterSeconds: Math.max(1, rateLimit.retryAfterSeconds),
      });
    }

    const result = await verifyPasswordResetCode(input);

    await clearVerificationLimits(rateLimitIdentifiers);

    return createApiSuccessResponse(result);
  } catch (error) {
    if (isAuthServiceError(error)) {
      return createApiErrorResponse({
        status: error.status,
        code: mapServiceErrorCode(error.code),
        message: getServiceErrorMessage(error.code, messages),
        ...(error.retryAfterSeconds
          ? {
              retryAfterSeconds: Math.max(1, error.retryAfterSeconds),
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