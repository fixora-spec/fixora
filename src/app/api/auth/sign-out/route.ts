import { NextResponse } from "next/server";

import {
  getSessionTokenFromRequest,
  revokeAuthSessionByToken,
} from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_COOKIE_NAME =
  "fixora_session";

const COOKIE_NAME_PATTERN =
  /^[A-Za-z0-9_-]{1,64}$/u;

const MINIMUM_TOKEN_LENGTH =
  20;

const MAXIMUM_TOKEN_LENGTH =
  4_096;

type Locale =
  | "es"
  | "en";

type LocalizedMessages = {
  forbiddenOrigin: string;
  signedOut: string;
  internalError: string;
};

function resolveLocale(
  request: Request,
): Locale {
  const explicitLocale =
    request.headers
      .get("x-fixora-locale")
      ?.trim()
      .toLowerCase();

  if (
    explicitLocale === "en"
  ) {
    return "en";
  }

  if (
    explicitLocale === "es"
  ) {
    return "es";
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
): LocalizedMessages {
  return locale === "en"
    ? {
        forbiddenOrigin:
          "The request origin is not allowed.",

        signedOut:
          "The session was closed successfully.",

        internalError:
          "The session could not be revoked at this time.",
      }
    : {
        forbiddenOrigin:
          "El origen de la solicitud no está permitido.",

        signedOut:
          "La sesión se cerró correctamente.",

        internalError:
          "No se pudo revocar la sesión en este momento.",
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

  if (
    origin === null
  ) {
    return (
      fetchSite === null
      || fetchSite === "same-origin"
      || fetchSite === "none"
    );
  }

  try {
    return (
      new URL(origin).origin
      === new URL(
        request.url,
      ).origin
    );
  } catch {
    return false;
  }
}

function resolveCookieName():
  string {
  const configuredName =
    process.env
      .AUTH_SESSION_COOKIE_NAME
      ?.trim();

  return (
    configuredName
    && COOKIE_NAME_PATTERN.test(
      configuredName,
    )
  )
    ? configuredName
    : DEFAULT_COOKIE_NAME;
}

function isValidToken(
  value: string | null,
): value is string {
  return (
    value !== null
    && value.length
      >= MINIMUM_TOKEN_LENGTH
    && value.length
      <= MAXIMUM_TOKEN_LENGTH
  );
}

function clearCookie(
  response: NextResponse,
): void {
  response.cookies.set({
    name:
      resolveCookieName(),

    value:
      "",

    httpOnly:
      true,

    secure:
      process.env.NODE_ENV
      === "production",

    sameSite:
      "lax",

    path:
      "/",

    expires:
      new Date(0),

    maxAge:
      0,
  });
}

function createSuccessResponse(
  message: string,
): NextResponse {
  const response =
    NextResponse.json(
      {
        success:
          true,

        data: {
          signedOut:
            true,

          message,
        },
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

  clearCookie(
    response,
  );

  return response;
}

function createFailureResponse(
  status: number,
  code: string,
  message: string,
  shouldClearCookie: boolean,
): NextResponse {
  const response =
    NextResponse.json(
      {
        success:
          false,

        error: {
          code,
          message,

          fieldErrors:
            [],
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

  if (
    shouldClearCookie
  ) {
    clearCookie(
      response,
    );
  }

  return response;
}

export async function POST(
  request: Request,
): Promise<NextResponse> {
  const locale =
    resolveLocale(
      request,
    );

  const messages =
    getMessages(
      locale,
    );

  if (
    !hasTrustedOrigin(
      request,
    )
  ) {
    return createFailureResponse(
      403,
      "FORBIDDEN_ORIGIN",
      messages.forbiddenOrigin,
      false,
    );
  }

  const sessionToken =
    getSessionTokenFromRequest(
      request,
    );

  if (
    !isValidToken(
      sessionToken,
    )
  ) {
    return createSuccessResponse(
      messages.signedOut,
    );
  }

  try {
    await revokeAuthSessionByToken(
      sessionToken,
      "SIGN_OUT",
    );

    return createSuccessResponse(
      messages.signedOut,
    );
  } catch {
    return createFailureResponse(
      500,
      "SIGN_OUT_FAILED",
      messages.internalError,
      true,
    );
  }
}