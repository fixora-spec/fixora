import "server-only";

import { AUTH_REQUEST_LIMITS } from "@/config/auth.config";

import type { AuthErrorCode } from "@/types/auth";

export type ParseJsonBodyOptions = {
  maximumBytes?: number;
  requireObject?: boolean;
};

export class JsonBodyError extends Error {
  public readonly code: Extract<
    AuthErrorCode,
    "INVALID_REQUEST" | "INVALID_JSON" | "BODY_TOO_LARGE"
  >;

  public readonly status: number;

  public constructor(
    code: JsonBodyError["code"],
    message: string,
    status: number,
  ) {
    super(message);

    this.name = "JsonBodyError";
    this.code = code;
    this.status = status;
  }
}

const MAXIMUM_CONFIGURABLE_BODY_BYTES = 1_048_576;
const MAXIMUM_STREAM_CHUNKS = 4_096;

function validateMaximumBytes(maximumBytes: number): void {
  if (
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 1 ||
    maximumBytes > MAXIMUM_CONFIGURABLE_BODY_BYTES
  ) {
    throw new Error(
      `maximumBytes debe ser un número entero entre 1 y ${MAXIMUM_CONFIGURABLE_BODY_BYTES}.`,
    );
  }
}

function isJsonContentType(contentType: string | null): boolean {
  if (!contentType) {
    return false;
  }

  const mediaType = contentType
    .split(";", 1)[0]
    ?.trim()
    .toLowerCase();

  return mediaType === "application/json" || mediaType?.endsWith("+json") === true;
}

function validateContentEncoding(request: Request): void {
  const contentEncoding = request.headers
    .get("content-encoding")
    ?.trim()
    .toLowerCase();

  if (!contentEncoding || contentEncoding === "identity") {
    return;
  }

  throw new JsonBodyError(
    "INVALID_REQUEST",
    "La solicitud JSON no admite cuerpos comprimidos.",
    415,
  );
}

function readContentLength(request: Request): number | null {
  const rawContentLength = request.headers.get("content-length")?.trim();

  if (!rawContentLength) {
    return null;
  }

  if (!/^\d+$/u.test(rawContentLength)) {
    throw new JsonBodyError(
      "INVALID_REQUEST",
      "El encabezado Content-Length no es válido.",
      400,
    );
  }

  const contentLength = Number.parseInt(rawContentLength, 10);

  if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
    throw new JsonBodyError(
      "INVALID_REQUEST",
      "El tamaño declarado de la solicitud no es válido.",
      400,
    );
  }

  return contentLength;
}

function isPlainJsonObject(
  value: unknown,
): value is Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function createBodyTooLargeError(maximumBytes: number): JsonBodyError {
  return new JsonBodyError(
    "BODY_TOO_LARGE",
    `El cuerpo de la solicitud supera el máximo permitido de ${maximumBytes} bytes.`,
    413,
  );
}

async function cancelReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    // La conexión puede haber terminado mientras se cancelaba la lectura.
  }
}

function combineChunks(
  chunks: readonly Uint8Array[],
  totalBytes: number,
): Uint8Array {
  if (chunks.length === 1) {
    return chunks[0] ?? new Uint8Array();
  }

  const combinedBody = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    combinedBody.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return combinedBody;
}

async function readRequestBodyWithLimit(
  request: Request,
  maximumBytes: number,
): Promise<Uint8Array> {
  if (!request.body) {
    return new Uint8Array();
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let chunkCount = 0;

  try {
    while (true) {
      const result = await reader.read();

      if (result.done) {
        break;
      }

      const chunk = result.value;

      if (!(chunk instanceof Uint8Array)) {
        await cancelReader(reader);

        throw new JsonBodyError(
          "INVALID_REQUEST",
          "El cuerpo de la solicitud utiliza un formato de transmisión no válido.",
          400,
        );
      }

      if (chunk.byteLength === 0) {
        continue;
      }

      chunkCount += 1;

      if (chunkCount > MAXIMUM_STREAM_CHUNKS) {
        await cancelReader(reader);

        throw new JsonBodyError(
          "INVALID_REQUEST",
          "El cuerpo de la solicitud está excesivamente fragmentado.",
          400,
        );
      }

      if (chunk.byteLength > maximumBytes - totalBytes) {
        await cancelReader(reader);
        throw createBodyTooLargeError(maximumBytes);
      }

      chunks.push(chunk);
      totalBytes += chunk.byteLength;
    }
  } catch (error) {
    if (error instanceof JsonBodyError) {
      throw error;
    }

    throw new JsonBodyError(
      "INVALID_REQUEST",
      "No se pudo leer el cuerpo de la solicitud.",
      400,
    );
  } finally {
    reader.releaseLock();
  }

  return combineChunks(chunks, totalBytes);
}

function decodeRequestBody(buffer: Uint8Array): string {
  try {
    const decoder = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    });

    return decoder.decode(buffer);
  } catch {
    throw new JsonBodyError(
      "INVALID_JSON",
      "El cuerpo de la solicitud no contiene texto UTF-8 válido.",
      400,
    );
  }
}

export async function parseJsonBody<
  TData = Record<string, unknown>,
>(
  request: Request,
  options: ParseJsonBodyOptions = {},
): Promise<TData> {
  const maximumBytes =
    options.maximumBytes ?? AUTH_REQUEST_LIMITS.maximumJsonBodyBytes;
  const requireObject = options.requireObject ?? true;

  validateMaximumBytes(maximumBytes);

  if (!isJsonContentType(request.headers.get("content-type"))) {
    throw new JsonBodyError(
      "INVALID_REQUEST",
      "La solicitud debe utilizar Content-Type application/json.",
      415,
    );
  }

  validateContentEncoding(request);

  const declaredContentLength = readContentLength(request);

  if (
    declaredContentLength !== null &&
    declaredContentLength > maximumBytes
  ) {
    throw createBodyTooLargeError(maximumBytes);
  }

  const bodyBuffer = await readRequestBodyWithLimit(request, maximumBytes);

  if (bodyBuffer.byteLength === 0) {
    throw new JsonBodyError(
      "INVALID_JSON",
      "El cuerpo de la solicitud está vacío.",
      400,
    );
  }

  const bodyText = decodeRequestBody(bodyBuffer).trim();

  if (bodyText.length === 0) {
    throw new JsonBodyError(
      "INVALID_JSON",
      "El cuerpo de la solicitud está vacío.",
      400,
    );
  }

  let parsedBody: unknown;

  try {
    parsedBody = JSON.parse(bodyText) as unknown;
  } catch {
    throw new JsonBodyError(
      "INVALID_JSON",
      "El cuerpo de la solicitud no contiene un JSON válido.",
      400,
    );
  }

  if (requireObject && !isPlainJsonObject(parsedBody)) {
    throw new JsonBodyError(
      "INVALID_JSON",
      "El cuerpo JSON debe ser un objeto.",
      400,
    );
  }

  return parsedBody as TData;
}

export function isJsonBodyError(error: unknown): error is JsonBodyError {
  return error instanceof JsonBodyError;
}