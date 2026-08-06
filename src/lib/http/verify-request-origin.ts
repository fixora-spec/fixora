import "server-only";

import type {
  AuthErrorCode,
} from "@/types/auth";

export type VerifyRequestOriginOptions = {
  allowedOrigins?: readonly string[];
  requireOrigin?: boolean;
  allowSafeMethods?: boolean;
};

export class RequestOriginError extends Error {
  public readonly code: Extract<AuthErrorCode, "INVALID_ORIGIN">;

  public readonly status: 403;

  public constructor(message: string) {
    super(message);

    this.name = "RequestOriginError";
    this.code = "INVALID_ORIGIN";
    this.status = 403;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const SAFE_HTTP_METHODS = new Set([
  "GET",
  "HEAD",
  "OPTIONS",
]);

const ALLOWED_FETCH_SITES = new Set([
  "same-origin",
  "same-site",
  "none",
]);

function parseHttpUrl(value: string): URL | null {
  const trimmedValue = value.trim();

  if (!trimmedValue || trimmedValue.length > 2_048) {
    return null;
  }

  try {
    const url = new URL(trimmedValue);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    if (url.username || url.password) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

function normalizeStrictOrigin(value: string): string | null {
  const url = parseHttpUrl(value);

  if (!url) {
    return null;
  }

  if (
    url.pathname !== "/"
    || url.search.length > 0
    || url.hash.length > 0
  ) {
    return null;
  }

  return url.origin.toLowerCase();
}

function getOriginFromReferer(referer: string | null): string | null {
  if (!referer) {
    return null;
  }

  const url = parseHttpUrl(referer);

  return url?.origin.toLowerCase() ?? null;
}

function getConfiguredOrigins(): Set<string> {
  const origins = new Set<string>();

  const configuredOriginLists = [
    process.env.AUTH_ALLOWED_ORIGINS,
    process.env.NEXT_PUBLIC_SITE_URL,
  ];

  for (const configuredOrigins of configuredOriginLists) {
    if (!configuredOrigins) {
      continue;
    }

    for (const configuredOrigin of configuredOrigins.split(",")) {
      const normalizedOrigin = normalizeStrictOrigin(configuredOrigin);

      if (!normalizedOrigin) {
        throw new Error(
          "La configuración de orígenes permitidos contiene un valor no válido.",
        );
      }

      origins.add(normalizedOrigin);
    }
  }

  return origins;
}

function getRequestUrlOrigin(request: Request): string | null {
  const url = parseHttpUrl(request.url);

  return url?.origin.toLowerCase() ?? null;
}

function createAllowedOriginSet(
  request: Request,
  additionalOrigins: readonly string[],
): Set<string> {
  const origins = getConfiguredOrigins();

  for (const additionalOrigin of additionalOrigins) {
    const normalizedOrigin = normalizeStrictOrigin(additionalOrigin);

    if (!normalizedOrigin) {
      throw new Error(
        `El origen permitido "${additionalOrigin}" no es válido.`,
      );
    }

    origins.add(normalizedOrigin);
  }

  /*
   * En desarrollo se permite el origen real del servidor local para que
   * Next.js siga funcionando cuando se abre mediante localhost, 127.0.0.1
   * o una dirección de la red local. En producción solo se confía en los
   * orígenes declarados expresamente en la configuración.
   */
  if (process.env.NODE_ENV !== "production") {
    const requestOrigin = getRequestUrlOrigin(request);

    if (requestOrigin) {
      origins.add(requestOrigin);
    }
  }

  if (origins.size === 0) {
    throw new Error(
      "No hay orígenes permitidos configurados para validar la solicitud.",
    );
  }

  return origins;
}

function verifyFetchMetadata(request: Request): void {
  const fetchSite = request.headers
    .get("sec-fetch-site")
    ?.trim()
    .toLowerCase();

  if (!fetchSite) {
    return;
  }

  if (!ALLOWED_FETCH_SITES.has(fetchSite)) {
    throw new RequestOriginError(
      "El origen de la solicitud no está autorizado.",
    );
  }
}

export function isSafeHttpMethod(method: string): boolean {
  return SAFE_HTTP_METHODS.has(method.trim().toUpperCase());
}

export function verifyRequestOrigin(
  request: Request,
  options: VerifyRequestOriginOptions = {},
): string | null {
  const method = request.method.trim().toUpperCase();
  const allowSafeMethods = options.allowSafeMethods ?? true;

  if (allowSafeMethods && isSafeHttpMethod(method)) {
    return null;
  }

  verifyFetchMetadata(request);

  const requireOrigin = options.requireOrigin ?? true;
  const originHeader = request.headers.get("origin");

  const normalizedOrigin = originHeader
    ? normalizeStrictOrigin(originHeader)
    : getOriginFromReferer(request.headers.get("referer"));

  if (!normalizedOrigin) {
    if (!requireOrigin) {
      return null;
    }

    throw new RequestOriginError(
      "No se pudo verificar el origen de la solicitud.",
    );
  }

  const allowedOrigins = createAllowedOriginSet(
    request,
    options.allowedOrigins ?? [],
  );

  if (!allowedOrigins.has(normalizedOrigin)) {
    throw new RequestOriginError(
      "El origen de la solicitud no está autorizado.",
    );
  }

  return normalizedOrigin;
}

export function isRequestOriginError(
  error: unknown,
): error is RequestOriginError {
  return error instanceof RequestOriginError;
}