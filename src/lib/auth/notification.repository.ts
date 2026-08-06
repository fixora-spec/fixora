import "server-only";

import {
  DateTime2,
  Int,
  MAX,
  NVarChar,
  Request,
  Transaction,
  UniqueIdentifier,
  VarChar,
} from "mssql";

import {
  createSqlRequest,
  toDatabaseError,
} from "@/lib/database";

export type NotificationRepositoryRecord = {
  notificationId: string;
  accountId: string;

  type: string;

  titleKey: string;
  messageKey: string;

  metadata:
    Record<string, unknown>
    | null;

  createdAt: Date;
  readAt: Date | null;
};

export type CreateNotificationInput = {
  notificationId: string;
  accountId: string;

  type: string;

  titleKey: string;
  messageKey: string;

  metadata?:
    Record<string, unknown>
    | null;

  createdAt?: Date;
};

export type ListNotificationsInput = {
  accountId: string;

  limit?: number;
  offset?: number;

  unreadOnly?: boolean;
};

type NotificationDatabaseRecord = {
  notification_id: string;
  account_id: string;

  notification_type: string;

  title_key: string;
  message_key: string;

  metadata_json: string | null;

  created_at: Date;
  read_at: Date | null;
};

type UnreadCountDatabaseRecord = {
  unread_count:
    | number
    | string
    | bigint;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const NOTIFICATION_TYPE_PATTERN =
  /^[A-Z][A-Z0-9_]{0,79}$/u;

const TRANSLATION_KEY_PATTERN =
  /^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*$/u;

const FORBIDDEN_CONTROL_CHARACTER_PATTERN =
  /[\u0000-\u001F\u007F]/u;

const MAXIMUM_METADATA_BYTES = 20_000;
const MAXIMUM_METADATA_DEPTH = 8;
const MAXIMUM_METADATA_PROPERTIES = 100;
const MAXIMUM_METADATA_ARRAY_ITEMS = 100;
const MAXIMUM_METADATA_KEY_LENGTH = 128;
const MAXIMUM_METADATA_STRING_LENGTH = 4_000;

const FORBIDDEN_METADATA_KEYS = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);

async function createRepositoryRequest(
  transaction?: Transaction,
): Promise<Request> {
  if (transaction) {
    return new Request(transaction);
  }

  return createSqlRequest();
}

function validateUuid(
  value: string,
  fieldName: string,
): string {
  const normalizedValue = value.trim().toLowerCase();

  if (!UUID_PATTERN.test(normalizedValue)) {
    throw new Error(
      `${fieldName} no contiene un UUID válido.`,
    );
  }

  return normalizedValue;
}

function validateDate(
  value: Date,
  fieldName: string,
): Date {
  const normalizedDate = new Date(value);

  if (
    Number.isNaN(normalizedDate.getTime())
    || normalizedDate.getUTCFullYear() < 1
    || normalizedDate.getUTCFullYear() > 9_999
  ) {
    throw new Error(
      `${fieldName} no contiene una fecha válida.`,
    );
  }

  return normalizedDate;
}

function normalizeRequiredText(
  value: string,
  fieldName: string,
  maximumLength: number,
): string {
  const normalizedValue = value.trim().normalize("NFC");

  if (
    normalizedValue.length === 0
    || normalizedValue.length > maximumLength
    || FORBIDDEN_CONTROL_CHARACTER_PATTERN.test(normalizedValue)
  ) {
    throw new Error(
      `${fieldName} no contiene un valor válido.`,
    );
  }

  return normalizedValue;
}

function normalizeNotificationType(value: string): string {
  const normalizedType = normalizeRequiredText(
    value,
    "type",
    80,
  ).toUpperCase();

  if (!NOTIFICATION_TYPE_PATTERN.test(normalizedType)) {
    throw new Error(
      "type no contiene un tipo de notificación válido.",
    );
  }

  return normalizedType;
}

