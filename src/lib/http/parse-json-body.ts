import "server-only";

import {
  AUTH_REQUEST_LIMITS,
} from "@/config/auth.config";

import type {
  AuthErrorCode,
} from "@/types/auth";

export type ParseJsonBodyOptions = {
  maximumBytes?: number;
  requireObject?: boolean;
};

export class JsonBodyError extends Error {
  public readonly code:
    Extract<
      AuthErrorCode,
      | "INVALID_REQUEST"
      | "INVALID_JSON"
      | "BODY_TOO_LARGE"
    >;

  public readonly status:
    number;

  public constructor(
    code: JsonBodyError["code"],
    message: string,
    status: number,
  ) {
    super(message);

    this.name =
      "JsonBodyError";

    this.code =
      code;

    this.status =
      status;
  }
}

function validateMaximumBytes(
  maximumBytes: number,
): void {
  if (
    !Number.isSafeInteger(maximumBytes)
    || maximumBytes < 1
    || maximumBytes > 1_048_576
  ) {
    throw new Error(
      "maximumBytes debe ser un número entero entre 1 y 1048576.",
    );
  }
}

function isJsonContentType(
  contentType: string | null,
): boolean {
  if (!contentType) {
    return false;
  }

  const mediaType =
    contentType
      .split(";", 1)[0]
      ?.trim()
      .toLowerCase();

  return (
    mediaType === "application/json"
    || mediaType?.endsWith("+json")
      === true
  );
}

function readContentLength(
  request: Request,
): number | null {
  const rawContentLength =
    request.headers
      .get("content-length")
      ?.trim();

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

  const contentLength =
    Number.parseInt(
      rawContentLength,
      10,
    );

  if (
    !Number.isSafeInteger(contentLength)
    || contentLength < 0
  ) {
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
): value is Record<
  string,
  unknown
> {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
  ) {
    return false;
  }

  const prototype =
    Object.getPrototypeOf(value);

  return (
    prototype === Object.prototype
    || prototype === null
  );
}

function decodeRequestBody(
  buffer: ArrayBuffer,
): string {
  try {
    const decoder =
      new TextDecoder(
        "utf-8",
        {
          fatal: true,
        },
      );

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
    options.maximumBytes
    ?? AUTH_REQUEST_LIMITS
      .maximumJsonBodyBytes;

  const requireObject =
    options.requireObject ?? true;

  validateMaximumBytes(
    maximumBytes,
  );

  if (
    !isJsonContentType(
      request.headers.get(
        "content-type",
      ),
    )
  ) {
    throw new JsonBodyError(
      "INVALID_REQUEST",
      "La solicitud debe utilizar Content-Type application/json.",
      415,
    );
  }

  const declaredContentLength =
    readContentLength(request);

  if (
    declaredContentLength !== null
    && declaredContentLength
      > maximumBytes
  ) {
    throw new JsonBodyError(
      "BODY_TOO_LARGE",
      `El cuerpo de la solicitud supera el máximo permitido de ${maximumBytes} bytes.`,
      413,
    );
  }

  let bodyBuffer:
    ArrayBuffer;

  try {
    bodyBuffer =
      await request.arrayBuffer();
  } catch {
    throw new JsonBodyError(
      "INVALID_REQUEST",
      "No se pudo leer el cuerpo de la solicitud.",
      400,
    );
  }

  if (bodyBuffer.byteLength === 0) {
    throw new JsonBodyError(
      "INVALID_JSON",
      "El cuerpo de la solicitud está vacío.",
      400,
    );
  }

  if (
    bodyBuffer.byteLength
    > maximumBytes
  ) {
    throw new JsonBodyError(
      "BODY_TOO_LARGE",
      `El cuerpo de la solicitud supera el máximo permitido de ${maximumBytes} bytes.`,
      413,
    );
  }

  const bodyText =
    decodeRequestBody(
      bodyBuffer,
    ).trim();

  if (bodyText.length === 0) {
    throw new JsonBodyError(
      "INVALID_JSON",
      "El cuerpo de la solicitud está vacío.",
      400,
    );
  }

  let parsedBody:
    unknown;

  try {
    parsedBody =
      JSON.parse(bodyText) as unknown;
  } catch {
    throw new JsonBodyError(
      "INVALID_JSON",
      "El cuerpo de la solicitud no contiene un JSON válido.",
      400,
    );
  }

  if (
    requireObject
    && !isPlainJsonObject(parsedBody)
  ) {
    throw new JsonBodyError(
      "INVALID_JSON",
      "El cuerpo JSON debe ser un objeto.",
      400,
    );
  }

  return parsedBody as TData;
}

export function isJsonBodyError(
  error: unknown,
): error is JsonBodyError {
  return error instanceof JsonBodyError;
}