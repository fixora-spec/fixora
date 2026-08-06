import "server-only";

import {
  NextResponse,
} from "next/server";

import type {
  AuthApiError,
  AuthApiSuccess,
  AuthErrorCode,
  AuthFieldError,
} from "@/types/auth";

export type ApiResponseHeaders = HeadersInit;

export type ApiSuccessResponseOptions = {
  status?: number;
  headers?: ApiResponseHeaders;
};

export type ApiErrorResponseOptions = {
  code: AuthErrorCode;
  message: string;
  status?: number;

  fieldErrors?: readonly AuthFieldError[];
  retryAfterSeconds?: number;
  headers?: ApiResponseHeaders;
};

const MAXIMUM_ERROR_MESSAGE_LENGTH = 1_000;
const MAXIMUM_FIELD_ERRORS = 20;

function createResponseHeaders(initialHeaders?: HeadersInit): Headers {
  let headers: Headers;

  try {
    headers = new Headers(initialHeaders);
  } catch {
    throw new Error("Las cabeceras HTTP de la respuesta no son válidas.");
  }

  headers.set("Cache-Control", "no-store, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  headers.set("X-Content-Type-Options", "nosniff");

  return headers;
}

function validateSuccessStatus(status: number): void {
  if (
    !Number.isSafeInteger(status)
    || status < 200
    || status > 299
    || status === 204
    || status === 205
  ) {
    throw new Error(
      "Una respuesta JSON exitosa debe usar un estado HTTP válido entre 200 y 299 que permita contenido.",
    );
  }
}

function validateErrorStatus(status: number): void {
  if (
    !Number.isSafeInteger(status)
    || status < 400
    || status > 599
  ) {
    throw new Error(
      "Una respuesta de error debe usar un estado HTTP válido entre 400 y 599.",
    );
  }
}

function validateErrorMessage(message: string): string {
  const normalizedMessage = message.trim();

  if (
    normalizedMessage.length === 0
    || normalizedMessage.length > MAXIMUM_ERROR_MESSAGE_LENGTH
    || /[\r\n\0]/u.test(normalizedMessage)
  ) {
    throw new Error("El mensaje de error de la API no es válido.");
  }

  return normalizedMessage;
}

function validateFieldErrors(
  fieldErrors: readonly AuthFieldError[] | undefined,
): readonly AuthFieldError[] | undefined {
  if (typeof fieldErrors === "undefined") {
    return undefined;
  }

  if (!Array.isArray(fieldErrors) || fieldErrors.length > MAXIMUM_FIELD_ERRORS) {
    throw new Error("La colección de errores de campos no es válida.");
  }

  return fieldErrors.map((fieldError) => ({
    field: fieldError.field,
    code: fieldError.code,
  }));
}

function validateRetryAfterSeconds(
  retryAfterSeconds: number | undefined,
  status: number,
): void {
  if (typeof retryAfterSeconds === "undefined") {
    return;
  }

  if (
    !Number.isSafeInteger(retryAfterSeconds)
    || retryAfterSeconds < 1
    || retryAfterSeconds > 86_400
  ) {
    throw new Error(
      "retryAfterSeconds debe estar entre 1 y 86400.",
    );
  }

  if (status !== 429 && status !== 503) {
    throw new Error(
      "Retry-After solo puede enviarse con los estados HTTP 429 o 503.",
    );
  }
}

function normalizeAllowedMethods(
  allowedMethods: readonly string[],
): string[] {
  const normalizedMethods = [
    ...new Set(
      allowedMethods.map((method) => method.trim().toUpperCase()),
    ),
  ].filter((method) => /^[A-Z]+$/u.test(method));

  if (normalizedMethods.length === 0) {
    throw new Error("Debe indicar al menos un método HTTP permitido.");
  }

  return normalizedMethods;
}

export function createApiSuccessResponse<TData>(
  data: TData,
  options: ApiSuccessResponseOptions = {},
): NextResponse<AuthApiSuccess<TData>> {
  const status = options.status ?? 200;

  validateSuccessStatus(status);

  const responseBody: AuthApiSuccess<TData> = {
    success: true,
    data,
  };

  return NextResponse.json(responseBody, {
    status,
    headers: createResponseHeaders(options.headers),
  });
}

export function createApiErrorResponse(
  options: ApiErrorResponseOptions,
): NextResponse<AuthApiError> {
  const status = options.status ?? 400;

  validateErrorStatus(status);
  validateRetryAfterSeconds(options.retryAfterSeconds, status);

  const message = validateErrorMessage(options.message);
  const fieldErrors = validateFieldErrors(options.fieldErrors);
  const headers = createResponseHeaders(options.headers);

  if (typeof options.retryAfterSeconds === "number") {
    headers.set("Retry-After", String(options.retryAfterSeconds));
  }

  const responseBody: AuthApiError = {
    success: false,
    error: {
      code: options.code,
      message,
      ...(fieldErrors ? { fieldErrors } : {}),
      ...(typeof options.retryAfterSeconds === "number"
        ? { retryAfterSeconds: options.retryAfterSeconds }
        : {}),
    },
  };

  return NextResponse.json(responseBody, {
    status,
    headers,
  });
}

export function createApiNoContentResponse(
  headers?: HeadersInit,
): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: createResponseHeaders(headers),
  });
}

export function createMethodNotAllowedResponse(
  allowedMethods: readonly string[],
): NextResponse<AuthApiError> {
  const normalizedMethods = normalizeAllowedMethods(allowedMethods);

  return createApiErrorResponse({
    code: "INVALID_REQUEST",
    message: "El método HTTP solicitado no está permitido.",
    status: 405,
    headers: {
      Allow: normalizedMethods.join(", "),
    },
  });
}