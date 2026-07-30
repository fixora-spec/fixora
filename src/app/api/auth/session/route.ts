import { NextResponse } from "next/server";

import {
  findAccountById,
  toAccountPublicRecord,
} from "@/lib/auth/account.repository";

import {
  getSessionTokenFromRequest,
  revokeAuthSessionByToken,
  touchAuthSession,
  validateAuthSessionToken,
} from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_COOKIE_NAME = "fixora_session";
const COOKIE_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/u;
const MINIMUM_TOKEN_LENGTH = 20;
const MAXIMUM_TOKEN_LENGTH = 4_096;

type Locale = "es" | "en";

type SessionResult =
  | {
      authenticated: false;
      account: null;
      expiresAt: null;
    }
  | {
      authenticated: true;
      account: {
        accountId: string;
        role: "USER" | "ADMIN";
        status:
          | "PENDING_VERIFICATION"
          | "ACTIVE"
          | "DISABLED"
          | "LOCKED";
        firstNames: string;
        lastNames: string;
        username: string;
        email: string;
        emailVerifiedAt: string | null;
        createdAt: string;
        lastSignInAt: string | null;
      };
      expiresAt: string;
    };

function resolveLocale(
  request: Request,
): Locale {
  const explicitLocale =
    request.headers
      .get("x-fixora-locale")
      ?.trim()
      .toLowerCase();

  if (explicitLocale === "en") {
    return "en";
  }

  if (explicitLocale === "es") {
    return "es";
  }

  return request.headers
    .get("accept-language")
    ?.toLowerCase()
    .startsWith("en")
    ? "en"
    : "es";
}

function resolveCookieName(): string {
  const configuredName =
    process.env.AUTH_SESSION_COOKIE_NAME?.trim();

  return (
    configuredName
    && COOKIE_NAME_PATTERN.test(configuredName)
  )
    ? configuredName
    : DEFAULT_COOKIE_NAME;
}

function isValidToken(
  value: string | null,
): value is string {
  return (
    value !== null
    && value.length >= MINIMUM_TOKEN_LENGTH
    && value.length <= MAXIMUM_TOKEN_LENGTH
  );
}

function clearCookie(
  response: NextResponse,
): void {
  response.cookies.set({
    name: resolveCookieName(),
    value: "",
    httpOnly: true,
    secure:
      process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });
}

function unauthenticatedResult(): SessionResult {
  return {
    authenticated: false,
    account: null,
    expiresAt: null,
  };
}

function createSessionResponse(
  result: SessionResult,
  shouldClearCookie = false,
): NextResponse {
  const response = NextResponse.json(
    {
      success: true,
      data: result,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
    },
  );

  if (shouldClearCookie) {
    clearCookie(response);
  }

  return response;
}

function createErrorResponse(
  locale: Locale,
): NextResponse {
  const message =
    locale === "en"
      ? "The session could not be loaded at this time."
      : "No se pudo cargar la sesión en este momento.";

  return NextResponse.json(
    {
      success: false,
      error: {
        code: "SESSION_LOAD_FAILED",
        message,
        fieldErrors: [],
      },
    },
    {
      status: 500,
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
    },
  );
}

export async function GET(
  request: Request,
): Promise<NextResponse> {
  const locale =
    resolveLocale(request);

  const sessionToken =
    getSessionTokenFromRequest(
      request,
    );

  if (
    !isValidToken(
      sessionToken,
    )
  ) {
    return createSessionResponse(
      unauthenticatedResult(),
      sessionToken !== null,
    );
  }

  try {
    const validation =
      await validateAuthSessionToken(
        sessionToken,
      );

    if (
      !validation.valid
    ) {
      return createSessionResponse(
        unauthenticatedResult(),
        true,
      );
    }

    const account =
      await findAccountById(
        validation
          .session
          .accountId,
      );

    if (
      account === null
      || account.status
        !== "ACTIVE"
      || account.emailVerifiedAt
        === null
    ) {
      await revokeAuthSessionByToken(
        sessionToken,
        "ACCOUNT_NOT_ACTIVE",
      );

      return createSessionResponse(
        unauthenticatedResult(),
        true,
      );
    }

    try {
      await touchAuthSession(
        validation
          .session
          .sessionId,
      );
    } catch {
      /*
       * No cerramos una sesión válida solamente
       * porque falle la actualización de last_seen_at.
       */
    }

    const publicAccount =
      toAccountPublicRecord(
        account,
      );

    return createSessionResponse({
      authenticated:
        true,

      account: {
        accountId:
          publicAccount.accountId,

        role:
          publicAccount.role,

        status:
          publicAccount.status,

        firstNames:
          publicAccount.firstNames,

        lastNames:
          publicAccount.lastNames,

        username:
          publicAccount.username,

        email:
          publicAccount.email,

        emailVerifiedAt:
          publicAccount
            .emailVerifiedAt
            ?.toISOString()
          ?? null,

        createdAt:
          publicAccount
            .createdAt
            .toISOString(),

        lastSignInAt:
          publicAccount
            .lastSignInAt
            ?.toISOString()
          ?? null,
      },

      expiresAt:
        validation
          .session
          .expiresAt
          .toISOString(),
    });
  } catch {
    return createErrorResponse(
      locale,
    );
  }
}