import "server-only";

import type {
  AuthErrorCode,
} from "@/types/auth";

export type VerifyRequestOriginOptions = {
  allowedOrigins?: readonly string[];
  requireOrigin?: boolean;
  allowSafeMethods?: boolean;
};

export class RequestOriginError
  extends Error {
  public readonly code:
    Extract<
      AuthErrorCode,
      "INVALID_ORIGIN"
    >;

  public readonly status:
    403;

  public constructor(
    message: string,
  ) {
    super(message);

    this.name =
      "RequestOriginError";

    this.code =
      "INVALID_ORIGIN";

    this.status =
      403;
  }
}

const SAFE_HTTP_METHODS =
  new Set([
    "GET",
    "HEAD",
    "OPTIONS",
  ]);

function normalizeOrigin(
  value: string,
): string | null {
  const trimmedValue =
    value.trim();

  if (!trimmedValue) {
    return null;
  }

  try {
    const url =
      new URL(trimmedValue);

    if (
      url.protocol !== "http:"
      && url.protocol !== "https:"
    ) {
      return null;
    }

    return url.origin
      .toLowerCase();
  } catch {
    return null;
  }
}

function getOriginFromReferer(
  referer: string | null,
): string | null {
  if (!referer) {
    return null;
  }

  return normalizeOrigin(referer);
}

function getConfiguredOrigins():
  string[] {
  const configuredValues = [
    process.env.AUTH_ALLOWED_ORIGINS,
    process.env.NEXT_PUBLIC_SITE_URL,
  ];

  const origins =
    new Set<string>();

  for (const configuredValue of configuredValues) {
    if (!configuredValue) {
      continue;
    }

    for (
      const value
      of configuredValue.split(",")
    ) {
      const normalizedOrigin =
        normalizeOrigin(value);

      if (normalizedOrigin) {
        origins.add(
          normalizedOrigin,
        );
      }
    }
  }

  return [...origins];
}

function getRequestUrlOrigin(
  request: Request,
): string | null {
  try {
    return new URL(
      request.url,
    ).origin.toLowerCase();
  } catch {
    return null;
  }
}

function getForwardedOrigin(
  request: Request,
): string | null {
  const forwardedHost =
    request.headers
      .get("x-forwarded-host")
      ?.split(",", 1)[0]
      ?.trim();

  if (!forwardedHost) {
    return null;
  }

  const forwardedProtocol =
    request.headers
      .get("x-forwarded-proto")
      ?.split(",", 1)[0]
      ?.trim()
      .toLowerCase();

  const protocol =
    forwardedProtocol === "https"
      ? "https"
      : forwardedProtocol === "http"
        ? "http"
        : null;

  if (!protocol) {
    return null;
  }

  return normalizeOrigin(
    `${protocol}://${forwardedHost}`,
  );
}

function createAllowedOriginSet(
  request: Request,
  additionalOrigins:
    readonly string[],
): Set<string> {
  const origins =
    new Set<string>();

  const requestOrigin =
    getRequestUrlOrigin(request);

  if (requestOrigin) {
    origins.add(requestOrigin);
  }

  const forwardedOrigin =
    getForwardedOrigin(request);

  if (forwardedOrigin) {
    origins.add(forwardedOrigin);
  }

  for (
    const configuredOrigin
    of getConfiguredOrigins()
  ) {
    origins.add(configuredOrigin);
  }

  for (
    const additionalOrigin
    of additionalOrigins
  ) {
    const normalizedOrigin =
      normalizeOrigin(
        additionalOrigin,
      );

    if (!normalizedOrigin) {
      throw new Error(
        `El origen permitido "${additionalOrigin}" no es válido.`,
      );
    }

    origins.add(normalizedOrigin);
  }

  return origins;
}

export function isSafeHttpMethod(
  method: string,
): boolean {
  return SAFE_HTTP_METHODS.has(
    method.trim().toUpperCase(),
  );
}

export function verifyRequestOrigin(
  request: Request,
  options:
    VerifyRequestOriginOptions = {},
): string | null {
  const method =
    request.method
      .trim()
      .toUpperCase();

  const allowSafeMethods =
    options.allowSafeMethods
    ?? true;

  if (
    allowSafeMethods
    && isSafeHttpMethod(method)
  ) {
    return null;
  }

  const requireOrigin =
    options.requireOrigin
    ?? true;

  const originHeader =
    request.headers.get(
      "origin",
    );

  const normalizedOrigin =
    originHeader
      ? normalizeOrigin(
          originHeader,
        )
      : getOriginFromReferer(
          request.headers.get(
            "referer",
          ),
        );

  if (!normalizedOrigin) {
    if (!requireOrigin) {
      return null;
    }

    throw new RequestOriginError(
      "No se pudo verificar el origen de la solicitud.",
    );
  }

  const allowedOrigins =
    createAllowedOriginSet(
      request,
      options.allowedOrigins
      ?? [],
    );

  if (
    !allowedOrigins.has(
      normalizedOrigin,
    )
  ) {
    throw new RequestOriginError(
      "El origen de la solicitud no está autorizado.",
    );
  }

  return normalizedOrigin;
}

export function isRequestOriginError(
  error: unknown,
): error is RequestOriginError {
  return (
    error
    instanceof RequestOriginError
  );
}