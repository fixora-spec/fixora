import {
  NextResponse,
} from "next/server";

import {
  findAccountById,
} from "@/lib/auth/account.repository";

import {
  markNotificationAsRead,
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

const NOTIFICATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type SupportedLocale =
  | "es"
  | "en";

type RouteContext = {
  params: Promise<{
    notificationId:
      string;
  }>;
};

type LocalizedMessages = {
  forbiddenOrigin:
    string;

  unauthorized:
    string;

  invalidNotificationId:
    string;

  notFound:
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
        forbiddenOrigin:
          "The request origin is not allowed.",

        unauthorized:
          "Sign in to update notifications.",

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

        invalidNotificationId:
          "El identificador de la notificación no es válido.",

        notFound:
          "La notificación no existe o no pertenece a tu cuenta.",

        internalError:
          "No se pudo marcar la notificación como leída en este momento.",
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
      || fetchSite
        === "same-origin"
      || fetchSite
        === "none"
    );
  }

  try {
    return (
      new URL(
        origin,
      ).origin
      === new URL(
        request.url,
      ).origin
    );
  } catch {
    return false;
  }
}

function normalizeNotificationId(
  value: unknown,
): string | null {
  if (
    typeof value
    !== "string"
  ) {
    return null;
  }

  const notificationId =
    value.trim();

  return NOTIFICATION_ID_PATTERN.test(
    notificationId,
  )
    ? notificationId
    : null;
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
  fieldErrors:
    readonly {
      field: string;
      code: string;
    }[] = [],
): NextResponse {
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

      headers: {
        "Cache-Control":
          "no-store",

        Pragma:
          "no-cache",
      },
    },
  );
}

async function handleReadRequest(
  request: Request,
  context: RouteContext,
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
    return createErrorResponse(
      403,
      "FORBIDDEN_ORIGIN",
      messages.forbiddenOrigin,
    );
  }

  const parameters =
    await context.params;

  const notificationId =
    normalizeNotificationId(
      parameters.notificationId,
    );

  if (
    notificationId === null
  ) {
    return createErrorResponse(
      400,
      "INVALID_NOTIFICATION_ID",
      messages.invalidNotificationId,
      [
        {
          field:
            "notificationId",

          code:
            "INVALID_NOTIFICATION_ID",
        },
      ],
    );
  }

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

    const notification =
      await markNotificationAsRead(
        account.accountId,
        notificationId,
      );

    if (
      notification === null
    ) {
      return createErrorResponse(
        404,
        "NOTIFICATION_NOT_FOUND",
        messages.notFound,
      );
    }

    try {
      await touchAuthSession(
        sessionValidation
          .session
          .sessionId,
      );
    } catch {
      /*
       * Marcar una notificación no debe fallar
       * porque no se actualizó last_seen_at.
       */
    }

    return NextResponse.json(
      {
        success:
          true,

        data: {
          notification:
            serializeNotification(
              notification,
            ),
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
      "NOTIFICATION_READ_FAILED",
      messages.internalError,
    );
  }
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  return handleReadRequest(
    request,
    context,
  );
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  return handleReadRequest(
    request,
    context,
  );
}