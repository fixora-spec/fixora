import type {
  NextResponse,
} from "next/server";

import {
  AUTH_RATE_LIMIT_ACTIONS,
  AUTH_REQUEST_LIMITS,
} from "@/config/auth.config";

import {
  requestPasswordReset,
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
  validatePasswordResetRequest,
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
  invalidContentType: string;
  requestTooLarge: string;
  invalidJson: string;
  invalidRequest: string;
  rateLimited: string;
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
      invalidContentType:
        "The request must use an uncompressed JSON body.",
      requestTooLarge:
        "The request body is too large.",
      invalidJson:
        "The request body does not contain valid JSON.",
      invalidRequest:
        "Review the email address and account type and try again.",
      rateLimited:
        "Too many password-recovery requests were made. Please wait before trying again.",
      internalError:
        "Password recovery could not be requested at this time.",
    };
  }

  return {
    forbiddenOrigin:
      "El origen de la solicitud no está permitido.",
    invalidContentType:
      "La solicitud debe utilizar un cuerpo JSON sin compresión.",
    requestTooLarge:
      "El contenido de la solicitud es demasiado grande.",
    invalidJson:
      "El contenido de la solicitud no contiene un JSON válido.",
    invalidRequest:
      "Revisa el correo electrónico y el tipo de cuenta e inténtalo nuevamente.",
    rateLimited:
      "Se realizaron demasiadas solicitudes de recuperación. Espera antes de intentarlo nuevamente.",
    internalError:
      "No se pudo solicitar la recuperación de contraseña en este momento.",
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
  const ipAddress = getRequestIpAddress(request) ?? "unknown";

  return [
    `ip:${ipAddress}`,
    `account:${accountRole}:${email}`,
  ];
}

async function consumeRequestLimits(
  identifiers: readonly string[],
): Promise<{
  allowed: boolean;
  retryAfterSeconds: number;
}> {
  let retryAfterSeconds = 0;

  for (const identifier of identifiers) {
    const result = await consumeDefaultAuthRateLimit(
      AUTH_RATE_LIMIT_ACTIONS.passwordResetRequest,
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

type SafeErrorDetails = {
  name?: string;
  message?: string;
  code?: string | number;
  number?: number;
  constraint?: string;
};

function readSafeErrorDetails(
  value: unknown,
): SafeErrorDetails | null {
  if (
    typeof value !== "object"
    || value === null
  ) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const details: SafeErrorDetails = {};

  if (typeof record.name === "string") {
    details.name = record.name;
  }

  if (typeof record.message === "string") {
    details.message = record.message;
  }

  if (
    typeof record.code === "string"
    || typeof record.code === "number"
  ) {
    details.code = record.code;
  }

  if (typeof record.number === "number") {
    details.number = record.number;
  }

  if (typeof record.constraint === "string") {
    details.constraint = record.constraint;
  }

  return Object.keys(details).length > 0
    ? details
    : null;
}

function getSafeErrorChain(
  error: unknown,
): readonly SafeErrorDetails[] {
  const chain: SafeErrorDetails[] = [];
  const visited = new Set<unknown>();
  let current: unknown = error;

  for (let depth = 0; depth < 6; depth += 1) {
    if (
      typeof current !== "object"
      || current === null
      || visited.has(current)
    ) {
      break;
    }

    visited.add(current);

    const details = readSafeErrorDetails(current);

    if (details) {
      chain.push(details);
    }

    const record = current as Record<string, unknown>;

    if (
      typeof record.originalError === "object"
      && record.originalError !== null
    ) {
      current = record.originalError;
      continue;
    }

    if (
      typeof record.cause === "object"
      && record.cause !== null
    ) {
      current = record.cause;
      continue;
    }

    break;
  }

  return chain;
}

function logInternalError(
  stage: string,
  error: unknown,
): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.error(
    `[Fixora][password-reset/request][${stage}]`,
    getSafeErrorChain(error),
  );
}

export async function POST(
  request: Request,
): Promise<NextResponse> {
  const fallbackLocale = resolveLocale(request);
  const fallbackMessages = getMessages(fallbackLocale);

  try {
    verifyRequestOrigin(request);
  } catch (error) {
    if (isRequestOriginError(error)) {
      return createApiErrorResponse({
        status: error.status,
        code: error.code,
        message: fallbackMessages.forbiddenOrigin,
      });
    }

    logInternalError(
      "origin",
      error,
    );

    return createApiErrorResponse({
      status: 500,
      code: "INTERNAL_ERROR",
      message: fallbackMessages.internalError,
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
        message: getJsonBodyErrorMessage(
          error,
          fallbackMessages,
        ),
      });
    }

    logInternalError(
      "body",
      error,
    );

    return createApiErrorResponse({
      status: 500,
      code: "INTERNAL_ERROR",
      message: fallbackMessages.internalError,
    });
  }

  const locale = resolveLocale(request, body);
  const messages = getMessages(locale);

  let input: ReturnType<typeof validatePasswordResetRequest>;

  try {
    input = validatePasswordResetRequest(body);
  } catch (error) {
    if (isAuthValidationError(error)) {
      return createValidationResponse(
        locale,
        error.fieldErrors,
      );
    }

    logInternalError(
      "validation",
      error,
    );

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
    const rateLimit = await consumeRequestLimits(
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

    const result = await requestPasswordReset(
      input,
      {
        ipAddress: getRequestIpAddress(request),
        userAgent: getRequestUserAgent(request),
      },
    );

    return createApiSuccessResponse(result);
  } catch (error) {
    logInternalError(
      "rate-limit-or-service",
      error,
    );

    return createApiErrorResponse({
      status: 500,
      code: "INTERNAL_ERROR",
      message: messages.internalError,
    });
  }
}