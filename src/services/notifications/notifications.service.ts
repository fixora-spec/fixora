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

    this.name = "NotificationsApiError";
    this.code = input.code;
    this.status = input.status;
    this.retryAfterSeconds = input.retryAfterSeconds ?? null;
  }
}

type UnknownRecord =
  Record<string, unknown>;

type ApiErrorResponse = {
  success: false;

  error: {
    code: string;
    message: string;

    retryAfterSeconds?: number;
  };
};

const REQUEST_TIMEOUT_MILLISECONDS = 30_000;
const MAXIMUM_RESPONSE_BODY_BYTES = 256 * 1_024;
const MAXIMUM_NOTIFICATION_ITEMS = 100;
const MAXIMUM_NOTIFICATION_TEXT_LENGTH = 4_000;
const MAXIMUM_METADATA_DEPTH = 8;
const MAXIMUM_METADATA_PROPERTIES = 100;
const MAXIMUM_METADATA_ARRAY_ITEMS = 100;

const NOTIFICATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const FORBIDDEN_CONTROL_CHARACTER_PATTERN =
  /[\u0000-\u001F\u007F]/u;

const FORBIDDEN_METADATA_KEYS = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);

function isUnknownRecord(
  value: unknown,
): value is UnknownRecord {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
  ) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function isApiErrorResponse(
  value: unknown,
): value is ApiErrorResponse {
  return (
    isUnknownRecord(value)
    && value.success === false
    && isUnknownRecord(value.error)
    && typeof value.error.code === "string"
    && typeof value.error.message === "string"
  );
}

function validatePaginationValue(
  value: number | undefined,
  fieldName: string,
  minimum: number,
  maximum: number,
): number | undefined {
  if (typeof value === "undefined") {
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
  const normalizedId = notificationId.trim().toLowerCase();

  if (!NOTIFICATION_ID_PATTERN.test(normalizedId)) {
    throw new Error(
      "El identificador de la notificación no es válido.",
    );
  }

  return normalizedId;
}

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  maximumLength: number,
): string {
  if (typeof value !== "string") {
    throw new Error(
      `${fieldName} no contiene texto válido.`,
    );
  }

  const normalizedValue = value.trim().normalize("NFC");

  if (
    normalizedValue.length === 0
    || normalizedValue.length > maximumLength
    || FORBIDDEN_CONTROL_CHARACTER_PATTERN.test(normalizedValue)
  ) {
    throw new Error(
      `${fieldName} no contiene texto válido.`,
    );
  }

  return normalizedValue;
}

function readFirstValidString(
  record: UnknownRecord,
  propertyNames: readonly string[],
  fieldName: string,
  maximumLength: number,
): string {
  for (const propertyName of propertyNames) {
    const value = record[propertyName];

    if (typeof value !== "string" || value.trim().length === 0) {
      continue;
    }

    return normalizeRequiredString(
      value,
      fieldName,
      maximumLength,
    );
  }

  throw new Error(
    `${fieldName} no contiene texto válido.`,
  );
}

function normalizeIsoDate(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !== "string"
    || value.length < 20
    || value.length > 35
  ) {
    throw new Error(
      `${fieldName} no contiene una fecha válida.`,
    );
  }

  const parsedTime = Date.parse(value);

  if (!Number.isFinite(parsedTime)) {
    throw new Error(
      `${fieldName} no contiene una fecha válida.`,
    );
  }

  return new Date(parsedTime).toISOString();
}

function normalizeNullableIsoDate(
  value: unknown,
): string | null {
  if (value === null || typeof value === "undefined") {
    return null;
  }

  return normalizeIsoDate(value, "readAt");
}

