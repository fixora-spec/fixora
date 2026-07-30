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

async function createRepositoryRequest(
  transaction?: Transaction,
): Promise<Request> {
  if (transaction) {
    return new Request(
      transaction,
    );
  }

  return createSqlRequest();
}

function validateUuid(
  value: string,
  fieldName: string,
): string {
  const normalizedValue =
    value.trim();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
      .test(normalizedValue)
  ) {
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
  const normalizedDate =
    new Date(value);

  if (
    Number.isNaN(
      normalizedDate.getTime(),
    )
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
  const normalizedValue =
    value
      .trim()
      .normalize("NFC");

  if (
    normalizedValue.length === 0
    || normalizedValue.length
      > maximumLength
  ) {
    throw new Error(
      `${fieldName} no contiene un valor válido.`,
    );
  }

  return normalizedValue;
}

function normalizePaginationValue(
  value: number | undefined,
  fallbackValue: number,
  minimum: number,
  maximum: number,
  fieldName: string,
): number {
  if (
    typeof value === "undefined"
  ) {
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

function serializeMetadata(
  metadata:
    Record<string, unknown>
    | null
    | undefined,
): string | null {
  if (
    metadata === null
    || typeof metadata
      === "undefined"
  ) {
    return null;
  }

  let serializedMetadata:
    string;

  try {
    serializedMetadata =
      JSON.stringify(metadata);
  } catch {
    throw new Error(
      "Los metadatos de la notificación no son serializables.",
    );
  }

  if (
    serializedMetadata.length
    > 20_000
  ) {
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

  try {
    const parsedValue =
      JSON.parse(
        serializedMetadata,
      ) as unknown;

    if (
      typeof parsedValue !== "object"
      || parsedValue === null
      || Array.isArray(parsedValue)
    ) {
      return null;
    }

    return parsedValue as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

function mapNotificationRecord(
  record: NotificationDatabaseRecord,
): NotificationRepositoryRecord {
  return {
    notificationId:
      record.notification_id,

    accountId:
      record.account_id,

    type:
      record.notification_type,

    titleKey:
      record.title_key,

    messageKey:
      record.message_key,

    metadata:
      parseMetadata(
        record.metadata_json,
      ),

    createdAt:
      new Date(
        record.created_at,
      ),

    readAt:
      record.read_at
        ? new Date(
            record.read_at,
          )
        : null,
  };
}

export async function createNotification(
  input: CreateNotificationInput,
  transaction?: Transaction,
): Promise<NotificationRepositoryRecord> {
  const notificationId =
    validateUuid(
      input.notificationId,
      "notificationId",
    );

  const accountId =
    validateUuid(
      input.accountId,
      "accountId",
    );

  const type =
    normalizeRequiredText(
      input.type,
      "type",
      80,
    );

  const titleKey =
    normalizeRequiredText(
      input.titleKey,
      "titleKey",
      200,
    );

  const messageKey =
    normalizeRequiredText(
      input.messageKey,
      "messageKey",
      200,
    );

  const metadataJson =
    serializeMetadata(
      input.metadata,
    );

  const createdAt =
    validateDate(
      input.createdAt
        ?? new Date(),
      "createdAt",
    );

  try {
    const request =
      await createRepositoryRequest(
        transaction,
      );

    request.input(
      "notificationId",
      UniqueIdentifier,
      notificationId,
    );

    request.input(
      "accountId",
      UniqueIdentifier,
      accountId,
    );

    request.input(
      "notificationType",
      VarChar(80),
      type,
    );

    request.input(
      "titleKey",
      NVarChar(200),
      titleKey,
    );

    request.input(
      "messageKey",
      NVarChar(200),
      messageKey,
    );

    request.input(
      "metadataJson",
      NVarChar(MAX),
      metadataJson,
    );

    request.input(
      "createdAt",
      DateTime2,
      createdAt,
    );

    const result =
      await request.query<
        NotificationDatabaseRecord
      >(`
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

    const record =
      result.recordset[0];

    if (!record) {
      throw new Error(
        "SQL Server no devolvió la notificación creada.",
      );
    }

    return mapNotificationRecord(
      record,
    );
  } catch (error) {
    throw toDatabaseError(
      error,
      "QUERY_FAILED",
    );
  }
}

export async function listAccountNotifications(
  input: ListNotificationsInput,
  transaction?: Transaction,
): Promise<
  readonly NotificationRepositoryRecord[]
> {
  const accountId =
    validateUuid(
      input.accountId,
      "accountId",
    );

  const limit =
    normalizePaginationValue(
      input.limit,
      50,
      1,
      100,
      "limit",
    );

  const offset =
    normalizePaginationValue(
      input.offset,
      0,
      0,
      10_000,
      "offset",
    );

  const unreadOnly =
    input.unreadOnly === true;

  try {
    const request =
      await createRepositoryRequest(
        transaction,
      );

    request.input(
      "accountId",
      UniqueIdentifier,
      accountId,
    );

    request.input(
      "offset",
      Int,
      offset,
    );

    request.input(
      "limit",
      Int,
      limit,
    );

    request.input(
      "unreadOnly",
      Int,
      unreadOnly
        ? 1
        : 0,
    );

    const result =
      await request.query<
        NotificationDatabaseRecord
      >(`
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

    return result.recordset.map(
      mapNotificationRecord,
    );
  } catch (error) {
    throw toDatabaseError(
      error,
      "QUERY_FAILED",
    );
  }
}

export async function countUnreadNotifications(
  accountId: string,
  transaction?: Transaction,
): Promise<number> {
  const normalizedAccountId =
    validateUuid(
      accountId,
      "accountId",
    );

  try {
    const request =
      await createRepositoryRequest(
        transaction,
      );

    request.input(
      "accountId",
      UniqueIdentifier,
      normalizedAccountId,
    );

    const result =
      await request.query<{
        unread_count: number;
      }>(`
        SELECT
          COUNT_BIG(*) AS unread_count
        FROM dbo.notifications
        WHERE
          account_id = @accountId
          AND read_at IS NULL;
      `);

    const unreadCount =
      result.recordset[0]
        ?.unread_count
      ?? 0;

    return Number(
      unreadCount,
    );
  } catch (error) {
    throw toDatabaseError(
      error,
      "QUERY_FAILED",
    );
  }
}

export async function markNotificationAsRead(
  accountId: string,
  notificationId: string,
  readAt = new Date(),
  transaction?: Transaction,
): Promise<NotificationRepositoryRecord | null> {
  const normalizedAccountId =
    validateUuid(
      accountId,
      "accountId",
    );

  const normalizedNotificationId =
    validateUuid(
      notificationId,
      "notificationId",
    );

  const normalizedReadAt =
    validateDate(
      readAt,
      "readAt",
    );

  try {
    const request =
      await createRepositoryRequest(
        transaction,
      );

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

    const result =
      await request.query<
        NotificationDatabaseRecord
      >(`
        UPDATE dbo.notifications
        SET
          read_at =
            COALESCE(
              read_at,
              @readAt
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
          notification_id
            = @notificationId
          AND account_id
            = @accountId;
      `);

    const record =
      result.recordset[0];

    return record
      ? mapNotificationRecord(
          record,
        )
      : null;
  } catch (error) {
    throw toDatabaseError(
      error,
      "QUERY_FAILED",
    );
  }
}

export async function markAllNotificationsAsRead(
  accountId: string,
  readAt = new Date(),
  transaction?: Transaction,
): Promise<number> {
  const normalizedAccountId =
    validateUuid(
      accountId,
      "accountId",
    );

  const normalizedReadAt =
    validateDate(
      readAt,
      "readAt",
    );

  try {
    const request =
      await createRepositoryRequest(
        transaction,
      );

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

    const result =
      await request.query(`
        UPDATE dbo.notifications
        SET read_at = @readAt
        WHERE
          account_id = @accountId
          AND read_at IS NULL;
      `);

    return result.rowsAffected[0]
      ?? 0;
  } catch (error) {
    throw toDatabaseError(
      error,
      "QUERY_FAILED",
    );
  }
}