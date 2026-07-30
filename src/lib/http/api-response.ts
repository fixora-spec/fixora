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

export type ApiResponseHeaders =
  HeadersInit;

export type ApiSuccessResponseOptions = {
  status?: number;
  headers?: ApiResponseHeaders;
};

export type ApiErrorResponseOptions = {
  code: AuthErrorCode;
  message: string;
  status?: number;

  fieldErrors?:
    readonly AuthFieldError[];

  retryAfterSeconds?: number;

  headers?: ApiResponseHeaders;
};

function createResponseHeaders(
  initialHeaders?: HeadersInit,
): Headers {
  const headers =
    new Headers(initialHeaders);

  headers.set(
    "Cache-Control",
    "no-store",
  );

  return headers;
}

function validateHttpStatus(
  status: number,
): void {
  if (
    !Number.isSafeInteger(status)
    || status < 100
    || status > 599
  ) {
    throw new Error(
      "El estado HTTP de la respuesta no es válido.",
    );
  }
}

function validateRetryAfterSeconds(
  retryAfterSeconds:
    number | undefined,
): void {
  if (
    typeof retryAfterSeconds
      === "undefined"
  ) {
    return;
  }

  if (
    !Number.isSafeInteger(
      retryAfterSeconds,
    )
    || retryAfterSeconds < 1
    || retryAfterSeconds > 86_400
  ) {
    throw new Error(
      "retryAfterSeconds debe estar entre 1 y 86400.",
    );
  }
}

export function createApiSuccessResponse<
  TData,
>(
  data: TData,
  options:
    ApiSuccessResponseOptions = {},
): NextResponse<
  AuthApiSuccess<TData>
> {
  const status =
    options.status ?? 200;

  validateHttpStatus(status);

  const responseBody:
    AuthApiSuccess<TData> = {
    success:
      true,

    data,
  };

  return NextResponse.json(
    responseBody,
    {
      status,

      headers:
        createResponseHeaders(
          options.headers,
        ),
    },
  );
}

export function createApiErrorResponse(
  options: ApiErrorResponseOptions,
): NextResponse<AuthApiError> {
  const status =
    options.status ?? 400;

  validateHttpStatus(status);

  validateRetryAfterSeconds(
    options.retryAfterSeconds,
  );

  const headers =
    createResponseHeaders(
      options.headers,
    );

  if (
    typeof options.retryAfterSeconds
      === "number"
  ) {
    headers.set(
      "Retry-After",
      String(
        options.retryAfterSeconds,
      ),
    );
  }

  const responseBody:
    AuthApiError = {
    success:
      false,

    error: {
      code:
        options.code,

      message:
        options.message,

      ...(options.fieldErrors
        ? {
            fieldErrors:
              options.fieldErrors,
          }
        : {}),

      ...(typeof options
        .retryAfterSeconds
        === "number"
        ? {
            retryAfterSeconds:
              options
                .retryAfterSeconds,
          }
        : {}),
    },
  };

  return NextResponse.json(
    responseBody,
    {
      status,
      headers,
    },
  );
}

export function createApiNoContentResponse(
  headers?: HeadersInit,
): NextResponse {
  return new NextResponse(
    null,
    {
      status:
        204,

      headers:
        createResponseHeaders(
          headers,
        ),
    },
  );
}

export function createMethodNotAllowedResponse(
  allowedMethods:
    readonly string[],
): NextResponse<AuthApiError> {
  const normalizedMethods =
    allowedMethods
      .map((method) =>
        method.trim().toUpperCase(),
      )
      .filter(
        (method) =>
          method.length > 0,
      );

  return createApiErrorResponse({
    code:
      "INVALID_REQUEST",

    message:
      "El método HTTP solicitado no está permitido.",

    status:
      405,

    headers: {
      Allow:
        normalizedMethods.join(", "),
    },
  });
}