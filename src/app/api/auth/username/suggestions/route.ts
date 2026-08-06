import type {
  NextResponse,
} from "next/server";

import {
  AUTH_RATE_LIMIT_ACTIONS,
  AUTH_REQUEST_LIMITS,
  PERSON_NAME_RULES,
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
  isAuthValidationError,
  validatePersonName,
} from "@/lib/auth/validation";

import {
  generateUsernameCandidates,
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

const MAXIMUM_SUGGESTION_COUNT = 5;
const MAXIMUM_QUERY_VALUE_LENGTH = 256;
const UNKNOWN_IP_IDENTIFIER = "unknown";

type Messages = {
  forbiddenOrigin: string;
  invalidContentType: string;
  requestTooLarge: string;
  invalidJson: string;
  invalidUsername: string;
  invalidFirstNames: string;
  rateLimited: string;
  internalError: string;
};

type SuggestionInput = {
  username: unknown;
  firstNames: unknown;
  count: unknown;
  locale: unknown;
};

function resolveLocale(
  request: Request,
  value?: unknown,
): Locale {
  if (value === "es" || value === "en") {
    return value;
  }

  if (
    typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && "locale" in value
    && (value.locale === "es" || value.locale === "en")
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
      invalidFirstNames:
        `Enter valid first names of no more than ${PERSON_NAME_RULES.firstNamesMaximumLength} characters.`,
      rateLimited:
        "Too many username suggestions were requested. Please wait before trying again.",
      internalError:
        "Username suggestions could not be generated at this time.",
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
    invalidFirstNames:
      `Ingresa nombres válidos de hasta ${PERSON_NAME_RULES.firstNamesMaximumLength} caracteres.`,
    rateLimited:
      "Se solicitaron demasiadas sugerencias de nombre de usuario. Espera antes de intentarlo nuevamente.",
    internalError:
      "No se pudieron generar sugerencias de nombres de usuario.",
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

function readLimitedString(value: unknown): string | null {
  if (
    typeof value !== "string"
    || value.length > MAXIMUM_QUERY_VALUE_LENGTH
    || /[\r\n\0]/u.test(value)
  ) {
    return null;
  }

  return value;
}

function normalizeSuggestionCount(value: unknown): number {
  if (typeof value === "undefined" || value === null || value === "") {
    return MAXIMUM_SUGGESTION_COUNT;
  }

  const parsedValue = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+$/u.test(value.trim())
      ? Number.parseInt(value.trim(), 10)
      : Number.NaN;

  if (!Number.isSafeInteger(parsedValue)) {
    return MAXIMUM_SUGGESTION_COUNT;
  }

  return Math.min(
    MAXIMUM_SUGGESTION_COUNT,
    Math.max(1, parsedValue),
  );
}

function normalizeFirstNames(
  value: unknown,
): {
  value: string | undefined;
  fieldErrors: readonly AuthFieldError[];
} {
  if (typeof value === "undefined" || value === null || value === "") {
    return {
      value: undefined,
      fieldErrors: [],
    };
  }

  const rawValue = readLimitedString(value);

  if (rawValue === null) {
    return {
      value: undefined,
      fieldErrors: [
        {
          field: "firstNames",
          code: "INVALID_NAME",
        },
      ],
    };
  }

  try {
    return {
      value: validatePersonName(rawValue, "firstNames"),
      fieldErrors: [],
    };
  } catch (error) {
    if (isAuthValidationError(error)) {
      return {
        value: undefined,
        fieldErrors: error.fieldErrors,
      };
    }

    throw error;
  }
}

function getRateLimitIdentifiers(
  request: Request,
  normalizedUsername: string,
): readonly string[] {
  const ipAddress = getRequestIpAddress(request) ?? UNKNOWN_IP_IDENTIFIER;

  return [
    `suggestions:ip:${ipAddress}`,
    `suggestions:username:${normalizedUsername || "invalid"}`,
  ];
}

async function consumeSuggestionLimits(
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

async function handleSuggestionRequest(
  request: Request,
  input: SuggestionInput,
): Promise<NextResponse> {
  const locale = resolveLocale(request, input.locale);
  const messages = getMessages(locale);
  const rawUsername = readLimitedString(input.username);

  if (rawUsername === null) {
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

  const usernameValidation = validateUsername(rawUsername);

  if (!usernameValidation.valid) {
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

  let firstNamesResult: ReturnType<typeof normalizeFirstNames>;

  try {
    firstNamesResult = normalizeFirstNames(input.firstNames);
  } catch {
    return createApiErrorResponse({
      status: 500,
      code: "INTERNAL_ERROR",
      message: messages.internalError,
    });
  }

  if (firstNamesResult.fieldErrors.length > 0) {
    return createApiErrorResponse({
      status: 400,
      code: "VALIDATION_ERROR",
      message: messages.invalidFirstNames,
      fieldErrors: firstNamesResult.fieldErrors,
    });
  }

  const count = normalizeSuggestionCount(input.count);
  const identifiers = getRateLimitIdentifiers(
    request,
    usernameValidation.normalizedValue,
  );

  try {
    const rateLimit = await consumeSuggestionLimits(identifiers);

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

    const candidates = generateUsernameCandidates({
      requestedUsername: usernameValidation.value,
      firstNames: firstNamesResult.value,
      maximumCandidates: Math.max(12, count * 4),
    });

    const suggestions: string[] = [];

    for (const candidate of candidates) {
      const availability = await checkUsernameAvailability(
        candidate,
        false,
      );

      if (availability.available) {
        suggestions.push(candidate);
      }

      if (suggestions.length >= count) {
        break;
      }
    }

    return createApiSuccessResponse({
      suggestions: Object.freeze([...suggestions]) as readonly string[],
    });
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

  return handleSuggestionRequest(request, {
    username:
      requestUrl.searchParams.get("username")
      ?? requestUrl.searchParams.get("baseUsername"),
    firstNames:
      requestUrl.searchParams.get("firstNames")
      ?? requestUrl.searchParams.get("firstName"),
    count:
      requestUrl.searchParams.get("count")
      ?? requestUrl.searchParams.get("limit"),
    locale,
  });
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

  return handleSuggestionRequest(request, {
    username: body.username ?? body.baseUsername,
    firstNames: body.firstNames ?? body.firstName,
    count: body.count ?? body.limit,
    locale: body,
  });
}