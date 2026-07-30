import "server-only";

import {
  Bit,
  DateTime2,
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

export type AuthAuditEventInput = {
  eventId: string;

  accountId?: string | null;
  eventType: string;

  successful: boolean;

  ipAddress?: string | null;
  userAgent?: string | null;

  metadata?: Record<string, unknown> | null;

  createdAt?: Date;
};

export type AuthAuditEventRecord = {
  eventId: string;

  accountId: string | null;
  eventType: string;

  successful: boolean;

  ipAddress: string | null;
  userAgent: string | null;

  metadata: Record<string, unknown> | null;

  createdAt: Date;
};

type AuthAuditDatabaseRecord = {
  audit_event_id: string;

  account_id: string | null;
  event_type: string;

  successful: boolean;

  ip_address: string | null;
  user_agent: string | null;

  metadata_json: string | null;

  created_at: Date;
};

async function createAuditRequest(
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
  const normalizedValue =
    value.trim();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      normalizedValue,
    )
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

function normalizeOptionalText(
  value: string | null | undefined,
  maximumLength: number,
): string | null {
  const normalizedValue =
    value
      ?.trim()
      .normalize("NFC")
    ?? "";

  if (!normalizedValue) {
    return null;
  }

  return normalizedValue.slice(
    0,
    maximumLength,
  );
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
      "Los metadatos de auditoría no son serializables.",
    );
  }

  if (
    serializedMetadata.length
    > 20_000
  ) {
    throw new Error(
      "Los metadatos de auditoría superan el tamaño permitido.",
    );
  }

  return serializedMetadata;
}

function parseMetadata(
  value: string | null,
): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  try {
    const parsedValue =
      JSON.parse(value) as unknown;

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

function mapAuditRecord(
  record: AuthAuditDatabaseRecord,
): AuthAuditEventRecord {
  return {
    eventId:
      record.audit_event_id,

    accountId:
      record.account_id,

    eventType:
      record.event_type,

    successful:
      Boolean(record.successful),

    ipAddress:
      record.ip_address,

    userAgent:
      record.user_agent,

    metadata:
      parseMetadata(
        record.metadata_json,
      ),

    createdAt:
      new Date(
        record.created_at,
      ),
  };
}

export async function createAuthAuditEvent(
  input: AuthAuditEventInput,
  transaction?: Transaction,
): Promise<AuthAuditEventRecord> {
  const eventId =
    validateUuid(
      input.eventId,
      "eventId",
    );

  const accountId =
    input.accountId
      ? validateUuid(
          input.accountId,
          "accountId",
        )
      : null;

  const eventType =
    normalizeRequiredText(
      input.eventType,
      "eventType",
      100,
    );

  const ipAddress =
    normalizeOptionalText(
      input.ipAddress,
      45,
    );

  const userAgent =
    normalizeOptionalText(
      input.userAgent,
      512,
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
      await createAuditRequest(
        transaction,
      );

    request.input(
      "eventId",
      UniqueIdentifier,
      eventId,
    );

    request.input(
      "accountId",
      UniqueIdentifier,
      accountId,
    );

    request.input(
      "eventType",
      VarChar(100),
      eventType,
    );

    request.input(
      "successful",
      Bit,
      input.successful,
    );

    request.input(
      "ipAddress",
      NVarChar(45),
      ipAddress,
    );

    request.input(
      "userAgent",
      NVarChar(512),
      userAgent,
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
        AuthAuditDatabaseRecord
      >(`
        INSERT INTO dbo.auth_audit_events (
          audit_event_id,
          account_id,
          event_type,
          successful,
          ip_address,
          user_agent,
          metadata_json,
          created_at
        )
        OUTPUT
          inserted.audit_event_id,
          inserted.account_id,
          inserted.event_type,
          inserted.successful,
          inserted.ip_address,
          inserted.user_agent,
          inserted.metadata_json,
          inserted.created_at
        VALUES (
          @eventId,
          @accountId,
          @eventType,
          @successful,
          @ipAddress,
          @userAgent,
          @metadataJson,
          @createdAt
        );
      `);

    const record =
      result.recordset[0];

    if (!record) {
      throw new Error(
        "SQL Server no devolvió el evento de auditoría creado.",
      );
    }

    return mapAuditRecord(record);
  } catch (error) {
    throw toDatabaseError(
      error,
      "QUERY_FAILED",
    );
  }
}

export async function tryCreateAuthAuditEvent(
  input: AuthAuditEventInput,
  transaction?: Transaction,
): Promise<AuthAuditEventRecord | null> {
  try {
    return await createAuthAuditEvent(
      input,
      transaction,
    );
  } catch (error) {
    console.error(
      "No se pudo registrar el evento de auditoría de autenticación.",
      error,
    );

    return null;
  }
}