function normalizeMetadataValue(
  value: unknown,
  depth: number,
): unknown {
  if (depth > MAXIMUM_METADATA_DEPTH) {
    throw new Error(
      "Los metadatos de la notificación superan la profundidad permitida.",
    );
  }

  if (
    value === null
    || typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "string") {
    if (
      value.length > MAXIMUM_NOTIFICATION_TEXT_LENGTH
      || FORBIDDEN_CONTROL_CHARACTER_PATTERN.test(value)
    ) {
      throw new Error(
        "Los metadatos de la notificación contienen texto no válido.",
      );
    }

    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(
        "Los metadatos de la notificación contienen un número no válido.",
      );
    }

    return value;
  }

  if (Array.isArray(value)) {
    if (value.length > MAXIMUM_METADATA_ARRAY_ITEMS) {
      throw new Error(
        "Los metadatos de la notificación contienen demasiados elementos.",
      );
    }

    return value.map((item) =>
      normalizeMetadataValue(item, depth + 1),
    );
  }

  if (!isUnknownRecord(value)) {
    throw new Error(
      "Los metadatos de la notificación no son válidos.",
    );
  }

  const entries = Object.entries(value);

  if (entries.length > MAXIMUM_METADATA_PROPERTIES) {
    throw new Error(
      "Los metadatos de la notificación contienen demasiadas propiedades.",
    );
  }

  const normalizedObject: Record<string, unknown> = Object.create(null);

  for (const [key, entryValue] of entries) {
    if (
      key.length === 0
      || key.length > 128
      || FORBIDDEN_CONTROL_CHARACTER_PATTERN.test(key)
      || FORBIDDEN_METADATA_KEYS.has(key)
    ) {
      throw new Error(
        "Los metadatos de la notificación contienen una propiedad no válida.",
      );
    }

    normalizedObject[key] = normalizeMetadataValue(
      entryValue,
      depth + 1,
    );
  }

  return normalizedObject;
}

function normalizeMetadata(
  value: unknown,
): Record<string, unknown> | null {
  if (value === null || typeof value === "undefined") {
    return null;
  }

  const normalizedValue = normalizeMetadataValue(value, 0);

  if (!isUnknownRecord(normalizedValue)) {
    throw new Error(
      "Los metadatos de la notificación no son válidos.",
    );
  }

  return normalizedValue;
}

function normalizeNotification(
  value: unknown,
): NotificationServiceItem {
  if (!isUnknownRecord(value)) {
    throw new Error(
      "La notificación recibida no es válida.",
    );
  }

  const notificationId = validateNotificationId(
    normalizeRequiredString(
      value.notificationId,
      "notificationId",
      36,
    ),
  );

  const type = normalizeRequiredString(
    value.type,
    "type",
    80,
  );

  const title = readFirstValidString(
    value,
    ["title", "titleKey"],
    "title",
    200,
  );

  const message = readFirstValidString(
    value,
    ["message", "messageKey"],
    "message",
    200,
  );

  const createdAt = normalizeIsoDate(
    value.createdAt,
    "createdAt",
  );

  const readAt = normalizeNullableIsoDate(value.readAt);

  if (
    readAt !== null
    && Date.parse(readAt) < Date.parse(createdAt)
  ) {
    throw new Error(
      "La fecha de lectura de la notificación no es válida.",
    );
  }

  return {
    notificationId,
    type,
    title,
    message,
    metadata: normalizeMetadata(value.metadata),
    isRead: value.isRead === true || readAt !== null,
    createdAt,
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
    throw new Error(
      "El contador de notificaciones no es válido.",
    );
  }

  return value;
}

function normalizeNotificationListData(
  value: unknown,
): NotificationListResponseData {
  if (!isUnknownRecord(value) || !Array.isArray(value.notifications)) {
    throw new Error(
      "La respuesta de notificaciones no es válida.",
    );
  }

  if (value.notifications.length > MAXIMUM_NOTIFICATION_ITEMS) {
    throw new Error(
      "La respuesta contiene demasiadas notificaciones.",
    );
  }

  const notifications: NotificationServiceItem[] = [];
  const knownNotificationIds = new Set<string>();

  for (const rawNotification of value.notifications) {
    const notification = normalizeNotification(rawNotification);

    if (knownNotificationIds.has(notification.notificationId)) {
      continue;
    }

    knownNotificationIds.add(notification.notificationId);
    notifications.push(notification);
  }

  notifications.sort(
    (firstNotification, secondNotification) =>
      Date.parse(secondNotification.createdAt)
      - Date.parse(firstNotification.createdAt),
  );

  return {
    notifications,
    unreadCount: normalizeUnreadCount(value.unreadCount),
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
    notification: normalizeNotification(value.notification),
    unreadCount: normalizeUnreadCount(value.unreadCount),
  };
}