function normalizeTranslationKey(
  value: string,
  fieldName: string,
): string {
  const normalizedKey = normalizeRequiredText(
    value,
    fieldName,
    200,
  );

  if (!TRANSLATION_KEY_PATTERN.test(normalizedKey)) {
    throw new Error(
      `${fieldName} no contiene una clave de traducción válida.`,
    );
  }

  return normalizedKey;
}

function normalizePaginationValue(
  value: number | undefined,
  fallbackValue: number,
  minimum: number,
  maximum: number,
  fieldName: string,
): number {
  if (typeof value === "undefined") {
    return fallbackValue;
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

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
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
      value.length > MAXIMUM_METADATA_STRING_LENGTH
      || FORBIDDEN_CONTROL_CHARACTER_PATTERN.test(value)
    ) {
      throw new Error(
        "Los metadatos de la notificación contienen texto no permitido.",
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

  if (value instanceof Date) {
    return validateDate(value, "metadataDate").toISOString();
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

  if (!isPlainObject(value)) {
    throw new Error(
      "Los metadatos de la notificación contienen un valor no serializable.",
    );
  }

  const entries = Object.entries(value);

  if (entries.length > MAXIMUM_METADATA_PROPERTIES) {
    throw new Error(
      "Los metadatos de la notificación contienen demasiadas propiedades.",
    );
  }

  const normalizedObject: Record<string, unknown> = Object.create(null);

  for (const [rawKey, rawValue] of entries) {
    const key = rawKey.normalize("NFC");

    if (
      key.length === 0
      || key.length > MAXIMUM_METADATA_KEY_LENGTH
      || FORBIDDEN_CONTROL_CHARACTER_PATTERN.test(key)
      || FORBIDDEN_METADATA_KEYS.has(key)
    ) {
      throw new Error(
        "Los metadatos de la notificación contienen una propiedad no permitida.",
      );
    }

    if (typeof rawValue === "undefined") {
      continue;
    }

    normalizedObject[key] = normalizeMetadataValue(
      rawValue,
      depth + 1,
    );
  }

  return normalizedObject;
}

function normalizeMetadata(
  metadata:
    Record<string, unknown>
    | null
    | undefined,
): Record<string, unknown> | null {
  if (metadata === null || typeof metadata === "undefined") {
    return null;
  }

  const normalizedMetadata = normalizeMetadataValue(metadata, 0);

  if (!isPlainObject(normalizedMetadata)) {
    throw new Error(
      "Los metadatos de la notificación deben ser un objeto JSON.",
    );
  }

  return normalizedMetadata;
}

function serializeMetadata(
  metadata:
    Record<string, unknown>
    | null
    | undefined,
): string | null {
  const normalizedMetadata = normalizeMetadata(metadata);

  if (normalizedMetadata === null) {
    return null;
  }

  const serializedMetadata = JSON.stringify(normalizedMetadata);
  const serializedBytes = new TextEncoder().encode(
    serializedMetadata,
  ).byteLength;

  if (serializedBytes > MAXIMUM_METADATA_BYTES) {
    throw new Error(
      "Los metadatos de la notificación superan el tamaño permitido.",
    );
  }

  return serializedMetadata;
}

function parseMetadata(
  serializedMetadata: string | null,
): Record<string, unknown> | null {
  if (!serializedMetadata) {
    return null;
  }

  if (
    new TextEncoder().encode(serializedMetadata).byteLength
    > MAXIMUM_METADATA_BYTES
  ) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(serializedMetadata) as unknown;
    const normalizedValue = normalizeMetadataValue(parsedValue, 0);

    return isPlainObject(normalizedValue)
      ? normalizedValue
      : null;
  } catch {
    return null;
  }
}

function mapNotificationRecord(
  record: NotificationDatabaseRecord,
): NotificationRepositoryRecord {
  const notificationId = validateUuid(
    record.notification_id,
    "notification_id",
  );

  const accountId = validateUuid(
    record.account_id,
    "account_id",
  );

  const createdAt = validateDate(
    record.created_at,
    "created_at",
  );

  const readAt = record.read_at === null
    ? null
    : validateDate(record.read_at, "read_at");

  if (
    readAt !== null
    && readAt.getTime() < createdAt.getTime()
  ) {
    throw new Error(
      "La fecha de lectura de la notificación no es válida.",
    );
  }

  return {
    notificationId,
    accountId,
    type: normalizeNotificationType(record.notification_type),
    titleKey: normalizeTranslationKey(record.title_key, "title_key"),
    messageKey: normalizeTranslationKey(record.message_key, "message_key"),
    metadata: parseMetadata(record.metadata_json),
    createdAt,
    readAt,
  };
}

function normalizeUnreadCount(
  value:
    | number
    | string
    | bigint
    | undefined,
): number {
  let normalizedValue: bigint;

  try {
    normalizedValue = BigInt(value ?? 0);
  } catch {
    throw new Error(
      "SQL Server devolvió un contador de notificaciones no válido.",
    );
  }

  if (
    normalizedValue < BigInt(0)
    || normalizedValue > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    throw new Error(
      "El contador de notificaciones está fuera del rango permitido.",
    );
  }

  return Number(normalizedValue);
}

function normalizeRowsAffected(value: number | undefined): number {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < 0
  ) {
    return 0;
  }

  return value;
}

export async function createNotification(
  input: CreateNotificationInput,
  transaction?: Transaction,
): Promise<NotificationRepositoryRecord> {
  const notificationId = validateUuid(
    input.notificationId,
    "notificationId",
  );

  const accountId = validateUuid(
    input.accountId,
    "accountId",
  );

  const type = normalizeNotificationType(input.type);
  const titleKey = normalizeTranslationKey(input.titleKey, "titleKey");
  const messageKey = normalizeTranslationKey(input.messageKey, "messageKey");
  const metadataJson = serializeMetadata(input.metadata);

  const createdAt = validateDate(
    input.createdAt ?? new Date(),
    "createdAt",
  );

  try {
    const request = await createRepositoryRequest(transaction);

    request.input("notificationId", UniqueIdentifier, notificationId);
    request.input("accountId", UniqueIdentifier, accountId);
    request.input("notificationType", VarChar(80), type);
    request.input("titleKey", NVarChar(200), titleKey);
    request.input("messageKey", NVarChar(200), messageKey);
    request.input("metadataJson", NVarChar(MAX), metadataJson);
    request.input("createdAt", DateTime2, createdAt);

    const result = await request.query<NotificationDatabaseRecord>(`
      INSERT INTO dbo.notifications (
        notification_id,
        account_id,
        notification_type,
        title_key,
        message_key,
        metadata_json,
        created_at,
        read_at
      )
      OUTPUT
        inserted.notification_id,
        inserted.account_id,
        inserted.notification_type,
        inserted.title_key,
        inserted.message_key,
        inserted.metadata_json,
        inserted.created_at,
        inserted.read_at
      VALUES (
        @notificationId,
        @accountId,
        @notificationType,
        @titleKey,
        @messageKey,
        @metadataJson,
        @createdAt,
        NULL
      );
    `);

    const record = result.recordset[0];

    if (!record) {
      throw new Error(
        "SQL Server no devolvió la notificación creada.",
      );
    }

    return mapNotificationRecord(record);
  } catch (error) {
    throw toDatabaseError(error, "QUERY_FAILED");
  }
}

export async function listAccountNotifications(
  input: ListNotificationsInput,
  transaction?: Transaction,
): Promise<readonly NotificationRepositoryRecord[]> {
  const accountId = validateUuid(input.accountId, "accountId");

  const limit = normalizePaginationValue(
    input.limit,
    50,
    1,
    100,
    "limit",
  );

  const offset = normalizePaginationValue(
    input.offset,
    0,
    0,
    10_000,
    "offset",
  );

  const unreadOnly = input.unreadOnly === true;

  try {
    const request = await createRepositoryRequest(transaction);

    request.input("accountId", UniqueIdentifier, accountId);
    request.input("offset", Int, offset);
    request.input("limit", Int, limit);
    request.input("unreadOnly", Int, unreadOnly ? 1 : 0);

    const result = await request.query<NotificationDatabaseRecord>(`
      SELECT
        notification_id,
        account_id,
        notification_type,
        title_key,
        message_key,
        metadata_json,
        created_at,
        read_at
      FROM dbo.notifications
      WHERE
        account_id = @accountId
        AND (
          @unreadOnly = 0
          OR read_at IS NULL
        )
      ORDER BY
        created_at DESC,
        notification_id DESC
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY;
    `);

    return result.recordset.map(mapNotificationRecord);
  } catch (error) {
    throw toDatabaseError(error, "QUERY_FAILED");
  }
}

export async function countUnreadNotifications(
  accountId: string,
  transaction?: Transaction,
): Promise<number> {
  const normalizedAccountId = validateUuid(
    accountId,
    "accountId",
  );

  try {
    const request = await createRepositoryRequest(transaction);

    request.input(
      "accountId",
      UniqueIdentifier,
      normalizedAccountId,
    );

    const result = await request.query<UnreadCountDatabaseRecord>(`
      SELECT
        COUNT_BIG(*) AS unread_count
      FROM dbo.notifications
      WHERE
        account_id = @accountId
        AND read_at IS NULL;
    `);

    return normalizeUnreadCount(
      result.recordset[0]?.unread_count,
    );
  } catch (error) {
    throw toDatabaseError(error, "QUERY_FAILED");
  }
}

export async function markNotificationAsRead(
  accountId: string,
  notificationId: string,
  readAt = new Date(),
  transaction?: Transaction,
): Promise<NotificationRepositoryRecord | null> {
  const normalizedAccountId = validateUuid(
    accountId,
    "accountId",
  );

  const normalizedNotificationId = validateUuid(
    notificationId,
    "notificationId",
  );

  const normalizedReadAt = validateDate(
    readAt,
    "readAt",
  );

  try {
    const request = await createRepositoryRequest(transaction);

    request.input(
      "accountId",
      UniqueIdentifier,
      normalizedAccountId,
    );

    request.input(
      "notificationId",
      UniqueIdentifier,
      normalizedNotificationId,
    );

    request.input(
      "readAt",
      DateTime2,
      normalizedReadAt,
    );

    const result = await request.query<NotificationDatabaseRecord>(`
      UPDATE dbo.notifications
      SET
        read_at = COALESCE(
          read_at,
          CASE
            WHEN @readAt < created_at THEN created_at
            ELSE @readAt
          END
        )
      OUTPUT
        inserted.notification_id,
        inserted.account_id,
        inserted.notification_type,
        inserted.title_key,
        inserted.message_key,
        inserted.metadata_json,
        inserted.created_at,
        inserted.read_at
      WHERE
        notification_id = @notificationId
        AND account_id = @accountId;
    `);

    const record = result.recordset[0];

    return record
      ? mapNotificationRecord(record)
      : null;
  } catch (error) {
    throw toDatabaseError(error, "QUERY_FAILED");
  }
}

export async function markAllNotificationsAsRead(
  accountId: string,
  readAt = new Date(),
  transaction?: Transaction,
): Promise<number> {
  const normalizedAccountId = validateUuid(
    accountId,
    "accountId",
  );

  const normalizedReadAt = validateDate(
    readAt,
    "readAt",
  );

  try {
    const request = await createRepositoryRequest(transaction);

    request.input(
      "accountId",
      UniqueIdentifier,
      normalizedAccountId,
    );

    request.input(
      "readAt",
      DateTime2,
      normalizedReadAt,
    );

    const result = await request.query(`
      UPDATE dbo.notifications
      SET
        read_at = CASE
          WHEN @readAt < created_at THEN created_at
          ELSE @readAt
        END
      WHERE
        account_id = @accountId
        AND read_at IS NULL;
    `);

    return normalizeRowsAffected(
      result.rowsAffected[0],
    );
  } catch (error) {
    throw toDatabaseError(error, "QUERY_FAILED");
  }
}