import {
  NextResponse,
} from "next/server";

import {
  AUTH_RATE_LIMIT_ACTIONS,
} from "@/config/auth.config";

import {
  isAuthServiceError,
  signInAdmin,
} from "@/lib/auth/auth.service";

import {
  consumeDefaultAuthRateLimit,
  resetAuthRateLimit,
} from "@/lib/auth/rate-limit";

import {
  getRequestIpAddress,
  getRequestUserAgent,
} from "@/lib/auth/session";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const MAXIMUM_REQUEST_BODY_BYTES =
  8_192;

const EMAIL_PATTERN =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

type SupportedLocale =
  | "es"
  | "en";

type JsonRecord =
  Record<string, unknown>;

type FieldError = {
  field: string;
  code: string;
};

type LocalizedMessages = {
  forbiddenOrigin: string;
  invalidContentType: string;
  requestTooLarge: string;
  invalidJson: string;
  invalidRequest: string;
  invalidCredentials: string;
  accountLocked: string;
  accountInactive: string;
  accessNotStarted: string;
  accessExpired: string;
  accessInvalid: string;
  tooManyAttempts: string;
  internalError: string;
};

function isJsonRecord(
  value: unknown,
): value is JsonRecord {
  return (
    typeof value === "object"
    && value !== null
    && !Array.isArray(value)
  );
}

function resolveLocale(
  value: unknown,
): SupportedLocale {
  return value === "en"
    ? "en"
    : "es";
}