function readRetryAfterSeconds(
  response: Response,
  payload: ApiErrorResponse | null,
): number | null {
  const payloadValue = payload?.error.retryAfterSeconds;

  if (
    typeof payloadValue === "number"
    && Number.isSafeInteger(payloadValue)
    && payloadValue >= 1
    && payloadValue <= 86_400
  ) {
    return payloadValue;
  }

  const headerValue = response.headers.get("retry-after")?.trim();

  if (!headerValue || !/^\d+$/u.test(headerValue)) {
    return null;
  }

  const parsedValue = Number.parseInt(headerValue, 10);

  return (
    Number.isSafeInteger(parsedValue)
    && parsedValue >= 1
    && parsedValue <= 86_400
  )
    ? parsedValue
    : null;
}

function isAbortError(
  error: unknown,
): boolean {
  return (
    error instanceof Error
    && error.name === "AbortError"
  );
}

async function readResponseTextWithLimit(
  response: Response,
): Promise<string> {
  const contentLengthHeader = response.headers
    .get("content-length")
    ?.trim();

  if (contentLengthHeader && /^\d+$/u.test(contentLengthHeader)) {
    const contentLength = Number.parseInt(contentLengthHeader, 10);

    if (contentLength > MAXIMUM_RESPONSE_BODY_BYTES) {
      throw new NotificationsApiError({
        code: "RESPONSE_TOO_LARGE",
        message: "El servidor devolvió una respuesta demasiado grande.",
        status: response.status,
      });
    }
  }

  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  try {
    while (true) {
      const result = await reader.read();

      if (result.done) {
        break;
      }

      receivedBytes += result.value.byteLength;

      if (receivedBytes > MAXIMUM_RESPONSE_BODY_BYTES) {
        await reader.cancel();

        throw new NotificationsApiError({
          code: "RESPONSE_TOO_LARGE",
          message: "El servidor devolvió una respuesta demasiado grande.",
          status: response.status,
        });
      }

      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bodyBuffer = new Uint8Array(receivedBytes);
  let offset = 0;

  for (const chunk of chunks) {
    bodyBuffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder("utf-8", {
    fatal: true,
  }).decode(bodyBuffer);
}

async function parseResponseBody(
  response: Response,
): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers
    .get("content-type")
    ?.toLowerCase()
    ?? "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  let responseText: string;

  try {
    responseText = await readResponseTextWithLimit(response);
  } catch (error) {
    if (isNotificationsApiError(error)) {
      throw error;
    }

    return null;
  }

  if (!responseText.trim()) {
    return null;
  }

  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    return null;
  }
}

function createNotificationsApiError(
  response: Response,
  payload: unknown,
): NotificationsApiError {
  if (isApiErrorResponse(payload)) {
    const code = normalizeRequiredString(
      payload.error.code,
      "error.code",
      100,
    );
    const message = normalizeRequiredString(
      payload.error.message,
      "error.message",
      1_000,
    );

    return new NotificationsApiError({
      code,
      message,
      status: response.status,
      retryAfterSeconds: readRetryAfterSeconds(response, payload),
    });
  }

  return new NotificationsApiError({
    code: "UNKNOWN_ERROR",
    message: response.status >= 500
      ? "El servidor no pudo completar la solicitud."
      : "No se pudo completar la solicitud.",
    status: response.status,
    retryAfterSeconds: readRetryAfterSeconds(response, null),
  });
}

function validateNotificationsApiUrl(
  value: string,
): string {
  if (
    !value.startsWith("/api/notifications")
    || value.startsWith("//")
    || /[\r\n\0]/u.test(value)
  ) {
    throw new Error(
      "La ruta de notificaciones no es válida.",
    );
  }

  return value;
}

function createRequestHeaders(
  initialHeaders?: HeadersInit,
): Headers {
  const headers = new Headers(initialHeaders);

  headers.set("Accept", "application/json");
  headers.set("X-Fixora-Client", "web");

  return headers;
}

async function requestNotificationsApi<TData>(
  url: string,
  init: RequestInit,
  normalizeData: (value: unknown) => TData,
): Promise<TData> {
  const requestUrl = validateNotificationsApiUrl(url);
  const abortController = new AbortController();
  const externalSignal = init.signal;
  let timedOut = false;

  const abortFromExternalSignal = (): void => {
    abortController.abort(externalSignal?.reason);
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      abortController.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener(
        "abort",
        abortFromExternalSignal,
        {
          once: true,
        },
      );
    }
  }

  const timeoutIdentifier = globalThis.setTimeout(() => {
    timedOut = true;
    abortController.abort();
  }, REQUEST_TIMEOUT_MILLISECONDS);

  try {
    const response = await fetch(requestUrl, {
      ...init,
      headers: createRequestHeaders(init.headers),
      cache: "no-store",
      credentials: "same-origin",
      mode: "same-origin",
      redirect: "error",
      referrerPolicy: "same-origin",
      signal: abortController.signal,
    });

    const payload = await parseResponseBody(response);

    if (!response.ok) {
      throw createNotificationsApiError(response, payload);
    }

    if (
      !isUnknownRecord(payload)
      || payload.success !== true
      || !("data" in payload)
    ) {
      throw new NotificationsApiError({
        code: "INVALID_RESPONSE",
        message: "El servidor devolvió una respuesta no válida.",
        status: response.status,
      });
    }

    try {
      return normalizeData(payload.data);
    } catch {
      throw new NotificationsApiError({
        code: "INVALID_RESPONSE",
        message: "El servidor devolvió datos de notificaciones no válidos.",
        status: response.status,
      });
    }
  } catch (error) {
    if (isNotificationsApiError(error)) {
      throw error;
    }

    if (externalSignal?.aborted) {
      throw error;
    }

    if (timedOut) {
      throw new NotificationsApiError({
        code: "REQUEST_TIMEOUT",
        message: "La solicitud tardó demasiado tiempo en responder.",
        status: 0,
      });
    }

    if (isAbortError(error)) {
      throw error;
    }

    throw new NotificationsApiError({
      code: "NETWORK_ERROR",
      message: "No se pudo establecer comunicación con el servidor.",
      status: 0,
    });
  } finally {
    globalThis.clearTimeout(timeoutIdentifier);
    externalSignal?.removeEventListener(
      "abort",
      abortFromExternalSignal,
    );
  }
}

