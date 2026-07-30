import { NextResponse } from "next/server";

import {
  findAccountById,
} from "@/lib/auth/account.repository";

import {
  countUnreadNotifications,
  listAccountNotifications,
} from "@/lib/auth/notification.repository";

import {
  getSessionTokenFromRequest,
  touchAuthSession,
  validateAuthSessionToken,
} from "@/lib/auth/session";

import type {
  NotificationRepositoryRecord,
} from "@/lib/auth/notification.repository";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const DEFAULT_NOTIFICATION_LIMIT =
  50;

const MAXIMUM_NOTIFICATION_LIMIT =
  100;

type SupportedLocale =
  | "es"
  | "en";

type LocalizedMessages = {
  unauthorized:
    string;

  internalError:
    string;
};

function resolveLocale(
  request: Request,
): SupportedLocale {
  const explicitLocale =
    request.headers
      .get(
        "x-fixora-locale",
      )
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
    .get(
      "accept-language",
    )
    ?.toLowerCase()
    .startsWith(
      "en",
    )
    ? "en"
    : "es";
}

function getMessages(
  locale: SupportedLocale,
): LocalizedMessages {
  return locale === "en"
    ? {
        unauthorized:
          "Sign in to view your notifications.",

        internalError:
          "Notifications could not be loaded at this time.",
      }
    : {
        unauthorized:
          "Inicia sesión para ver tus notificaciones.",

        internalError:
          "No se pudieron cargar las notificaciones en este momento.",
      };
}

function normalizeLimit(
  request: Request,
): number {
  const rawLimit =
    new URL(
      request.url,
    )
      .searchParams
      .get(
        "limit",
      );

  if (
    rawLimit === null
  ) {
    return DEFAULT_NOTIFICATION_LIMIT;
  }

  const parsedLimit =
    Number.parseInt(
      rawLimit,
      10,
    );

  if (
    !Number.isInteger(
      parsedLimit,
    )
  ) {
    return DEFAULT_NOTIFICATION_LIMIT;
  }

  return Math.min(
    MAXIMUM_NOTIFICATION_LIMIT,
    Math.max(
      1,
      parsedLimit,
    ),
  );
}

function serializeNotification(
  notification:
    NotificationRepositoryRecord,
) {
  return {
    notificationId:
      notification.notificationId,

    accountId:
      notification.accountId,

    type:
      notification.type,

    titleKey:
      notification.titleKey,

    messageKey:
      notification.messageKey,

    metadata:
      notification.metadata,

    isRead:
      notification.readAt
      !== null,

    createdAt:
      notification
        .createdAt
        .toISOString(),

    readAt:
      notification
        .readAt
        ?.toISOString()
      ?? null,
  };
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
}

export async function GET(
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

  try {
    const sessionToken =
      getSessionTokenFromRequest(
        request,
      );

    const sessionValidation =
      await validateAuthSessionToken(
        sessionToken,
      );

    if (
      !sessionValidation.valid
    ) {
      return createErrorResponse(
        401,
        "UNAUTHORIZED",
        messages.unauthorized,
      );
    }

    const account =
      await findAccountById(
        sessionValidation
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
      return createErrorResponse(
        401,
        "UNAUTHORIZED",
        messages.unauthorized,
      );
    }

    const [
      notifications,
      unreadCount,
    ] =
      await Promise.all([
        listAccountNotifications({
          accountId:
            account.accountId,

          limit:
            normalizeLimit(
              request,
            ),

          offset:
            0,

          unreadOnly:
            false,
        }),

        countUnreadNotifications(
          account.accountId,
        ),
      ]);

    try {
      await touchAuthSession(
        sessionValidation
          .session
          .sessionId,
      );
    } catch {
      /*
       * La carga de notificaciones no debe fallar
       * solamente porque no se actualizó last_seen_at.
       */
    }

    return NextResponse.json(
      {
        success:
          true,

        data: {
          notifications:
            notifications.map(
              serializeNotification,
            ),

          unreadCount,
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
  } catch {
    return createErrorResponse(
      500,
      "NOTIFICATIONS_LOAD_FAILED",
      messages.internalError,
    );
  }
}