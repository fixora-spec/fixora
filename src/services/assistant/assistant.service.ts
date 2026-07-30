import {
  ASSISTANT_CONFIG,
} from "@/config/assistant.config";

import type {
  AssistantAuthAction,
  AssistantErrorCode,
  AssistantErrorResponse,
  AssistantKnowledgeSection,
  AssistantRequest,
  AssistantResponse,
  AssistantSource,
  AssistantToolPayload,
  AssistantTranslations,
} from "@/types/assistant";

const DEFAULT_ERROR_MESSAGE =
  "No fue posible procesar la solicitud del asistente.";

const ASSISTANT_ERROR_CODES:
  readonly AssistantErrorCode[] = [
    "INVALID_REQUEST",
    "EMPTY_MESSAGE",
    "MESSAGE_TOO_LONG",
    "NO_INFORMATION",
    "NETWORK_ERROR",
    "INTERNAL_ERROR",
  ];

const ASSISTANT_KNOWLEDGE_SECTIONS:
  readonly AssistantKnowledgeSection[] = [
    "general",
    "about",
    "graphic-resources",
    "software-licenses",
    "hardware",
    "technical-services",
    "remote-support",
    "plans-promotions",
    "help-center",
    "contact",
  ];

const ASSISTANT_AUTH_ACTIONS:
  readonly AssistantAuthAction[] = [
    "NONE",
    "ASK_PASSWORD_LENGTH",
    "SHOW_GENERATED_PASSWORDS",
    "OPEN_USER_SIGN_IN",
    "OPEN_USER_REGISTRATION",
    "OPEN_EMAIL_VERIFICATION",
    "OPEN_PASSWORD_RECOVERY",
    "OPEN_PASSWORD_RESET",
    "OPEN_ADMIN_SIGN_IN",
    "CHECK_USERNAME_AVAILABILITY",
    "REQUEST_USERNAME_FOR_SUGGESTIONS",
  ];

export class AssistantServiceError extends Error {
  readonly code:
    AssistantErrorCode;

  readonly status?:
    number;

  constructor(
    message: string,
    code: AssistantErrorCode,
    status?: number,
  ) {
    super(
      message,
    );

    this.name =
      "AssistantServiceError";

    this.code =
      code;

    this.status =
      status;

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
    typeof value === "object"
    && value !== null
    && !Array.isArray(value)
  );
}

function isAssistantErrorCode(
  value: unknown,
): value is AssistantErrorCode {
  return (
    typeof value === "string"
    && ASSISTANT_ERROR_CODES.includes(
      value as AssistantErrorCode,
    )
  );
}

function isAssistantKnowledgeSection(
  value: unknown,
): value is AssistantKnowledgeSection {
  return (
    typeof value === "string"
    && ASSISTANT_KNOWLEDGE_SECTIONS.includes(
      value as AssistantKnowledgeSection,
    )
  );
}

function isAssistantTranslations(
  value: unknown,
): value is AssistantTranslations {
  if (
    !isRecord(
      value,
    )
  ) {
    return false;
  }

  return (
    typeof value.es === "string"
    && value.es.trim().length > 0
    && typeof value.en === "string"
    && value.en.trim().length > 0
  );
}

function isAssistantSource(
  value: unknown,
): value is AssistantSource {
  if (
    !isRecord(
      value,
    )
  ) {
    return false;
  }

  const hasValidHref =
    value.href === undefined
    || typeof value.href === "string";

  return (
    typeof value.id === "string"
    && typeof value.title === "string"
    && isAssistantKnowledgeSection(
      value.section,
    )
    && hasValidHref
  );
}

function isAssistantAuthAction(
  value: unknown,
): value is AssistantAuthAction {
  return (
    typeof value === "string"
    && ASSISTANT_AUTH_ACTIONS.includes(
      value as AssistantAuthAction,
    )
  );
}

function isStringArray(
  value: unknown,
): value is readonly string[] {
  return (
    Array.isArray(
      value,
    )
    && value.every(
      (
        item,
      ) =>
        typeof item === "string"
        && item.length > 0,
    )
  );
}

