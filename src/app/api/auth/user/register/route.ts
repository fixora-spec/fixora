import { NextResponse } from "next/server";

import {
  AUTH_RATE_LIMIT_ACTIONS,
  AUTH_REQUEST_LIMITS,
} from "@/config/auth.config";

import {
  isAuthServiceError,
  registerUser,
  type AuthServiceErrorCode,
} from "@/lib/auth/auth.service";

import {
  consumeDefaultAuthRateLimit,
} from "@/lib/auth/rate-limit";

import {
  getRequestIpAddress,
  getRequestUserAgent,
} from "@/lib/auth/session";

import {
  isAuthValidationError,
  validateUserRegistrationRequest,
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

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const REGISTRATION_BODY_LIMIT_BYTES =
  Math.min(
    AUTH_REQUEST_LIMITS
      .maximumJsonBodyBytes,

    16_384,
  );

type LocalizedMessages = {
  forbiddenOrigin:
    string;

  invalidRequest:
    string;

  rateLimited:
    string;

  emailAlreadyRegistered:
    string;

  usernameUnavailable:
    string;

  emailDeliveryFailed:
    string;

  databaseConflict:
    string;

  internalError:
    string;
};

function resolveRequestLocale(
  request: Request,
  body?: unknown,
): Locale {
  if (
    typeof body === "object"
    && body !== null
    && !Array.isArray(
      body,
    )
    && "locale" in body
    && (
      body.locale === "es"
      || body.locale === "en"
    )
  ) {
    return body.locale;
  }

  const headerLocale =
    request.headers
      .get(
        "x-fixora-locale",
      )
      ?.trim()
      .toLowerCase();

  if (
    headerLocale === "en"
  ) {
    return "en";
  }

  return request.headers
    .get(
      "accept-language",
    )
    ?.toLowerCase()
    .startsWith(
      "en",
    )
    ? "en"
    : "es";
}

function getMessages(
  locale: Locale,
): LocalizedMessages {
  if (
    locale === "en"
  ) {
    return {
      forbiddenOrigin:
        "The request origin is not allowed.",

      invalidRequest:
        "Review the registration information and try again.",

      rateLimited:
        "Too many registration requests were made. Please wait before trying again.",

      emailAlreadyRegistered:
        "An account already exists for this email address.",

      usernameUnavailable:
        "The requested username is not available.",

      emailDeliveryFailed:
        "The verification email could not be delivered. Please try again.",

      databaseConflict:
        "The email address or username is already registered.",

      internalError:
        "The account could not be registered at this time.",
    };
  }

  return {
    forbiddenOrigin:
      "El origen de la solicitud no está permitido.",

    invalidRequest:
      "Revisa la información del registro e inténtalo nuevamente.",

    rateLimited:
      "Se realizaron demasiadas solicitudes de registro. Espera antes de intentarlo nuevamente.",

    emailAlreadyRegistered:
      "Ya existe una cuenta asociada a este correo electrónico.",

    usernameUnavailable:
      "El nombre de pila solicitado no está disponible.",

    emailDeliveryFailed:
      "No se pudo entregar el correo de verificación. Inténtalo nuevamente.",

    databaseConflict:
      "El correo electrónico o el nombre de pila ya está registrado.",

    internalError:
      "No se pudo registrar la cuenta en este momento.",
  };
}

function mapServiceErrorCode(
  code:
    AuthServiceErrorCode,
): AuthErrorCode {
  switch (
    code
  ) {
    case "EMAIL_ALREADY_IN_USE":
      return "EMAIL_ALREADY_REGISTERED";

    case "USERNAME_UNAVAILABLE":
      return "USERNAME_UNAVAILABLE";

    case "DATABASE_CONFLICT":
      return "VALIDATION_ERROR";

    case "EMAIL_DELIVERY_FAILED":
      return "EMAIL_DELIVERY_FAILED";

    default:
      return "INTERNAL_ERROR";
  }
}

function getServiceErrorMessage(
  code:
    AuthServiceErrorCode,

  messages:
    LocalizedMessages,
): string {
  switch (
    code
  ) {
    case "EMAIL_ALREADY_IN_USE":
      return messages
        .emailAlreadyRegistered;

    case "USERNAME_UNAVAILABLE":
      return messages
        .usernameUnavailable;

    case "DATABASE_CONFLICT":
      return messages
        .databaseConflict;

    case "EMAIL_DELIVERY_FAILED":
      return messages
        .emailDeliveryFailed;

    default:
      return messages
        .internalError;
  }
}

function getRegistrationRateLimitIdentifier(
  request: Request,
): string {
  const ipAddress =
    getRequestIpAddress(
      request,
    );

  if (
    ipAddress
  ) {
    return `ip:${ipAddress}`;
  }

  const userAgent =
    getRequestUserAgent(
      request,
    )
    ?? "unknown";

  return [
    "no-ip",
    new URL(
      request.url,
    ).origin,
    userAgent,
  ].join(
    ":",
  );
}

function createValidationResponse(
  locale:
    Locale,

  fieldErrors:
    readonly AuthFieldError[],
): NextResponse {
  const messages =
    getMessages(
      locale,
    );

  return createApiErrorResponse({
    status:
      400,

    code:
      "VALIDATION_ERROR",

    message:
      messages.invalidRequest,

    fieldErrors,
  });
}

export async function POST(
  request: Request,
): Promise<NextResponse> {
  const fallbackLocale =
    resolveRequestLocale(
      request,
    );

  try {
    verifyRequestOrigin(
      request,
    );
  } catch (error) {
    if (
      isRequestOriginError(
        error,
      )
    ) {
      return createApiErrorResponse({
        status:
          error.status,

        code:
          error.code,

        message:
          getMessages(
            fallbackLocale,
          ).forbiddenOrigin,
      });
    }

    return createApiErrorResponse({
      status:
        500,

      code:
        "INTERNAL_ERROR",

      message:
        getMessages(
          fallbackLocale,
        ).internalError,
    });
  }

  let body:
    unknown;

  try {
    body =
      await parseJsonBody(
        request,
        {
          maximumBytes:
            REGISTRATION_BODY_LIMIT_BYTES,

          requireObject:
            true,
        },
      );
  } catch (error) {
    if (
      isJsonBodyError(
        error,
      )
    ) {
      return createApiErrorResponse({
        status:
          error.status,

        code:
          error.code,

        message:
          error.message,
      });
    }

    return createApiErrorResponse({
      status:
        500,

      code:
        "INTERNAL_ERROR",

      message:
        getMessages(
          fallbackLocale,
        ).internalError,
    });
  }

  const locale =
    resolveRequestLocale(
      request,
      body,
    );

  const messages =
    getMessages(
      locale,
    );

  let input:
    ReturnType<
      typeof validateUserRegistrationRequest
    >;

  try {
    input =
      validateUserRegistrationRequest(
        body,
      );
  } catch (error) {
    if (
      isAuthValidationError(
        error,
      )
    ) {
      return createValidationResponse(
        locale,
        error.fieldErrors,
      );
    }

    return createApiErrorResponse({
      status:
        500,

      code:
        "INTERNAL_ERROR",

      message:
        messages.internalError,
    });
  }

  try {
    const rateLimit =
      await consumeDefaultAuthRateLimit(
        AUTH_RATE_LIMIT_ACTIONS
          .userRegistration,

        getRegistrationRateLimitIdentifier(
          request,
        ),
      );

    if (
      !rateLimit.allowed
    ) {
      return createApiErrorResponse({
        status:
          429,

        code:
          "RATE_LIMITED",

        message:
          messages.rateLimited,

        retryAfterSeconds:
          Math.max(
            1,
            rateLimit
              .retryAfterSeconds,
          ),
      });
    }

    const result =
      await registerUser(
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

    return createApiSuccessResponse(
      result,
      {
        status:
          201,
      },
    );
  } catch (error) {
    if (
      isAuthServiceError(
        error,
      )
    ) {
      return createApiErrorResponse({
        status:
          error.status,

        code:
          mapServiceErrorCode(
            error.code,
          ),

        message:
          getServiceErrorMessage(
            error.code,
            messages,
          ),

        ...(error.retryAfterSeconds
          ? {
              retryAfterSeconds:
                Math.max(
                  1,
                  error
                    .retryAfterSeconds,
                ),
            }
          : {}),
      });
    }

    return createApiErrorResponse({
      status:
        500,

      code:
        "INTERNAL_ERROR",

      message:
        messages.internalError,
    });
  }
}