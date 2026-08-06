import {
  NextResponse,
} from "next/server";

import {
  countUnreadNotifications,
  markNotificationAsRead,
} from "@/lib/auth/notification.repository";

import {
  createExpiredSessionCookieHeader,
  getSessionTokenFromRequest,
  touchAuthSession,
  validateAuthSessionToken,
} from "@/lib/auth/session";

import {
  withSqlTransaction,
} from "@/lib/database";

import {
  isJsonBodyError,
  parseJsonBody,
} from "@/lib/http/parse-json-body";

import {
  isRequestOriginError,
  verifyRequestOrigin,
} from "@/lib/http/verify-request-origin";

import type {
  NotificationRepositoryRecord,
} from "@/lib/auth/notification.repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOTIFICATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const MAXIMUM_REQUEST_BODY_BYTES = 1_024;

type SupportedLocale =
  | "es"
  | "en";

type RouteContext = {
  params: Promise<{
    notificationId: string;
  }>;
};

type LocalizedMessages = {
  forbiddenOrigin: string;
  unauthorized: string;
  invalidRequest: string;
  invalidNotificationId: string;
  notFound: string;
  internalError: string;
};

function resolveLocale(
  request: Request,
): SupportedLocale {
  const explicitLocale = request.headers
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

function getMessages(
  locale: SupportedLocale,
): LocalizedMessages {
  return locale === "en"
    ? {
        forbiddenOrigin:
          "The request origin is not allowed.",
        unauthorized:
          "Sign in to update notifications.",
        invalidRequest:
          "The request body is invalid.",
        invalidNotificationId:
          "The notification identifier is invalid.",
        notFound:
          "The notification does not exist or does not belong to your account.",
        internalError:
          "The notification could not be marked as read at this time.",
      }
    : {
        forbiddenOrigin:
          "El origen de la solicitud no está permitido.",
        unauthorized:
          "Inicia sesión para actualizar las notificaciones.",
        invalidRequest:
          "El cuerpo de la solicitud no es válido.",
        invalidNotificationId:
          "El identificador de la notificación no es válido.",
        notFound:
          "La notificación no existe o no pertenece a tu cuenta.",
        internalError:
          "No se pudo marcar la notificación como leída en este momento.",
      };
}

function createResponseHeaders(
  additionalHeaders?: HeadersInit,
): Headers {
  const headers = new Headers(additionalHeaders);

  headers.set("Cache-Control", "no-store, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Vary", "Accept-Language, X-Fixora-Locale");

  return headers;
}

function createErrorResponse(
  status: number,
  code: string,
  message: string,
  fieldErrors: readonly {
    field: string;
    code: string;
  }[] = [],
  headers?: HeadersInit,
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        fieldErrors: [...fieldErrors],
      },
    },
    {
      status,
      headers: createResponseHeaders(headers),
    },
  );
}

function createSuccessResponse(
  data: unknown,
): NextResponse {
  return NextResponse.json(
    {
      success: true,
      data,
    },
    {
      status: 200,
      headers: createResponseHeaders(),
    },
  );
}

function normalizeNotificationId(
  value: unknown,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const notificationId = value.trim().toLowerCase();

  return NOTIFICATION_ID_PATTERN.test(notificationId)
    ? notificationId
    : null;
}

function serializeNotification(
  notification: NotificationRepositoryRecord,
) {
  return {
    notificationId: notification.notificationId,
    accountId: notification.accountId,
    type: notification.type,
    titleKey: notification.titleKey,
    messageKey: notification.messageKey,
    metadata: notification.metadata,
    isRead: notification.readAt !== null,
    createdAt: notification.createdAt.toISOString(),
    readAt: notification.readAt?.toISOString() ?? null,
  };
}

async function validateOptionalJsonBody(
  request: Request,
): Promise<void> {
  const contentType = request.headers.get("content-type");
  const contentLength = request.headers.get("content-length")?.trim();

  const declaredBodyLength = contentLength && /^\d+$/u.test(contentLength)
    ? Number.parseInt(contentLength, 10)
    : null;

  const bodyIsDeclared =
    (declaredBodyLength !== null && declaredBodyLength > 0)
    || contentType !== null;

  if (!bodyIsDeclared) {
    return;
  }

  await parseJsonBody<Record<string, unknown>>(request, {
    maximumBytes: MAXIMUM_REQUEST_BODY_BYTES,
    requireObject: true,
  });
}

async function handleReadRequest(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const locale = resolveLocale(request);
  const messages = getMessages(locale);

  try {
    verifyRequestOrigin(request, {
      allowSafeMethods: false,
      requireOrigin: true,
    });
  } catch (error) {
    if (isRequestOriginError(error)) {
      return createErrorResponse(
        403,
        "FORBIDDEN_ORIGIN",
        messages.forbiddenOrigin,
      );
    }

    return createErrorResponse(
      500,
      "NOTIFICATION_READ_FAILED",
      messages.internalError,
    );
  }

  const parameters = await context.params;
  const notificationId = normalizeNotificationId(
    parameters.notificationId,
  );

  if (notificationId === null) {
    return createErrorResponse(
      400,
      "INVALID_NOTIFICATION_ID",
      messages.invalidNotificationId,
      [
        {
          field: "notificationId",
          code: "INVALID_NOTIFICATION_ID",
        },
      ],
    );
  }

  try {
    await validateOptionalJsonBody(request);
  } catch (error) {
    if (isJsonBodyError(error)) {
      return createErrorResponse(
        error.status,
        error.code,
        messages.invalidRequest,
      );
    }

    return createErrorResponse(
      500,
      "NOTIFICATION_READ_FAILED",
      messages.internalError,
    );
  }

  try {
    const sessionToken = getSessionTokenFromRequest(request);
    const sessionValidation = await validateAuthSessionToken(sessionToken);

    if (!sessionValidation.valid) {
      return createErrorResponse(
        401,
        "UNAUTHORIZED",
        messages.unauthorized,
        [],
        sessionToken
          ? {
              "Set-Cookie": createExpiredSessionCookieHeader(),
            }
          : undefined,
      );
    }

    const accountId = sessionValidation.session.accountId;

    const result = await withSqlTransaction(
      async (transaction) => {
        const notification = await markNotificationAsRead(
          accountId,
          notificationId,
          new Date(),
          transaction,
        );

        if (notification === null) {
          return null;
        }

        const unreadCount = await countUnreadNotifications(
          accountId,
          transaction,
        );

        return {
          notification,
          unreadCount,
        };
      },
      {
        isolationLevel: "READ_COMMITTED",
      },
    );

    if (result === null) {
      return createErrorResponse(
        404,
        "NOTIFICATION_NOT_FOUND",
        messages.notFound,
      );
    }

    try {
      await touchAuthSession(sessionValidation.session.sessionId);
    } catch {
      // La operación principal ya se completó correctamente.
    }

    return createSuccessResponse({
      notification: serializeNotification(result.notification),
      unreadCount: result.unreadCount,
    });
  } catch {
    return createErrorResponse(
      500,
      "NOTIFICATION_READ_FAILED",
      messages.internalError,
    );
  }
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  return handleReadRequest(request, context);
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  return handleReadRequest(request, context);
}