function getMessages(
  locale: SupportedLocale,
): LocalizedMessages {
  if (locale === "en") {
    return {
      forbiddenOrigin:
        "The request origin is not allowed.",

      invalidContentType:
        "The request must use application/json.",

      requestTooLarge:
        "The request body is too large.",

      invalidJson:
        "The request body does not contain valid JSON.",

      invalidRequest:
        "Enter a valid administrator email and password.",

      invalidCredentials:
        "The administrator email or password is incorrect.",

      accountLocked:
        "The administrator account is temporarily locked.",

      accountInactive:
        "The administrator account is not active.",

      accessNotStarted:
        "Administrator access has not started yet.",

      accessExpired:
        "Administrator access has expired.",

      accessInvalid:
        "The administrator access period is invalid.",

      tooManyAttempts:
        "Too many sign-in attempts. Try again later.",

      internalError:
        "Administrator access is temporarily unavailable.",
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

    invalidRequest:
      "Ingresa un correo y una contraseña de administrador válidos.",

    invalidCredentials:
      "El correo o la contraseña del administrador son incorrectos.",

    accountLocked:
      "La cuenta administradora está bloqueada temporalmente.",

    accountInactive:
      "La cuenta administradora no se encuentra activa.",

    accessNotStarted:
      "El acceso administrativo todavía no ha iniciado.",

    accessExpired:
      "El acceso administrativo ha vencido.",

    accessInvalid:
      "La vigencia del acceso administrativo no es válida.",

    tooManyAttempts:
      "Se realizaron demasiados intentos. Inténtalo más tarde.",

    internalError:
      "El acceso administrativo no está disponible temporalmente.",
  };
}

function createNoStoreHeaders():
  Record<string, string> {
  return {
    "Cache-Control":
      "no-store, no-cache, must-revalidate, proxy-revalidate",

    Pragma:
      "no-cache",

    Expires:
      "0",
  };
}

function createErrorResponse({
  status,
  code,
  message,
  fieldErrors = [],
  retryAfterSeconds = null,
}: {
  status: number;
  code: string;
  message: string;
  fieldErrors?: readonly FieldError[];
  retryAfterSeconds?: number | null;
}): NextResponse {
  const headers =
    createNoStoreHeaders();

  if (
    typeof retryAfterSeconds
      === "number"
    && Number.isFinite(
      retryAfterSeconds,
    )
    && retryAfterSeconds > 0
  ) {
    headers["Retry-After"] =
      String(
        Math.ceil(
          retryAfterSeconds,
        ),
      );
  }

  return NextResponse.json(
    {
      success:
        false,

      error: {
        code,
        message,
        fieldErrors:
          [...fieldErrors],
      },
    },
    {
      status,
      headers,
    },
  );
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

  if (!originHeader) {
    return (
      !fetchSiteHeader
      || fetchSiteHeader
        === "same-origin"
      || fetchSiteHeader
        === "none"
    );
  }

  try {
    return (
      new URL(originHeader).origin
      === new URL(request.url).origin
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
      .get("content-type")
      ?.toLowerCase()
      .includes(
        "application/json",
      )
    ?? false
  );
}

async function readJsonBody(
  request: Request,
): Promise<
  | {
      ok: true;
      body: JsonRecord;
    }
  | {
      ok: false;
      reason:
        | "TOO_LARGE"
        | "INVALID_JSON";
    }
> {
  const contentLength =
    request.headers.get(
      "content-length",
    );

  if (contentLength) {
    const parsedLength =
      Number.parseInt(
        contentLength,
        10,
      );

    if (
      Number.isFinite(
        parsedLength,
      )
      && parsedLength
        > MAXIMUM_REQUEST_BODY_BYTES
    ) {
      return {
        ok:
          false,

        reason:
          "TOO_LARGE",
      };
    }
  }

  let rawBody:
    string;

  try {
    rawBody =
      await request.text();
  } catch {
    return {
      ok:
        false,

      reason:
        "INVALID_JSON",
    };
  }

  if (
    Buffer.byteLength(
      rawBody,
      "utf8",
    ) > MAXIMUM_REQUEST_BODY_BYTES
  ) {
    return {
      ok:
        false,

      reason:
        "TOO_LARGE",
    };
  }

  try {
    const parsedBody:
      unknown =
      JSON.parse(rawBody);

    if (!isJsonRecord(parsedBody)) {
      return {
        ok:
          false,

        reason:
          "INVALID_JSON",
      };
    }

    return {
      ok:
        true,

      body:
        parsedBody,
    };
  } catch {
    return {
      ok:
        false,

      reason:
        "INVALID_JSON",
    };
  }
}

function normalizeEmail(
  value: unknown,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const email =
    value
      .trim()
      .normalize("NFC")
      .toLowerCase();

  if (
    email.length < 5
    || email.length > 320
    || !EMAIL_PATTERN.test(email)
  ) {
    return null;
  }

  return email;
}

function normalizePassword(
  value: unknown,
): string | null {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > 128
  ) {
    return null;
  }

  return value;
}

function createRateLimitIdentifier(
  email: string,
  ipAddress: string | null,
): string {
  return `${ipAddress ?? "unknown"}|${email}`;
}

function getServiceErrorMessage(
  code: string,
  messages: LocalizedMessages,
): string {
  switch (code) {
    case "INVALID_CREDENTIALS":
    case "ROLE_MISMATCH":
      return messages.invalidCredentials;

    case "ACCOUNT_LOCKED":
      return messages.accountLocked;

    case "EMAIL_NOT_VERIFIED":
    case "ACCOUNT_INACTIVE":
      return messages.accountInactive;

    case "ACCOUNT_ACCESS_NOT_STARTED":
      return messages.accessNotStarted;

    case "ACCOUNT_ACCESS_EXPIRED":
      return messages.accessExpired;

    case "ACCOUNT_ACCESS_INVALID":
      return messages.accessInvalid;

    default:
      return messages.internalError;
  }
}

export async function POST(
  request: Request,
): Promise<NextResponse> {
  const fallbackMessages =
    getMessages("es");

  if (!hasTrustedRequestOrigin(request)) {
    return createErrorResponse({
      status:
        403,

      code:
        "FORBIDDEN_ORIGIN",

      message:
        fallbackMessages
          .forbiddenOrigin,
    });
  }

  if (!hasJsonContentType(request)) {
    return createErrorResponse({
      status:
        415,

      code:
        "UNSUPPORTED_MEDIA_TYPE",

      message:
        fallbackMessages
          .invalidContentType,
    });
  }

  const parsedBody =
    await readJsonBody(
      request,
    );

  if (!parsedBody.ok) {
    return createErrorResponse({
      status:
        parsedBody.reason
          === "TOO_LARGE"
          ? 413
          : 400,

      code:
        parsedBody.reason
          === "TOO_LARGE"
          ? "REQUEST_BODY_TOO_LARGE"
          : "INVALID_JSON_BODY",

      message:
        parsedBody.reason
          === "TOO_LARGE"
          ? fallbackMessages
              .requestTooLarge
          : fallbackMessages
              .invalidJson,
    });
  }

  const locale =
    resolveLocale(
      parsedBody.body.locale,
    );

  const messages =
    getMessages(locale);

  const email =
    normalizeEmail(
      parsedBody.body.email,
    );

  const password =
    normalizePassword(
      parsedBody.body.password,
    );

  if (
    email === null
    || password === null
  ) {
    const fieldErrors:
      FieldError[] = [];

    if (email === null) {
      fieldErrors.push({
        field:
          "email",

        code:
          "INVALID_EMAIL",
      });
    }

    if (password === null) {
      fieldErrors.push({
        field:
          "password",

        code:
          "PASSWORD_REQUIRED",
      });
    }

    return createErrorResponse({
      status:
        400,

      code:
        "INVALID_ADMIN_SIGN_IN_REQUEST",

      message:
        messages.invalidRequest,

      fieldErrors,
    });
  }

  const ipAddress =
    getRequestIpAddress(
      request,
    );

  const userAgent =
    getRequestUserAgent(
      request,
    );

  const rateLimitIdentifier =
    createRateLimitIdentifier(
      email,
      ipAddress,
    );

  try {
    const rateLimit =
      await consumeDefaultAuthRateLimit(
        AUTH_RATE_LIMIT_ACTIONS
          .adminSignIn,
        rateLimitIdentifier,
      );

    if (!rateLimit.allowed) {
      return createErrorResponse({
        status:
          429,

        code:
          "TOO_MANY_ATTEMPTS",

        message:
          messages.tooManyAttempts,

        retryAfterSeconds:
          rateLimit
            .retryAfterSeconds,
      });
    }

    const result =
      await signInAdmin(
        {
          email,
          password,
          locale,
        },
        {
          ipAddress,
          userAgent,
        },
      );

    try {
      await resetAuthRateLimit(
        AUTH_RATE_LIMIT_ACTIONS
          .adminSignIn,
        rateLimitIdentifier,
      );
    } catch (resetError) {
      console.error(
        "No se pudo reiniciar el límite de intentos administrativos.",
        resetError,
      );
    }

    const response =
      NextResponse.json(
        {
          success:
            true,

          data: {
            account:
              result.account,

            session: {
              expiresAt:
                result.session
                  .expiresAt,
            },
          },
        },
        {
          status:
            200,

          headers:
            createNoStoreHeaders(),
        },
      );

    response.headers.append(
      "Set-Cookie",
      result.session
        .cookieHeader,
    );

    return response;
  } catch (error) {
    if (isAuthServiceError(error)) {
      return createErrorResponse({
        status:
          error.status,

        code:
          error.code,

        message:
          getServiceErrorMessage(
            error.code,
            messages,
          ),

        retryAfterSeconds:
          error.retryAfterSeconds,
      });
    }

    console.error(
      "No se pudo iniciar la sesión administrativa.",
      error,
    );

    return createErrorResponse({
      status:
        500,

      code:
        "INTERNAL_SERVER_ERROR",

      message:
        messages.internalError,
    });
  }
}