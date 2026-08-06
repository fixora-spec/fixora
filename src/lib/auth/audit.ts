import "server-only";

import {
  isIP,
} from "node:net";

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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const EVENT_TYPE_PATTERN =
  /^[A-Z][A-Z0-9_.:-]{0,99}$/u;

const FORBIDDEN_CONTROL_CHARACTER_PATTERN =
  /[\u0000-\u001F\u007F]/u;

const SENSITIVE_METADATA_KEY_PATTERN =
  /(?:password|passphrase|secret|token|cookie|authorization|verification.?code|code.?hash|smtp|pepper|credential|session.?id)/iu;

const MAXIMUM_METADATA_LENGTH = 20_000;
const MAXIMUM_METADATA_DEPTH = 6;
const MAXIMUM_METADATA_PROPERTIES = 100;
const MAXIMUM_METADATA_ARRAY_ITEMS = 50;
const MAXIMUM_METADATA_STRING_LENGTH = 2_000;

async function createAuditRequest(
  transaction?: Transaction,
): Promise<Request> {
  return transaction
    ? new Request(transaction)
    : createSqlRequest();
}

function validateUuid(
  value: string,
  fieldName: string,
): string {
  const normalizedValue = value.trim().toLowerCase();

  if (!UUID_PATTERN.test(normalizedValue)) {
    throw new Error(`${fieldName} no contiene un UUID válido.`);
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
    throw new Error(`${fieldName} no contiene una fecha válida.`);
  }

  return normalizedDate;
}

function normalizeEventType(value: string): string {
  const normalizedValue = value.trim().normalize("NFC");

  if (!EVENT_TYPE_PATTERN.test(normalizedValue)) {
    throw new Error("eventType no contiene un valor válido.");
  }

  return normalizedValue;
}

function normalizeIpAddress(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  let normalizedValue = value.trim();

  if (!normalizedValue) {
    return null;
  }

  if (normalizedValue.toLowerCase().startsWith("::ffff:")) {
    const mappedIpv4 = normalizedValue.slice("::ffff:".length);

    if (isIP(mappedIpv4) === 4) {
      normalizedValue = mappedIpv4;
    }
  }

  if (
    normalizedValue.length > 45
    || FORBIDDEN_CONTROL_CHARACTER_PATTERN.test(normalizedValue)
    || isIP(normalizedValue) === 0
  ) {
    return null;
  }

  return normalizedValue.toLowerCase();
}

function normalizeUserAgent(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value
    .replace(/[\u0000-\u001F\u007F]+/gu, " ")
    .trim()
    .normalize("NFC");

  return normalizedValue
    ? normalizedValue.slice(0, 512)
    : null;
}

type MetadataSanitizationState = {
  propertyCount: number;
  seenObjects: WeakSet<object>;
};

function sanitizeMetadataValue(
  value: unknown,
  state: MetadataSanitizationState,
  depth: number,
): unknown {
  if (
    value === null
    || typeof value === "boolean"
    || typeof value === "string"
  ) {
    return typeof value === "string"
      ? value.slice(0, MAXIMUM_METADATA_STRING_LENGTH)
      : value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : value.toISOString();
  }

  if (
    typeof value !== "object"
    || depth >= MAXIMUM_METADATA_DEPTH
  ) {
    return null;
  }

  if (state.seenObjects.has(value)) {
    throw new Error("Los metadatos de auditoría contienen una referencia circular.");
  }

  state.seenObjects.add(value);

  try {
    if (Array.isArray(value)) {
      return value
        .slice(0, MAXIMUM_METADATA_ARRAY_ITEMS)
        .map((item) =>
          sanitizeMetadataValue(item, state, depth + 1),
        );
    }

    const sanitizedRecord: Record<string, unknown> = Object.create(null);

    for (const [rawKey, rawValue] of Object.entries(value)) {
      if (state.propertyCount >= MAXIMUM_METADATA_PROPERTIES) {
        break;
      }

      const key = rawKey
        .replace(/[\u0000-\u001F\u007F]+/gu, "")
        .trim()
        .slice(0, 100);

      if (!key || key === "__proto__" || key === "constructor") {
        continue;
      }

      state.propertyCount += 1;

      sanitizedRecord[key] = SENSITIVE_METADATA_KEY_PATTERN.test(key)
        ? "[REDACTED]"
        : sanitizeMetadataValue(rawValue, state, depth + 1);
    }

    return sanitizedRecord;
  } finally {
    state.seenObjects.delete(value);
  }
}

function sanitizeMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (metadata === null || typeof metadata === "undefined") {
    return null;
  }

  const sanitizedValue = sanitizeMetadataValue(
    metadata,
    {
      propertyCount: 0,
      seenObjects: new WeakSet<object>(),
    },
    0,
  );

  if (
    typeof sanitizedValue !== "object"
    || sanitizedValue === null
    || Array.isArray(sanitizedValue)
  ) {
    return null;
  }

  return sanitizedValue as Record<string, unknown>;
}

function serializeMetadata(
  metadata: Record<string, unknown> | null,
): string | null {
  if (metadata === null) {
    return null;
  }

  let serializedMetadata: string;

  try {
    serializedMetadata = JSON.stringify(metadata);
  } catch {
    throw new Error("Los metadatos de auditoría no son serializables.");
  }

  if (serializedMetadata.length > MAXIMUM_METADATA_LENGTH) {
    throw new Error(
      "Los metadatos de auditoría superan el tamaño permitido.",
    );
  }

  return serializedMetadata;
}

function getSafeAuditFailureName(error: unknown): string {
  if (error instanceof Error) {
    return error.name.slice(0, 100) || "Error";
  }

  return "UnknownError";
}

export async function createAuthAuditEvent(
  input: AuthAuditEventInput,
  transaction?: Transaction,
): Promise<AuthAuditEventRecord> {
  const eventId = validateUuid(input.eventId, "eventId");
  const accountId = input.accountId
    ? validateUuid(input.accountId, "accountId")
    : null;
  const eventType = normalizeEventType(input.eventType);

  if (typeof input.successful !== "boolean") {
    throw new Error("successful debe contener un valor booleano.");
  }

  const successful = input.successful;
  const ipAddress = normalizeIpAddress(input.ipAddress);
  const userAgent = normalizeUserAgent(input.userAgent);
  const metadata = sanitizeMetadata(input.metadata);
  const metadataJson = serializeMetadata(metadata);
  const createdAt = validateDate(input.createdAt ?? new Date(), "createdAt");

  try {
    const request = await createAuditRequest(transaction);

    request.input("eventId", UniqueIdentifier, eventId);
    request.input("accountId", UniqueIdentifier, accountId);
    request.input("eventType", VarChar(100), eventType);
    request.input("successful", Bit, successful);
    request.input("ipAddress", NVarChar(45), ipAddress);
    request.input("userAgent", NVarChar(512), userAgent);
    request.input("metadataJson", NVarChar(MAX), metadataJson);
    request.input("createdAt", DateTime2, createdAt);

    // No se utiliza OUTPUT porque fixora_app tiene INSERT, pero no SELECT,
    // sobre la tabla de auditoría por principio de mínimo privilegio.
    await request.query(`
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

    return {
      eventId,
      accountId,
      eventType,
      successful,
      ipAddress,
      userAgent,
      metadata,
      createdAt,
    };
  } catch (error) {
    throw toDatabaseError(error, "QUERY_FAILED");
  }
}

export async function tryCreateAuthAuditEvent(
  input: AuthAuditEventInput,
  transaction?: Transaction,
): Promise<AuthAuditEventRecord | null> {
  try {
    return await createAuthAuditEvent(input, transaction);
  } catch (error) {
    // No se imprime el error completo para evitar exponer consultas,
    // metadatos o información de conexión en registros operativos.
    console.error(
      `No se pudo registrar el evento de auditoría de autenticación (${getSafeAuditFailureName(error)}).`,
    );

    return null;
  }
}