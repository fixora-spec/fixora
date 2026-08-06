import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import {
  AUTH_RATE_LIMIT_ACTIONS,
  AUTH_REQUEST_LIMITS,
} from "@/config/auth.config";
import {
  isAuthServiceError,
  resetPassword,
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
  validatePasswordChangeRequest,
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
  16_384,
);

const UNKNOWN_IP_IDENTIFIER = "unknown";

type Messages = {
  forbiddenOrigin: string;
  invalidRequest: string;
  rateLimited: string;
  invalidToken: string;
  expiredToken: string;
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
          "Review the recovery authorization and the new password and try again.",
        rateLimited:
          "Too many password-reset attempts were made. Please wait before trying again.",
        invalidToken:
          "The password-recovery authorization is invalid or has already been used.",
        expiredToken:
          "The password-recovery authorization has expired.",
        internalError: "The password could not be reset at this time.",
      }
    : {
        forbiddenOrigin: "El origen de la solicitud no está permitido.",
        invalidRequest:
          "Revisa la autorización de recuperación y la nueva contraseña e inténtalo nuevamente.",
        rateLimited:
          "Se realizaron demasiados intentos de restablecimiento. Espera antes de intentarlo nuevamente.",
        invalidToken:
          "La autorización para recuperar la contraseña no es válida o ya fue utilizada.",
        expiredToken:
          "La autorización para recuperar la contraseña ha vencido.",
        internalError:
          "No se pudo restablecer la contraseña en este momento.",
      };
}

function mapServiceErrorCode(
  code: AuthServiceErrorCode,
): AuthErrorCode {
  switch (code) {
    case "PASSWORD_RESET_TOKEN_EXPIRED":
      return "RESET_TOKEN_EXPIRED";

    case "PASSWORD_RESET_TOKEN_INVALID":
    case "ROLE_MISMATCH":
    case "ACCOUNT_NOT_FOUND":
      return "INVALID_RESET_TOKEN";

    default:
      return "INTERNAL_ERROR";
  }
}

function getServiceErrorMessage(
  code: AuthServiceErrorCode,
  messages: Messages,
): string {
  switch (code) {
    case "PASSWORD_RESET_TOKEN_EXPIRED":
      return messages.expiredToken;

    case "PASSWORD_RESET_TOKEN_INVALID":
    case "ROLE_MISMATCH":
    case "ACCOUNT_NOT_FOUND":
      return messages.invalidToken;

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

function createTokenFingerprint(resetToken: string): string {
  return createHash("sha256")
    .update(resetToken, "utf8")
    .digest("hex");
}

function getRateLimitIdentifiers(
  request: Request,
  resetToken: string,
): readonly string[] {
  const ipAddress = getRequestIpAddress(request) ?? UNKNOWN_IP_IDENTIFIER;

  return [
    `ip:${ipAddress}`,
    `token:${createTokenFingerprint(resetToken)}`,
  ];
}

async function consumeCompletionLimits(
  identifiers: readonly string[],
): Promise<{
  allowed: boolean;
  retryAfterSeconds: number;
}> {
  let retryAfterSeconds = 0;

  for (const identifier of identifiers) {
    const result = await consumeDefaultAuthRateLimit(
      AUTH_RATE_LIMIT_ACTIONS.passwordResetCompletion,
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

async function clearCompletionLimits(
  identifiers: readonly string[],
): Promise<void> {
  await Promise.allSettled(
    identifiers.map((identifier) =>
      resetAuthRateLimit(
        AUTH_RATE_LIMIT_ACTIONS.passwordResetCompletion,
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

  let input: ReturnType<typeof validatePasswordChangeRequest>;

  try {
    input = validatePasswordChangeRequest(body);
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
    input.resetToken,
  );

  try {
    const rateLimit = await consumeCompletionLimits(
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

    const result = await resetPassword(input, {
      ipAddress: getRequestIpAddress(request),
      userAgent: getRequestUserAgent(request),
    });

    await clearCompletionLimits(rateLimitIdentifiers);

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