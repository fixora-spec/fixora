export type NotificationServiceItem = {
  notificationId: string;
  type: string;

  title: string;
  message: string;

  metadata:
    Record<string, unknown>
    | null;

  isRead: boolean;

  createdAt: string;
  readAt: string | null;
};

export type NotificationListResponseData = {
  notifications:
    readonly NotificationServiceItem[];

  unreadCount: number;
};

export type NotificationReadResponseData = {
  notification:
    NotificationServiceItem;

  unreadCount: number;
};

export type NotificationsRequestOptions = {
  signal?: AbortSignal;
};

export type ListNotificationsOptions =
  NotificationsRequestOptions & {
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
  };

export class NotificationsApiError
  extends Error {
  public readonly code:
    string;

  public readonly status:
    number;

  public readonly retryAfterSeconds:
    number | null;

  public constructor(
    input: {
      code: string;
      message: string;
      status: number;

      retryAfterSeconds?:
        number | null;
    },
  ) {
    super(input.message);

    this.name =
      "NotificationsApiError";

    this.code =
      input.code;

    this.status =
      input.status;

    this.retryAfterSeconds =
      input.retryAfterSeconds
      ?? null;
  }
}

type UnknownRecord =
  Record<string, unknown>;

type ApiSuccessResponse<TData> = {
  success: true;
  data: TData;
};

type ApiErrorResponse = {
  success: false;

  error: {
    code: string;
    message: string;

    retryAfterSeconds?:
      number;
  };
};

function isUnknownRecord(
  value: unknown,
): value is UnknownRecord {
  return (
    typeof value === "object"
    && value !== null
    && !Array.isArray(value)
  );
}

function isApiSuccessResponse<
  TData,
>(
  value: unknown,
): value is ApiSuccessResponse<TData> {
  return (
    isUnknownRecord(value)
    && value.success === true
    && "data" in value
  );
}

function isApiErrorResponse(
  value: unknown,
): value is ApiErrorResponse {
  return (
    isUnknownRecord(value)
    && value.success === false
    && isUnknownRecord(
      value.error,
    )
    && typeof value
      .error
      .code === "string"
    && typeof value
      .error
      .message === "string"
  );
}

function validatePaginationValue(
  value: number | undefined,
  fieldName: string,
  minimum: number,
  maximum: number,
): number | undefined {
  if (
    typeof value === "undefined"
  ) {
    return undefined;
  }

  if (
    !Number.isSafeInteger(value)
    || value < minimum
    || value > maximum
  ) {
    throw new Error(
      `${fieldName} debe estar entre ${minimum} y ${maximum}.`,
    );
  }

  return value;
}

function validateNotificationId(
  notificationId: string,
): string {
  const normalizedId =
    notificationId.trim();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      normalizedId,
    )
  ) {
    throw new Error(
      "El identificador de la notificación no es válido.",
    );
  }

  return normalizedId;
}

function normalizeIsoDate(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !== "string"
  ) {
    throw new Error(
      `${fieldName} no contiene una fecha válida.`,
    );
  }

  const parsedDate =
    new Date(value);

  if (
    Number.isNaN(
      parsedDate.getTime(),
    )
  ) {
    throw new Error(
      `${fieldName} no contiene una fecha válida.`,
    );
  }

  return parsedDate.toISOString();
}

function normalizeNullableIsoDate(
  value: unknown,
): string | null {
  if (
    value === null
    || typeof value === "undefined"
  ) {
    return null;
  }

  return normalizeIsoDate(
    value,
    "readAt",
  );
}

function normalizeMetadata(
  value: unknown,
): Record<string, unknown> | null {
  if (
    value === null
    || typeof value === "undefined"
  ) {
    return null;
  }

  if (!isUnknownRecord(value)) {
    return null;
  }

  return value;
}

function normalizeNotification(
  value: unknown,
): NotificationServiceItem {
  if (!isUnknownRecord(value)) {
    throw new Error(
      "La notificación recibida no es válida.",
    );
  }

  const notificationId =
    typeof value.notificationId
      === "string"
      ? validateNotificationId(
          value.notificationId,
        )
      : "";

  const type =
    typeof value.type === "string"
      ? value.type.trim()
      : "";

  const title =
    typeof value.title === "string"
      ? value.title.trim()
      : "";

  const message =
    typeof value.message === "string"
      ? value.message.trim()
      : "";

  if (
    notificationId.length === 0
    || type.length === 0
    || title.length === 0
    || message.length === 0
  ) {
    throw new Error(
      "La notificación recibida está incompleta.",
    );
  }

  const readAt =
    normalizeNullableIsoDate(
      value.readAt,
    );

  return {
    notificationId,
    type,
    title,
    message,

    metadata:
      normalizeMetadata(
        value.metadata,
      ),

    isRead:
      value.isRead === true
      || readAt !== null,

    createdAt:
      normalizeIsoDate(
        value.createdAt,
        "createdAt",
      ),

    readAt,
  };
}

function normalizeUnreadCount(
  value: unknown,
): number {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < 0
  ) {
    return 0;
  }

  return value;
}

