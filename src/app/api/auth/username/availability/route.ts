import {
  NextResponse,
} from "next/server";

import {
  USERNAME_RULES,
} from "@/config/auth.config";

import {
  AuthServiceError,
  checkUsernameAvailability,
} from "@/lib/auth/auth.service";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const MAXIMUM_REQUEST_BODY_BYTES =
  8_192;

type JsonRecord =
  Record<string, unknown>;

type SupportedLocale =
  | "es"
  | "en";

type LocalizedMessages = {
  forbiddenOrigin: string;
  invalidContentType: string;
  requestTooLarge: string;
  invalidJson: string;
  invalidUsername: string;
  internalError: string;
};

function isRecord(
  value: unknown,
): value is JsonRecord {
  return (
    typeof value === "object"
    && value !== null
    && !Array.isArray(
      value,
    )
  );
}

function resolveLocale(
  value: unknown,
): SupportedLocale {
  return value === "en"
    ? "en"
    : "es";
}

function getLocalizedMessages(
  locale: SupportedLocale,
): LocalizedMessages {
  if (
    locale === "en"
  ) {
    return {
      forbiddenOrigin:
        "The request origin is not allowed.",

      invalidContentType:
        "The request must use application/json.",

      requestTooLarge:
        "The request body is too large.",

      invalidJson:
        "The request body does not contain valid JSON.",

      invalidUsername:
        `Enter a username between ${USERNAME_RULES.minimumLength} and ${USERNAME_RULES.maximumLength} characters using only letters, numbers, periods, hyphens, or underscores.`,

      internalError:
        "Username availability could not be checked at this time.",
    };
  }

  return {
    forbiddenOrigin:
      "El origen de la solicitud no está permitido.",

    invalidContentType:
      "La solicitud debe utilizar application/json.",

    requestTooLarge:
      "El contenido de la solicitud es demasiado grande.",

    invalidJson:
      "El contenido de la solicitud no contiene un JSON válido.",

    invalidUsername:
      `Ingresa un nombre de pila de entre ${USERNAME_RULES.minimumLength} y ${USERNAME_RULES.maximumLength} caracteres usando solo letras, números, puntos, guiones o guiones bajos.`,

    internalError:
      "No se pudo comprobar la disponibilidad del nombre de pila.",
  };
}

function hasTrustedRequestOrigin(
  request: Request,
): boolean {
  const originHeader =
    request.headers.get(
      "origin",
    );

  const fetchSiteHeader =
    request.headers.get(
      "sec-fetch-site",
    );

  if (
    originHeader === null
  ) {
    return (
      fetchSiteHeader === null
      || fetchSiteHeader
        === "same-origin"
      || fetchSiteHeader
        === "none"
    );
  }

  try {
    return (
      new URL(
        originHeader,
      ).origin
      === new URL(
        request.url,
      ).origin
    );
  } catch {
    return false;
  }
}

function hasJsonContentType(
  request: Request,
): boolean {
  return (
    request.headers
      .get(
        "content-type",
      )
      ?.toLowerCase()
      .includes(
        "application/json",
      )
    ?? false
  );
}

function exceedsMaximumBodySize(
  request: Request,
): boolean {
  const contentLength =
    Number.parseInt(
      request.headers.get(
        "content-length",
      ) ?? "",
      10,
    );

  return (
    Number.isFinite(
      contentLength,
    )
    && contentLength
      > MAXIMUM_REQUEST_BODY_BYTES
  );
}

function normalizeUsername(
  value: unknown,
): string | null {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const username =
    value
      .trim()
      .normalize(
        "NFC",
      );

  if (
    username.length
      < USERNAME_RULES.minimumLength
    || username.length
      > USERNAME_RULES.maximumLength
    || !USERNAME_RULES
      .allowedPattern
      .test(
        username,
      )
  ) {
    return null;
  }

  return username;
}

function createSuccessResponse(
  data: unknown,
): NextResponse {
  return NextResponse.json(
    {
      success:
        true,

      data,
    },
    {
      status:
        200,

      headers: {
        "Cache-Control":
          "no-store",

        Pragma:
          "no-cache",
      },
    },
  );
}

function createErrorResponse(
  status: number,
  code: string,
  message: string,
): NextResponse {
  return NextResponse.json(
    {
      success:
        false,

      error: {
        code,
        message,

        fieldErrors:
          code === "INVALID_USERNAME"
            ? [
                {
                  field:
                    "username",

                  code:
                    "INVALID_USERNAME",
                },
              ]
            : [],
      },
    },
    {
      status,

      headers: {
        "Cache-Control":
          "no-store",

        Pragma:
          "no-cache",
      },
    },
  );
}

function createServiceErrorResponse(
  error: unknown,
  messages: LocalizedMessages,
): NextResponse {
  if (
    error instanceof AuthServiceError
  ) {
    return createErrorResponse(
      error.status,
      error.code,
      error.message,
    );
  }

  console.error(
    "USERNAME_AVAILABILITY_ERROR",
    error,
  );

  return createErrorResponse(
    500,
    "INTERNAL_SERVER_ERROR",
    messages.internalError,
  );
}

async function handleAvailabilityCheck(
  usernameValue: unknown,
  localeValue: unknown,
): Promise<NextResponse> {
  const locale =
    resolveLocale(
      localeValue,
    );

  const messages =
    getLocalizedMessages(
      locale,
    );

  const username =
    normalizeUsername(
      usernameValue,
    );

  if (
    username === null
  ) {
    return createErrorResponse(
      400,
      "INVALID_USERNAME",
      messages.invalidUsername,
    );
  }

  try {
    const result =
      await checkUsernameAvailability(
        username,
        true,
      );

    return createSuccessResponse(
      result,
    );
  } catch (error) {
    return createServiceErrorResponse(
      error,
      messages,
    );
  }
}

export async function GET(
  request: Request,
): Promise<NextResponse> {
  const searchParameters =
    new URL(
      request.url,
    ).searchParams;

  return handleAvailabilityCheck(
    searchParameters.get(
      "username",
    ),
    searchParameters.get(
      "locale",
    ),
  );
}

export async function POST(
  request: Request,
): Promise<NextResponse> {
  const fallbackMessages =
    getLocalizedMessages(
      "es",
    );

  if (
    !hasTrustedRequestOrigin(
      request,
    )
  ) {
    return createErrorResponse(
      403,
      "FORBIDDEN_ORIGIN",
      fallbackMessages
        .forbiddenOrigin,
    );
  }

  if (
    !hasJsonContentType(
      request,
    )
  ) {
    return createErrorResponse(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      fallbackMessages
        .invalidContentType,
    );
  }

  if (
    exceedsMaximumBodySize(
      request,
    )
  ) {
    return createErrorResponse(
      413,
      "REQUEST_BODY_TOO_LARGE",
      fallbackMessages
        .requestTooLarge,
    );
  }

  let body:
    JsonRecord;

  try {
    const bodyValue: unknown =
      await request.json();

    if (
      !isRecord(
        bodyValue,
      )
    ) {
      throw new Error(
        "INVALID_JSON_BODY",
      );
    }

    body =
      bodyValue;
  } catch {
    return createErrorResponse(
      400,
      "INVALID_JSON_BODY",
      fallbackMessages
        .invalidJson,
    );
  }

  return handleAvailabilityCheck(
    body.username,
    body.locale,
  );
}