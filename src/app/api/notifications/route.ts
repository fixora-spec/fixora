import {
  NextResponse,
} from "next/server";

import {
  countUnreadNotifications,
  listAccountNotifications,
} from "@/lib/auth/notification.repository";

import {
  createExpiredSessionCookieHeader,
  getSessionTokenFromRequest,
  touchAuthSession,
  validateAuthSessionToken,
} from "@/lib/auth/session";

import {
  isRequestOriginError,
  verifyRequestOrigin,
} from "@/lib/http/verify-request-origin";

import type {
  NotificationRepositoryRecord,
} from "@/lib/auth/notification.repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_NOTIFICATION_LIMIT = 50;
const MAXIMUM_NOTIFICATION_LIMIT = 100;
const MAXIMUM_NOTIFICATION_OFFSET = 10_000;

type SupportedLocale =
  | "es"
  | "en";

type NotificationListQuery = {
  limit: number;
  offset: number;
  unreadOnly: boolean;
};

type LocalizedMessages = {
  forbiddenOrigin: string;
  unauthorized: string;
  invalidQuery: string;
  internalError: string;
};

class NotificationQueryError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "NotificationQueryError";
  }
}

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
          "Sign in to view your notifications.",
        invalidQuery:
          "The notification query parameters are invalid.",
        internalError:
          "Notifications could not be loaded at this time.",
      }
    : {
        forbiddenOrigin:
          "El origen de la solicitud no está permitido.",
        unauthorized:
          "Inicia sesión para ver tus notificaciones.",
        invalidQuery:
          "Los parámetros de consulta de notificaciones no son válidos.",
        internalError:
          "No se pudieron cargar las notificaciones en este momento.",
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
  headers?: HeadersInit,
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        fieldErrors: [],
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

function parseIntegerQueryParameter(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === null) {
    return fallback;
  }

  if (!/^\d+$/u.test(value)) {
    throw new NotificationQueryError(
      "El parámetro numérico no es válido.",
    );
  }

  const parsedValue = Number.parseInt(value, 10);

  if (
    !Number.isSafeInteger(parsedValue)
    || parsedValue < minimum
    || parsedValue > maximum
  ) {
    throw new NotificationQueryError(
      "El parámetro numérico está fuera del rango permitido.",
    );
  }

  return parsedValue;
}

function parseBooleanQueryParameter(
  value: string | null,
): boolean {
  if (value === null || value === "false") {
    return false;
  }

  if (value === "true") {
    return true;
  }

  throw new NotificationQueryError(
    "El parámetro booleano no es válido.",
  );
}

function parseNotificationListQuery(
  request: Request,
): NotificationListQuery {
  const searchParameters = new URL(request.url).searchParams;
  const allowedParameters = new Set([
    "limit",
    "offset",
    "unreadOnly",
  ]);

  for (const parameterName of searchParameters.keys()) {
    if (!allowedParameters.has(parameterName)) {
      throw new NotificationQueryError(
        "La solicitud contiene un parámetro no permitido.",
      );
    }
  }

  return {
    limit: parseIntegerQueryParameter(
      searchParameters.get("limit"),
      DEFAULT_NOTIFICATION_LIMIT,
      1,
      MAXIMUM_NOTIFICATION_LIMIT,
    ),
    offset: parseIntegerQueryParameter(
      searchParameters.get("offset"),
      0,
      0,
      MAXIMUM_NOTIFICATION_OFFSET,
    ),
    unreadOnly: parseBooleanQueryParameter(
      searchParameters.get("unreadOnly"),
    ),
  };
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

export async function GET(
  request: Request,
): Promise<NextResponse> {
  const locale = resolveLocale(request);
  const messages = getMessages(locale);

  try {
    verifyRequestOrigin(request, {
      allowSafeMethods: false,
      requireOrigin: false,
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
      "NOTIFICATIONS_LOAD_FAILED",
      messages.internalError,
    );
  }

  let query: NotificationListQuery;

  try {
    query = parseNotificationListQuery(request);
  } catch (error) {
    if (error instanceof NotificationQueryError) {
      return createErrorResponse(
        400,
        "INVALID_NOTIFICATION_QUERY",
        messages.invalidQuery,
      );
    }

    return createErrorResponse(
      500,
      "NOTIFICATIONS_LOAD_FAILED",
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
        sessionToken
          ? {
              "Set-Cookie": createExpiredSessionCookieHeader(),
            }
          : undefined,
      );
    }

    const accountId = sessionValidation.session.accountId;

    const [notifications, unreadCount] = await Promise.all([
      listAccountNotifications({
        accountId,
        limit: query.limit,
        offset: query.offset,
        unreadOnly: query.unreadOnly,
      }),
      countUnreadNotifications(accountId),
    ]);

    try {
      await touchAuthSession(sessionValidation.session.sessionId);
    } catch {
      // La lectura de notificaciones no depende de actualizar last_seen_at.
    }

    return createSuccessResponse({
      notifications: notifications.map(serializeNotification),
      unreadCount,
    });
  } catch {
    return createErrorResponse(
      500,
      "NOTIFICATIONS_LOAD_FAILED",
      messages.internalError,
    );
  }
}