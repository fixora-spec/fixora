import { ASSISTANT_CONFIG } from "@/config/assistant.config";

import type {
  AssistantErrorCode,
  AssistantErrorResponse,
  AssistantRequest,
  AssistantResponse,
  AssistantSource,
} from "@/types/assistant";

const DEFAULT_ERROR_MESSAGE =
  "No fue posible procesar la solicitud del asistente.";

export class AssistantServiceError extends Error {
  readonly code: AssistantErrorCode;
  readonly status?: number;

  constructor(
    message: string,
    code: AssistantErrorCode,
    status?: number,
  ) {
    super(message);

    this.name = "AssistantServiceError";
    this.code = code;
    this.status = status;

    Object.setPrototypeOf(
      this,
      AssistantServiceError.prototype,
    );
  }
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isAssistantSource(
  value: unknown,
): value is AssistantSource {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.section === "string" &&
    (
      value.href === undefined ||
      typeof value.href === "string"
    )
  );
}

function isAssistantResponse(
  value: unknown,
): value is AssistantResponse {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.message === "string" &&
    Array.isArray(value.sources) &&
    value.sources.every(isAssistantSource)
  );
}

function isAssistantErrorResponse(
  value: unknown,
): value is AssistantErrorResponse {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.error === "string" &&
    typeof value.code === "string"
  );
}

async function parseResponseBody(
  response: Response,
): Promise<unknown> {
  const contentType =
    response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

function validateAssistantRequest(
  request: AssistantRequest,
): AssistantRequest {
  const message = request.message.trim();

  if (!message) {
    throw new AssistantServiceError(
      "El mensaje no puede estar vacío.",
      "EMPTY_MESSAGE",
    );
  }

  if (
    message.length >
    ASSISTANT_CONFIG.maxMessageLength
  ) {
    throw new AssistantServiceError(
      "El mensaje supera el límite permitido.",
      "MESSAGE_TOO_LONG",
    );
  }

  return {
    ...request,
    message,
    history: request.history?.slice(
      -ASSISTANT_CONFIG.maxHistoryMessages,
    ),
  };
}

export async function requestAssistantResponse(
  request: AssistantRequest,
  signal?: AbortSignal,
): Promise<AssistantResponse> {
  const validatedRequest =
    validateAssistantRequest(request);

  let response: Response;

  try {
    response = await fetch(
      ASSISTANT_CONFIG.apiEndpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(validatedRequest),
        signal,
      },
    );
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name === "AbortError"
    ) {
      throw error;
    }

    throw new AssistantServiceError(
      "No se pudo conectar con el asistente.",
      "NETWORK_ERROR",
    );
  }

  const responseBody =
    await parseResponseBody(response);

  if (!response.ok) {
    if (isAssistantErrorResponse(responseBody)) {
      throw new AssistantServiceError(
        responseBody.error,
        responseBody.code,
        response.status,
      );
    }

    throw new AssistantServiceError(
      DEFAULT_ERROR_MESSAGE,
      "INTERNAL_ERROR",
      response.status,
    );
  }

  if (!isAssistantResponse(responseBody)) {
    throw new AssistantServiceError(
      "El asistente devolvió una respuesta inválida.",
      "INTERNAL_ERROR",
      response.status,
    );
  }

  return responseBody;
}