function isAssistantToolPayload(
  value: unknown,
): value is AssistantToolPayload {
  if (
    !isRecord(
      value,
    )
  ) {
    return false;
  }

  const validPasswords =
    value.passwordSuggestions === undefined
    || isStringArray(
      value.passwordSuggestions,
    );

  const validAliases =
    value.aliasSuggestions === undefined
    || isStringArray(
      value.aliasSuggestions,
    );

  const validAction =
    value.authAction === undefined
    || isAssistantAuthAction(
      value.authAction,
    );

  const validRequiresUserInput =
    value.requiresUserInput === undefined
    || typeof value.requiresUserInput
      === "boolean";

  const validPasswordLength =
    value.passwordLength === undefined
    || (
      typeof value.passwordLength === "number"
      && Number.isInteger(
        value.passwordLength,
      )
      && value.passwordLength >= 8
      && value.passwordLength <= 30
    );

  return (
    validPasswords
    && validAliases
    && validAction
    && validRequiresUserInput
    && validPasswordLength
  );
}

function isAssistantResponse(
  value: unknown,
): value is AssistantResponse {
  if (
    !isRecord(
      value,
    )
  ) {
    return false;
  }

  const hasValidTools =
    value.tools === undefined
    || isAssistantToolPayload(
      value.tools,
    );

  return (
    typeof value.message === "string"
    && value.message.trim().length > 0
    && isAssistantTranslations(
      value.translations,
    )
    && Array.isArray(
      value.sources,
    )
    && value.sources.every(
      isAssistantSource,
    )
    && hasValidTools
  );
}

function isAssistantErrorResponse(
  value: unknown,
): value is AssistantErrorResponse {
  if (
    !isRecord(
      value,
    )
  ) {
    return false;
  }

  return (
    typeof value.error === "string"
    && isAssistantErrorCode(
      value.code,
    )
  );
}

async function parseResponseBody(
  response: Response,
): Promise<unknown> {
  const contentType =
    response.headers.get(
      "content-type",
    ) ?? "";

  if (
    !contentType.includes(
      "application/json",
    )
  ) {
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
  const message =
    request.message.trim();

  if (
    message.length === 0
  ) {
    throw new AssistantServiceError(
      "El mensaje no puede estar vacío.",
      "EMPTY_MESSAGE",
    );
  }

  if (
    message.length
    > ASSISTANT_CONFIG.maxMessageLength
  ) {
    throw new AssistantServiceError(
      "El mensaje supera el límite permitido.",
      "MESSAGE_TOO_LONG",
    );
  }

  return {
    ...request,

    message,

    history:
      request.history?.slice(
        -ASSISTANT_CONFIG
          .maxHistoryMessages,
      ),
  };
}

export async function requestAssistantResponse(
  request: AssistantRequest,
  signal?: AbortSignal,
): Promise<AssistantResponse> {
  const validatedRequest =
    validateAssistantRequest(
      request,
    );

  let response:
    Response;

  try {
    response =
      await fetch(
        ASSISTANT_CONFIG.apiEndpoint,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",

            Accept:
              "application/json",
          },

          body:
            JSON.stringify(
              validatedRequest,
            ),

          signal,
        },
      );
  } catch (error) {
    if (
      error instanceof DOMException
      && error.name === "AbortError"
    ) {
      throw error;
    }

    throw new AssistantServiceError(
      request.locale === "es"
        ? "No se pudo conectar con el asistente."
        : "Unable to connect to the assistant.",

      "NETWORK_ERROR",
    );
  }

  const responseBody =
    await parseResponseBody(
      response,
    );

  if (
    !response.ok
  ) {
    if (
      isAssistantErrorResponse(
        responseBody,
      )
    ) {
      throw new AssistantServiceError(
        responseBody.error,
        responseBody.code,
        response.status,
      );
    }

    throw new AssistantServiceError(
      request.locale === "es"
        ? DEFAULT_ERROR_MESSAGE
        : "The assistant request could not be processed.",

      "INTERNAL_ERROR",
      response.status,
    );
  }

  if (
    !isAssistantResponse(
      responseBody,
    )
  ) {
    throw new AssistantServiceError(
      request.locale === "es"
        ? "El asistente devolvió una respuesta inválida."
        : "The assistant returned an invalid response.",

      "INTERNAL_ERROR",
      response.status,
    );
  }

  return responseBody;
}