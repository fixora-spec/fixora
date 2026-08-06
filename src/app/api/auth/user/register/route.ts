import type {
  NextResponse,
} from "next/server";

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
  16_384,
);

const UNKNOWN_IP_IDENTIFIER = "unknown";

type Messages = {
  forbiddenOrigin: string;
  invalidContentType: string;
  requestTooLarge: string;
  invalidJson: string;
  invalidRequest: string;
  rateLimited: string;
  emailAlreadyRegistered: string;
  usernameUnavailable: string;
  emailDeliveryFailed: string;
  databaseConflict: string;
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
    forbiddenOrigin: "El origen de la solicitud no está permitido.",
    invalidContentType:
      "La solicitud debe utilizar un cuerpo JSON sin compresión.",
    requestTooLarge: "El contenido de la solicitud es demasiado grande.",
    invalidJson: "El contenido de la solicitud no contiene un JSON válido.",
    invalidRequest:
      "Revisa la información del registro e inténtalo nuevamente.",
    rateLimited:
      "Se realizaron demasiadas solicitudes de registro. Espera antes de intentarlo nuevamente.",
    emailAlreadyRegistered:
      "Ya existe una cuenta asociada a este correo electrónico.",
    usernameUnavailable:
      "El nombre de usuario solicitado no está disponible.",
    emailDeliveryFailed:
      "No se pudo entregar el correo de verificación. Inténtalo nuevamente.",
    databaseConflict:
      "El correo electrónico o el nombre de usuario ya está registrado.",
    internalError:
      "No se pudo registrar la cuenta en este momento.",
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
  code: AuthServiceErrorCode,
  messages: Messages,
): string {
  switch (code) {
    case "EMAIL_ALREADY_IN_USE":
      return messages.emailAlreadyRegistered;

    case "USERNAME_UNAVAILABLE":
      return messages.usernameUnavailable;

    case "DATABASE_CONFLICT":
      return messages.databaseConflict;

    case "EMAIL_DELIVERY_FAILED":
      return messages.emailDeliveryFailed;

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
  const ipAddress = getRequestIpAddress(request) ?? UNKNOWN_IP_IDENTIFIER;

  return [
    `ip:${ipAddress}`,
    `account:USER:${email}`,
  ];
}

async function consumeRegistrationLimits(
  identifiers: readonly string[],
): Promise<{
  allowed: boolean;
  retryAfterSeconds: number;
}> {
  let retryAfterSeconds = 0;

  for (const identifier of identifiers) {
    const result = await consumeDefaultAuthRateLimit(
      AUTH_RATE_LIMIT_ACTIONS.userRegistration,
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

  let input: ReturnType<typeof validateUserRegistrationRequest>;

  try {
    input = validateUserRegistrationRequest(body);
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
  );

  try {
    const rateLimit = await consumeRegistrationLimits(
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

    const result = await registerUser(input, {
      ipAddress: getRequestIpAddress(request),
      userAgent: getRequestUserAgent(request),
    });

    return createApiSuccessResponse(result, {
      status: 201,
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