export async function listNotifications(
  options: ListNotificationsOptions = {},
): Promise<NotificationListResponseData> {
  const limit = validatePaginationValue(
    options.limit,
    "limit",
    1,
    100,
  );

  const offset = validatePaginationValue(
    options.offset,
    "offset",
    0,
    10_000,
  );

  const searchParameters = new URLSearchParams();

  if (typeof limit === "number") {
    searchParameters.set("limit", String(limit));
  }

  if (typeof offset === "number") {
    searchParameters.set("offset", String(offset));
  }

  if (options.unreadOnly === true) {
    searchParameters.set("unreadOnly", "true");
  }

  const queryString = searchParameters.toString();

  return requestNotificationsApi(
    queryString
      ? `/api/notifications?${queryString}`
      : "/api/notifications",
    {
      method: "GET",
      signal: options.signal,
    },
    normalizeNotificationListData,
  );
}

export async function markNotificationAsRead(
  notificationId: string,
  options: NotificationsRequestOptions = {},
): Promise<NotificationReadResponseData> {
  const normalizedNotificationId = validateNotificationId(notificationId);

  return requestNotificationsApi(
    `/api/notifications/${encodeURIComponent(normalizedNotificationId)}/read`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({}),
      signal: options.signal,
    },
    normalizeNotificationReadData,
  );
}

export function isNotificationsApiError(
  error: unknown,
): error is NotificationsApiError {
  return error instanceof NotificationsApiError;
}

export const notificationsService = Object.freeze({
  listNotifications,
  markNotificationAsRead,
});