import { NextResponse } from "next/server";

import { AUTH_REQUEST_LIMITS } from "@/config/auth.config";
import {
  createExpiredSessionCookieHeader,
  getSessionTokenFromRequest,
  revokeAuthSessionByToken,
} from "@/lib/auth/session";
import {
  createApiErrorResponse,
  createApiSuccessResponse,
} from "@/lib/http/api-response";
import {
  isJsonBodyError,
  parseJsonBody,
} from "@/lib/http/parse-json-body";
import {
  isRequestOriginError,
  verifyRequestOrigin,
} from "@/lib/http/verify-request-origin";
import type { Locale } from "@/types/locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BODY_LIMIT_BYTES = Math.min(
  AUTH_REQUEST_LIMITS.maximumJsonBodyBytes,
  1_024,
);

type LocalizedMessages = {
  forbiddenOrigin: string;
  signedOut: string;
  internalError: string;
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

function getMessages(locale: Locale): LocalizedMessages {
  return locale === "en"
    ? {
        forbiddenOrigin: "The request origin is not allowed.",
        signedOut: "The session was closed successfully.",
        internalError: "The session could not be revoked at this time.",
      }
    : {
        forbiddenOrigin: "El origen de la solicitud no está permitido.",
        signedOut: "La sesión se cerró correctamente.",
        internalError: "No se pudo revocar la sesión en este momento.",
      };
}

function appendExpiredSessionCookie(response: NextResponse): void {
  response.headers.append(
    "Set-Cookie",
    createExpiredSessionCookieHeader(),
  );
}

function createSignedOutResponse(message: string): NextResponse {
  const response = createApiSuccessResponse({
    signedOut: true as const,
    message,
  });

  appendExpiredSessionCookie(response);

  return response;
}

export async function POST(
  request: Request,
): Promise<NextResponse> {
  const locale = resolveLocale(request);
  const messages = getMessages(locale);

  try {
    verifyRequestOrigin(request);
  } catch (error) {
    if (isRequestOriginError(error)) {
      return createApiErrorResponse({
        status: error.status,
        code: error.code,
        message: messages.forbiddenOrigin,
      });
    }

    return createApiErrorResponse({
      status: 500,
      code: "INTERNAL_ERROR",
      message: messages.internalError,
    });
  }

  try {
    await parseJsonBody(request, {
      maximumBytes: BODY_LIMIT_BYTES,
      requireObject: true,
    });
  } catch (error) {
    if (isJsonBodyError(error)) {
      return createApiErrorResponse({
        status: error.status,
        code: error.code,
        message: error.message,
      });
    }

    return createApiErrorResponse({
      status: 500,
      code: "INTERNAL_ERROR",
      message: messages.internalError,
    });
  }

  const sessionToken = getSessionTokenFromRequest(request);

  if (sessionToken === null) {
    return createSignedOutResponse(messages.signedOut);
  }

  try {
    await revokeAuthSessionByToken(
      sessionToken,
      "SIGN_OUT",
    );

    return createSignedOutResponse(messages.signedOut);
  } catch {
    /*
     * No eliminamos la cookie cuando la revocación falla. Así el cliente puede
     * volver a consultar la sesión y reintentar el cierre en lugar de perder
     * el único token con el que aún puede solicitar la revocación.
     */
    return createApiErrorResponse({
      status: 500,
      code: "INTERNAL_ERROR",
      message: messages.internalError,
    });
  }
}