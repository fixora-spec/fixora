import type {
  NextResponse,
} from "next/server";

import {
  AUTH_RATE_LIMIT_ACTIONS,
  AUTH_REQUEST_LIMITS,
  USERNAME_RULES,
} from "@/config/auth.config";

import {
  checkUsernameAvailability,
} from "@/lib/auth/auth.service";

import {
  consumeDefaultAuthRateLimit,
} from "@/lib/auth/rate-limit";

import {
  getRequestIpAddress,
} from "@/lib/auth/session";

import {
  validateUsername,
} from "@/lib/auth/username";

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
  Locale,
} from "@/types/locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BODY_LIMIT_BYTES = Math.min(
  AUTH_REQUEST_LIMITS.maximumJsonBodyBytes,
  8_192,
);

const MAXIMUM_QUERY_USERNAME_LENGTH = 256;
const UNKNOWN_IP_IDENTIFIER = "unknown";

type Messages = {
  forbiddenOrigin: string;
  invalidContentType: string;
  requestTooLarge: string;
  invalidJson: string;
  invalidUsername: string;
  rateLimited: string;
  internalError: string;
};

function resolveLocale(
  request: Request,
  value?: unknown,
): Locale {
  if (value === "en" || value === "es") {
    return value;
  }

  if (
    typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && "locale" in value
    && (value.locale === "en" || value.locale === "es")
  ) {
    return value.locale;
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
      invalidUsername:
        `Enter a username between ${USERNAME_RULES.minimumLength} and ${USERNAME_RULES.maximumLength} characters using only letters, numbers, periods, hyphens, or underscores.`,
      rateLimited:
        "Too many username checks were made. Please wait before trying again.",
      internalError:
        "Username availability could not be checked at this time.",
    };
  }

  return {
    forbiddenOrigin: "El origen de la solicitud no está permitido.",
    invalidContentType:
      "La solicitud debe utilizar un cuerpo JSON sin compresión.",
    requestTooLarge: "El contenido de la solicitud es demasiado grande.",
    invalidJson: "El contenido de la solicitud no contiene un JSON válido.",
    invalidUsername:
      `Ingresa un nombre de usuario de entre ${USERNAME_RULES.minimumLength} y ${USERNAME_RULES.maximumLength} caracteres usando solo letras, números, puntos, guiones o guiones bajos.`,
    rateLimited:
      "Se realizaron demasiadas comprobaciones de nombre de usuario. Espera antes de intentarlo nuevamente.",
    internalError:
      "No se pudo comprobar la disponibilidad del nombre de usuario.",
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
      return messages.invalidUsername;
  }
}

function readUsernameValue(value: unknown): string | null {
  if (typeof value !== "string" || value.length > MAXIMUM_QUERY_USERNAME_LENGTH) {
    return null;
  }

  return value;
}

function getRateLimitIdentifiers(
  request: Request,
  normalizedUsername: string,
): readonly string[] {
  const ipAddress = getRequestIpAddress(request) ?? UNKNOWN_IP_IDENTIFIER;

  return [
    `ip:${ipAddress}`,
    `username:${normalizedUsername || "invalid"}`,
  ];
}

async function consumeAvailabilityLimits(
  identifiers: readonly string[],
): Promise<{
  allowed: boolean;
  retryAfterSeconds: number;
}> {
  let retryAfterSeconds = 0;

  for (const identifier of identifiers) {
    const result = await consumeDefaultAuthRateLimit(
      AUTH_RATE_LIMIT_ACTIONS.usernameAvailability,
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

async function handleAvailabilityCheck(
  request: Request,
  usernameValue: unknown,
  localeValue?: unknown,
): Promise<NextResponse> {
  const locale = resolveLocale(request, localeValue);
  const messages = getMessages(locale);
  const username = readUsernameValue(usernameValue);

  if (username === null) {
    return createApiErrorResponse({
      status: 400,
      code: "INVALID_USERNAME",
      message: messages.invalidUsername,
      fieldErrors: [
        {
          field: "username",
          code: "INVALID_USERNAME",
        },
      ],
    });
  }

  const validation = validateUsername(username);
  const rateLimitIdentifiers = getRateLimitIdentifiers(
    request,
    validation.normalizedValue,
  );

  try {
    const rateLimit = await consumeAvailabilityLimits(
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

    if (!validation.valid) {
      return createApiSuccessResponse({
        username: validation.value,
        normalizedUsername: validation.normalizedValue,
        available: false,
        reason: "INVALID" as const,
        suggestions: [] as readonly string[],
      });
    }

    const result = await checkUsernameAvailability(
      validation.value,
      true,
    );

    return createApiSuccessResponse(result);
  } catch {
    return createApiErrorResponse({
      status: 500,
      code: "INTERNAL_ERROR",
      message: messages.internalError,
    });
  }
}

export async function GET(
  request: Request,
): Promise<NextResponse> {
  const requestUrl = new URL(request.url);
  const locale = resolveLocale(
    request,
    requestUrl.searchParams.get("locale"),
  );

  try {
    verifyRequestOrigin(request, {
      allowSafeMethods: false,
      requireOrigin: false,
    });
  } catch (error) {
    if (isRequestOriginError(error)) {
      return createApiErrorResponse({
        status: error.status,
        code: error.code,
        message: getMessages(locale).forbiddenOrigin,
      });
    }

    return createApiErrorResponse({
      status: 500,
      code: "INTERNAL_ERROR",
      message: getMessages(locale).internalError,
    });
  }

  return handleAvailabilityCheck(
    request,
    requestUrl.searchParams.get("username"),
    locale,
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

  return handleAvailabilityCheck(
    request,
    body.username,
    body,
  );
}