function normalizeNotificationListData(
  value: unknown,
): NotificationListResponseData {
  if (!isUnknownRecord(value)) {
    throw new Error(
      "La respuesta de notificaciones no es válida.",
    );
  }

  const rawNotifications =
    Array.isArray(
      value.notifications,
    )
      ? value.notifications
      : [];

  const notifications:
    NotificationServiceItem[] = [];

  const knownNotificationIds =
    new Set<string>();

  for (
    const rawNotification
    of rawNotifications
  ) {
    const notification =
      normalizeNotification(
        rawNotification,
      );

    if (
      knownNotificationIds.has(
        notification.notificationId,
      )
    ) {
      continue;
    }

    knownNotificationIds.add(
      notification.notificationId,
    );

    notifications.push(
      notification,
    );
  }

  notifications.sort(
    (
      firstNotification,
      secondNotification,
    ) => {
      return (
        new Date(
          secondNotification.createdAt,
        ).getTime()
        - new Date(
          firstNotification.createdAt,
        ).getTime()
      );
    },
  );

  return {
    notifications,

    unreadCount:
      normalizeUnreadCount(
        value.unreadCount,
      ),
  };
}

function normalizeNotificationReadData(
  value: unknown,
): NotificationReadResponseData {
  if (!isUnknownRecord(value)) {
    throw new Error(
      "La respuesta de lectura no es válida.",
    );
  }

  return {
    notification:
      normalizeNotification(
        value.notification,
      ),

    unreadCount:
      normalizeUnreadCount(
        value.unreadCount,
      ),
  };
}

async function parseResponseBody(
  response: Response,
): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const contentType =
    response.headers
      .get("content-type")
      ?.toLowerCase()
    ?? "";

  if (
    !contentType.includes(
      "application/json",
    )
  ) {
    return null;
  }

  try {
    return (
      await response.json()
    ) as unknown;
  } catch {
    return null;
  }
}

function createNotificationsApiError(
  response: Response,
  payload: unknown,
): NotificationsApiError {
  if (isApiErrorResponse(payload)) {
    return new NotificationsApiError({
      code:
        payload.error.code,

      message:
        payload.error.message,

      status:
        response.status,

      retryAfterSeconds:
        typeof payload.error
          .retryAfterSeconds
          === "number"
          ? payload.error
              .retryAfterSeconds
          : null,
    });
  }

  return new NotificationsApiError({
    code:
      "UNKNOWN_ERROR",

    message:
      response.status >= 500
        ? "El servidor no pudo completar la solicitud."
        : "No se pudo completar la solicitud.",

    status:
      response.status,
  });
}

function isAbortError(
  error: unknown,
): boolean {
  return (
    error instanceof DOMException
    && error.name === "AbortError"
  );
}

async function requestNotificationsApi<
  TData,
>(
  url: string,
  init: RequestInit,
): Promise<TData> {
  let response:
    Response;

  try {
    response =
      await fetch(
        url,
        {
          ...init,

          headers: {
            Accept:
              "application/json",

            ...init.headers,
          },

          cache:
            "no-store",

          credentials:
            "same-origin",
        },
      );
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new NotificationsApiError({
      code:
        "NETWORK_ERROR",

      message:
        "No se pudo establecer comunicación con el servidor.",

      status:
        0,
    });
  }

  const payload =
    await parseResponseBody(
      response,
    );

  if (!response.ok) {
    throw createNotificationsApiError(
      response,
      payload,
    );
  }

  if (
    !isApiSuccessResponse<
      TData
    >(payload)
  ) {
    throw new NotificationsApiError({
      code:
        "INVALID_RESPONSE",

      message:
        "El servidor devolvió una respuesta no válida.",

      status:
        response.status,
    });
  }

  return payload.data;
}

export async function listNotifications(
  options:
    ListNotificationsOptions = {},
): Promise<NotificationListResponseData> {
  const limit =
    validatePaginationValue(
      options.limit,
      "limit",
      1,
      100,
    );

  const offset =
    validatePaginationValue(
      options.offset,
      "offset",
      0,
      10_000,
    );

  const searchParameters =
    new URLSearchParams();

  if (
    typeof limit === "number"
  ) {
    searchParameters.set(
      "limit",
      String(limit),
    );
  }

  if (
    typeof offset === "number"
  ) {
    searchParameters.set(
      "offset",
      String(offset),
    );
  }

  if (options.unreadOnly) {
    searchParameters.set(
      "unreadOnly",
      "true",
    );
  }

  const queryString =
    searchParameters.toString();

  const responseData =
    await requestNotificationsApi<
      unknown
    >(
      queryString
        ? `/api/notifications?${queryString}`
        : "/api/notifications",
      {
        method:
          "GET",

        signal:
          options.signal,
      },
    );

  return normalizeNotificationListData(
    responseData,
  );
}

export async function markNotificationAsRead(
  notificationId: string,
  options:
    NotificationsRequestOptions = {},
): Promise<NotificationReadResponseData> {
  const normalizedNotificationId =
    validateNotificationId(
      notificationId,
    );

  const responseData =
    await requestNotificationsApi<
      unknown
    >(
      `/api/notifications/${encodeURIComponent(normalizedNotificationId)}/read`,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({}),

        signal:
          options.signal,
      },
    );

  return normalizeNotificationReadData(
    responseData,
  );
}

export function isNotificationsApiError(
  error: unknown,
): error is NotificationsApiError {
  return (
    error
    instanceof NotificationsApiError
  );
}

export const notificationsService = {
  listNotifications,
  markNotificationAsRead,
} as const;