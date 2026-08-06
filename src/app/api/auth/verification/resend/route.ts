import type {
  NextResponse,
} from "next/server";

import {
  AUTH_RATE_LIMIT_ACTIONS,
  AUTH_REQUEST_LIMITS,
} from "@/config/auth.config";

import {
  isAuthServiceError,
  resendVerificationCode,
  type AuthServiceErrorCode,
} from "@/lib/auth/auth.service";

import {
  consumeDefaultAuthRateLimit,
} from "@/lib/auth/rate-limit";

import {
  getRequestIpAddress,
} from "@/lib/auth/session";

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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const UNKNOWN_IP_IDENTIFIER = "unknown";

type Messages = {
  forbiddenOrigin: string;
  invalidContentType: string;
  requestTooLarge: string;
  invalidJson: string;
  invalidRequest: string;
  rateLimited: string;
  accountNotFound: string;
  accountUnavailable: string;
  resendBlocked: string;
  emailDeliveryFailed: string;
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
        "The account identifier or selected language is invalid.",
      rateLimited:
        "Too many verification-code requests were made. Please wait before trying again.",
      accountNotFound: "The requested account does not exist.",
      accountUnavailable:
        "The account is not pending email verification.",
      resendBlocked:
        "You must wait before requesting another verification code.",
      emailDeliveryFailed:
        "The verification email could not be delivered. Please try again.",
      internalError:
        "The verification code could not be resent at this time.",
    };
  }

  return {
    forbiddenOrigin: "El origen de la solicitud no está permitido.",
    invalidContentType:
      "La solicitud debe utilizar un cuerpo JSON sin compresión.",
    requestTooLarge: "El contenido de la solicitud es demasiado grande.",
    invalidJson: "El contenido de la solicitud no contiene un JSON válido.",
    invalidRequest:
      "El identificador de la cuenta o el idioma seleccionado no es válido.",
    rateLimited:
      "Se realizaron demasiadas solicitudes de códigos. Espera antes de intentarlo nuevamente.",
    accountNotFound: "La cuenta solicitada no existe.",
    accountUnavailable:
      "La cuenta no está pendiente de verificación de correo.",
    resendBlocked:
      "Debes esperar antes de solicitar otro código de verificación.",
    emailDeliveryFailed:
      "No se pudo entregar el correo de verificación. Inténtalo nuevamente.",
    internalError:
      "No se pudo reenviar el código de verificación en este momento.",
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

function normalizeAccountId(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 36) {
    return null;
  }

  const accountId = value.trim();

  return UUID_PATTERN.test(accountId)
    ? accountId.toLowerCase()
    : null;
}

function normalizeLocale(value: unknown): Locale | null {
  return value === "es" || value === "en"
    ? value
    : null;
}

function mapServiceErrorCode(
  code: AuthServiceErrorCode,
): AuthErrorCode {
  switch (code) {
    case "ACCOUNT_NOT_FOUND":
      return "ACCOUNT_NOT_FOUND";

    case "ACCOUNT_INACTIVE":
      return "ACCOUNT_DISABLED";

    case "VERIFICATION_RESEND_TOO_SOON":
      return "VERIFICATION_RESEND_BLOCKED";

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
    case "ACCOUNT_NOT_FOUND":
      return messages.accountNotFound;

    case "ACCOUNT_INACTIVE":
      return messages.accountUnavailable;

    case "VERIFICATION_RESEND_TOO_SOON":
      return messages.resendBlocked;

    case "EMAIL_DELIVERY_FAILED":
      return messages.emailDeliveryFailed;

    default:
      return messages.internalError;
  }
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

async function consumeResendLimits(
  identifiers: readonly string[],
): Promise<{
  allowed: boolean;
  retryAfterSeconds: number;
}> {
  let retryAfterSeconds = 0;

  for (const identifier of identifiers) {
    const result = await consumeDefaultAuthRateLimit(
      AUTH_RATE_LIMIT_ACTIONS.verificationResend,
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

  let body: Record<string, unknown>;

  try {
    body = await parseJsonBody<Record<string, unknown>>(request, {
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

  const locale = normalizeLocale(body.locale);
  const accountId = normalizeAccountId(body.accountId);
  const resolvedLocale = locale ?? resolveLocale(request, body);
  const messages = getMessages(resolvedLocale);
  const fieldErrors: AuthFieldError[] = [];

  if (accountId === null) {
    fieldErrors.push({
      field: "accountId" as AuthFieldError["field"],
      code: "INVALID_REQUEST",
    });
  }

  if (locale === null) {
    fieldErrors.push({
      field: "locale" as AuthFieldError["field"],
      code: "INVALID_REQUEST",
    });
  }

  if (accountId === null || locale === null) {
    return createApiErrorResponse({
      status: 400,
      code: "VALIDATION_ERROR",
      message: messages.invalidRequest,
      fieldErrors,
    });
  }

  const identifiers = getRateLimitIdentifiers(request, accountId);

  try {
    const rateLimit = await consumeResendLimits(identifiers);

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

    const result = await resendVerificationCode(accountId, locale);

    return createApiSuccessResponse(result);
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