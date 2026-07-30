import { NextResponse } from "next/server";

import { AUTH_RATE_LIMIT_ACTIONS } from "@/config/auth.config";

import {
  isAuthServiceError,
  resendVerificationCode,
  type AuthServiceErrorCode,
} from "@/lib/auth/auth.service";

import { consumeDefaultAuthRateLimit } from "@/lib/auth/rate-limit";
import { getRequestIpAddress } from "@/lib/auth/session";

import type { AuthErrorCode } from "@/types/auth";
import type { Locale } from "@/types/locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAXIMUM_REQUEST_BODY_BYTES = 8_192;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type JsonRecord = Record<string, unknown>;

type ApiFieldError = {
  field: string;
  code: AuthErrorCode;
};

type LocalizedMessages = {
  forbiddenOrigin: string;
  invalidContentType: string;
  requestTooLarge: string;
  invalidJson: string;
  invalidAccountId: string;
  invalidLocale: string;
  rateLimited: string;
  accountNotFound: string;
  accountUnavailable: string;
  resendBlocked: string;
  emailDeliveryFailed: string;
  internalError: string;
};

function isRecord(
  value: unknown,
): value is JsonRecord {
  return (
    typeof value === "object"
    && value !== null
    && !Array.isArray(value)
  );
}

function getMessages(
  locale: Locale,
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

      invalidAccountId:
        "The account identifier is invalid.",

      invalidLocale:
        "The selected language is invalid.",

      rateLimited:
        "Too many verification-code requests were made. Please wait before trying again.",

      accountNotFound:
        "The requested account does not exist.",

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
    forbiddenOrigin:
      "El origen de la solicitud no está permitido.",

    invalidContentType:
      "La solicitud debe utilizar application/json.",

    requestTooLarge:
      "El contenido de la solicitud es demasiado grande.",

    invalidJson:
      "El contenido de la solicitud no contiene un JSON válido.",

    invalidAccountId:
      "El identificador de la cuenta no es válido.",

    invalidLocale:
      "El idioma seleccionado no es válido.",

    rateLimited:
      "Se realizaron demasiadas solicitudes de códigos. Espera antes de intentarlo nuevamente.",

    accountNotFound:
      "La cuenta solicitada no existe.",

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

function hasTrustedOrigin(
  request: Request,
): boolean {
  const origin =
    request.headers.get(
      "origin",
    );

  const fetchSite =
    request.headers.get(
      "sec-fetch-site",
    );

  if (origin === null) {
    return (
      fetchSite === null
      || fetchSite === "same-origin"
      || fetchSite === "none"
    );
  }

  try {
    return (
      new URL(origin).origin
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
      .includes("application/json")
    ?? false
  );
}

function exceedsMaximumBodySize(
  request: Request,
): boolean {
  const contentLength =
    request.headers.get(
      "content-length",
    );

  if (contentLength === null) {
    return false;
  }

  const parsedLength =
    Number.parseInt(
      contentLength,
      10,
    );

  return (
    Number.isFinite(parsedLength)
    && parsedLength
      > MAXIMUM_REQUEST_BODY_BYTES
  );
}

async function readJsonBody(
  request: Request,
): Promise<JsonRecord | null> {
  try {
    const body: unknown =
      await request.json();

    return isRecord(body)
      ? body
      : null;
  } catch {
    return null;
  }
}

function normalizeLocale(
  value: unknown,
): Locale | null {
  return (
    value === "es"
    || value === "en"
  )
    ? value
    : null;
}

function normalizeAccountId(
  value: unknown,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const accountId =
    value.trim();

  return UUID_PATTERN.test(
    accountId,
  )
    ? accountId.toLowerCase()
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
  messages: LocalizedMessages,
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

function createErrorResponse({
  status,
  code,
  message,
  fieldErrors = [],
  retryAfterSeconds = null,
}: {
  status: number;
  code: AuthErrorCode;
  message: string;
  fieldErrors?: readonly ApiFieldError[];
  retryAfterSeconds?: number | null;
}): NextResponse {
  const headers:
    Record<string, string> = {
      "Cache-Control":
        "no-store",

      Pragma:
        "no-cache",
    };

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

        ...(retryAfterSeconds
          ? {
              retryAfterSeconds:
                Math.ceil(
                  retryAfterSeconds,
                ),
            }
          : {}),
      },
    },
    {
      status,
      headers,
    },
  );
}

export async function POST(
  request: Request,
): Promise<NextResponse> {
  const fallbackMessages =
    getMessages("es");

  if (!hasTrustedOrigin(request)) {
    return createErrorResponse({
      status:
        403,

      code:
        "INVALID_ORIGIN",

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
        "INVALID_REQUEST",

      message:
        fallbackMessages
          .invalidContentType,
    });
  }

  if (exceedsMaximumBodySize(request)) {
    return createErrorResponse({
      status:
        413,

      code:
        "BODY_TOO_LARGE",

      message:
        fallbackMessages
          .requestTooLarge,
    });
  }

  const body =
    await readJsonBody(request);

  if (body === null) {
    return createErrorResponse({
      status:
        400,

      code:
        "INVALID_JSON",

      message:
        fallbackMessages
          .invalidJson,
    });
  }

  const locale =
    normalizeLocale(
      body.locale,
    );

  const accountId =
    normalizeAccountId(
      body.accountId,
    );

  const messages =
    getMessages(
      locale ?? "es",
    );

  const fieldErrors:
    ApiFieldError[] = [];

  if (accountId === null) {
    fieldErrors.push({
      field:
        "accountId",

      code:
        "INVALID_REQUEST",
    });
  }

  if (locale === null) {
    fieldErrors.push({
      field:
        "locale",

      code:
        "INVALID_REQUEST",
    });
  }

  if (
    accountId === null
    || locale === null
  ) {
    return createErrorResponse({
      status:
        400,

      code:
        "VALIDATION_ERROR",

      message:
        accountId === null
          ? messages.invalidAccountId
          : messages.invalidLocale,

      fieldErrors,
    });
  }

  try {
    const ipAddress =
      getRequestIpAddress(
        request,
      )
      ?? "unknown";

    const rateLimit =
      await consumeDefaultAuthRateLimit(
        AUTH_RATE_LIMIT_ACTIONS
          .verificationResend,

        `${accountId}:${ipAddress}`,
      );

    if (!rateLimit.allowed) {
      return createErrorResponse({
        status:
          429,

        code:
          "RATE_LIMITED",

        message:
          messages.rateLimited,

        retryAfterSeconds:
          rateLimit
            .retryAfterSeconds,
      });
    }

    const result =
      await resendVerificationCode(
        accountId,
        locale,
      );

    return NextResponse.json(
      {
        success:
          true,

        data:
          result,
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
  } catch (error) {
    if (isAuthServiceError(error)) {
      return createErrorResponse({
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

        retryAfterSeconds:
          error.retryAfterSeconds,
      });
    }

    return createErrorResponse({
      status:
        500,

      code:
        "INTERNAL_ERROR",

      message:
        messages.internalError,
    });
  }
}