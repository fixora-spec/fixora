import { NextResponse } from "next/server";

import {
  AUTH_RATE_LIMIT_ACTIONS,
  AUTH_REQUEST_LIMITS,
} from "@/config/auth.config";
import { requestPasswordReset } from "@/lib/auth/auth.service";
import { consumeDefaultAuthRateLimit } from "@/lib/auth/rate-limit";
import {
  getRequestIpAddress,
  getRequestUserAgent,
} from "@/lib/auth/session";
import {
  isAuthValidationError,
  validatePasswordResetRequest,
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
import type { AuthFieldError } from "@/types/auth";
import type { Locale } from "@/types/locale";

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
  accepted: string;
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
    && (
      body.locale === "es"
      || body.locale === "en"
    )
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

function getMessages(
  locale: Locale,
): Messages {
  return locale === "en"
    ? {
        forbiddenOrigin:
          "The request origin is not allowed.",

        invalidRequest:
          "Review the email address and account type and try again.",

        rateLimited:
          "Too many password-recovery requests were made. Please wait before trying again.",

        accepted:
          "If an eligible account exists, a password-recovery code will be sent.",

        internalError:
          "Password recovery could not be requested at this time.",
      }
    : {
        forbiddenOrigin:
          "El origen de la solicitud no está permitido.",

        invalidRequest:
          "Revisa el correo electrónico y el tipo de cuenta e inténtalo nuevamente.",

        rateLimited:
          "Se realizaron demasiadas solicitudes de recuperación. Espera antes de intentarlo nuevamente.",

        accepted:
          "Si existe una cuenta habilitada, se enviará un código de recuperación de contraseña.",

        internalError:
          "No se pudo solicitar la recuperación de contraseña en este momento.",
      };
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
  const ipAddress =
    getRequestIpAddress(request)
    ?? "unknown";

  return [
    `ip:${ipAddress}`,
    `account:${accountRole}:${email}`,
  ];
}

async function consumeRequestLimits(
  request: Request,
  email: string,
  accountRole: string,
): Promise<{
  allowed: boolean;
  retryAfterSeconds: number;
}> {
  let retryAfterSeconds = 0;

  for (
    const identifier
    of getRateLimitIdentifiers(
      request,
      email,
      accountRole,
    )
  ) {
    const result =
      await consumeDefaultAuthRateLimit(
        AUTH_RATE_LIMIT_ACTIONS
          .passwordResetRequest,

        identifier,
      );

    if (!result.allowed) {
      retryAfterSeconds =
        Math.max(
          retryAfterSeconds,
          result.retryAfterSeconds,
        );
    }
  }

  return {
    allowed:
      retryAfterSeconds === 0,

    retryAfterSeconds,
  };
}

export async function POST(
  request: Request,
): Promise<NextResponse> {
  const fallbackLocale =
    resolveLocale(request);

  try {
    verifyRequestOrigin(request);
  } catch (error) {
    if (isRequestOriginError(error)) {
      return createApiErrorResponse({
        status: error.status,
        code: error.code,
        message:
          getMessages(fallbackLocale)
            .forbiddenOrigin,
      });
    }

    return createApiErrorResponse({
      status: 500,
      code: "INTERNAL_ERROR",
      message:
        getMessages(fallbackLocale)
          .internalError,
    });
  }

  let body: unknown;

  try {
    body =
      await parseJsonBody(
        request,
        {
          maximumBytes:
            BODY_LIMIT_BYTES,

          requireObject:
            true,
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
      message:
        getMessages(fallbackLocale)
          .internalError,
    });
  }

  const locale =
    resolveLocale(
      request,
      body,
    );

  const messages =
    getMessages(locale);

  let input:
    ReturnType<
      typeof validatePasswordResetRequest
    >;

  try {
    input =
      validatePasswordResetRequest(
        body,
      );
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

  try {
    const rateLimit =
      await consumeRequestLimits(
        request,
        input.email,
        input.accountRole,
      );

    if (!rateLimit.allowed) {
      return createApiErrorResponse({
        status: 429,
        code: "RATE_LIMITED",
        message: messages.rateLimited,

        retryAfterSeconds:
          Math.max(
            1,
            rateLimit.retryAfterSeconds,
          ),
      });
    }

    const result =
      await requestPasswordReset(
        input,
        {
          ipAddress:
            getRequestIpAddress(
              request,
            ),

          userAgent:
            getRequestUserAgent(
              request,
            ),
        },
      );

    return createApiSuccessResponse({
      ...result,
      message:
        messages.accepted,
    });
  } catch {
    return createApiErrorResponse({
      status: 500,
      code: "INTERNAL_ERROR",
      message: messages.internalError,
    });
  }
}