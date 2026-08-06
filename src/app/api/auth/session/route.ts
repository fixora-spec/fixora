import { NextResponse } from "next/server";

import {
  findAccountById,
  toAccountPublicRecord,
} from "@/lib/auth/account.repository";
import { resolveAccountAccessState } from "@/lib/auth/account-access";
import {
  createExpiredSessionCookieHeader,
  getSessionTokenFromRequest,
  revokeAuthSessionByToken,
  touchAuthSession,
  validateAuthSessionToken,
} from "@/lib/auth/session";
import {
  createApiErrorResponse,
  createApiSuccessResponse,
} from "@/lib/http/api-response";
import type { Locale } from "@/types/locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function resolveLocale(request: Request): Locale {
  const explicitLocale = request.headers
    .get("x-fixora-locale")
    ?.trim()
    .toLowerCase();

  if (explicitLocale === "en") {
    return "en";
  }

  return request.headers
    .get("accept-language")
    ?.toLowerCase()
    .startsWith("en")
    ? "en"
    : "es";
}

function getInternalErrorMessage(locale: Locale): string {
  return locale === "en"
    ? "The session could not be loaded at this time."
    : "No se pudo cargar la sesión en este momento.";
}

function unauthenticatedResult(): SessionResult {
  return {
    authenticated: false,
    account: null,
    expiresAt: null,
  };
}

function appendExpiredSessionCookie(response: NextResponse): void {
  response.headers.append(
    "Set-Cookie",
    createExpiredSessionCookieHeader(),
  );
}

function createUnauthenticatedResponse(
  shouldClearCookie: boolean,
): NextResponse {
  const response = createApiSuccessResponse(
    unauthenticatedResult(),
  );

  if (shouldClearCookie) {
    appendExpiredSessionCookie(response);
  }

  return response;
}

async function revokeSessionBestEffort(
  sessionToken: string,
  reason: string,
  currentDate: Date,
): Promise<void> {
  try {
    await revokeAuthSessionByToken(
      sessionToken,
      reason,
      currentDate,
    );
  } catch {
    // La cookie se elimina aunque la sesión ya no exista o falle la revocación.
  }
}

export async function GET(
  request: Request,
): Promise<NextResponse> {
  const locale = resolveLocale(request);
  const sessionToken = getSessionTokenFromRequest(request);

  if (sessionToken === null) {
    /*
     * El helper falla cerrado tanto para una cookie ausente como para una
     * cookie inválida o duplicada. Enviar una cookie vencida es idempotente
     * y elimina cualquier valor malformado que haya llegado al navegador.
     */
    return createUnauthenticatedResponse(true);
  }

  const currentDate = new Date();

  try {
    const validation = await validateAuthSessionToken(
      sessionToken,
      currentDate,
    );

    if (!validation.valid) {
      return createUnauthenticatedResponse(true);
    }

    const account = await findAccountById(
      validation.session.accountId,
    );

    if (
      account === null
      || account.status !== "ACTIVE"
      || account.emailVerifiedAt === null
      || resolveAccountAccessState(account, currentDate) !== "ACTIVE"
    ) {
      await revokeSessionBestEffort(
        sessionToken,
        "ACCOUNT_NOT_ACTIVE",
        currentDate,
      );

      return createUnauthenticatedResponse(true);
    }

    try {
      await touchAuthSession(
        validation.session.sessionId,
        currentDate,
      );
    } catch {
      /*
       * No cerramos una sesión válida solamente porque falle la actualización
       * no crítica de last_seen_at.
       */
    }

    const publicAccount = toAccountPublicRecord(account);

    return createApiSuccessResponse<SessionResult>({
      authenticated: true,
      account: {
        accountId: publicAccount.accountId,
        role: publicAccount.role,
        status: publicAccount.status,
        firstNames: publicAccount.firstNames,
        lastNames: publicAccount.lastNames,
        username: publicAccount.username,
        email: publicAccount.email,
        emailVerifiedAt:
          publicAccount.emailVerifiedAt?.toISOString() ?? null,
        createdAt: publicAccount.createdAt.toISOString(),
        lastSignInAt:
          publicAccount.lastSignInAt?.toISOString() ?? null,
      },
      expiresAt: validation.session.expiresAt.toISOString(),
    });
  } catch {
    return createApiErrorResponse({
      status: 500,
      code: "INTERNAL_ERROR",
      message: getInternalErrorMessage(locale),
    });
  }
}