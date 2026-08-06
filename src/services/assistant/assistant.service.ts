import {
  ASSISTANT_CONFIG,
} from "@/config/assistant.config";

import type {
  AssistantAuthAction,
  AssistantErrorCode,
  AssistantErrorResponse,
  AssistantHistoryMessage,
  AssistantKnowledgeSection,
  AssistantLocale,
  AssistantRequest,
  AssistantResponse,
  AssistantSource,
  AssistantToolPayload,
  AssistantTranslations,
} from "@/types/assistant";

const DEFAULT_ERROR_MESSAGE =
  "No fue posible procesar la solicitud del asistente.";

const ASSISTANT_REQUEST_TIMEOUT_MILLISECONDS = 30_000;
const ASSISTANT_MAXIMUM_RESPONSE_BYTES = 256 * 1024;
const ASSISTANT_MAXIMUM_RESPONSE_TEXT_LENGTH = 20_000;
const ASSISTANT_MAXIMUM_ERROR_LENGTH = 1_000;
const ASSISTANT_MAXIMUM_SOURCE_TITLE_LENGTH = 300;
const ASSISTANT_MAXIMUM_SOURCE_ID_LENGTH = 200;
const ASSISTANT_MAXIMUM_SOURCE_HREF_LENGTH = 2_048;
const ASSISTANT_MAXIMUM_TOOL_ITEMS = 5;

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
    super(message);

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

function hasForbiddenControlCharacters(value: string): boolean {
  return /[\0]/u.test(value);
}

function isAssistantLocale(
  value: unknown,
): value is AssistantLocale {
  return value === "es" || value === "en";
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

function isBoundedText(
  value: unknown,
  maximumLength: number,
): value is string {
  return (
    typeof value === "string"
    && value.trim().length > 0
    && value.length <= maximumLength
    && !hasForbiddenControlCharacters(value)
  );
}

function isAssistantTranslations(
  value: unknown,
): value is AssistantTranslations {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isBoundedText(
      value.es,
      ASSISTANT_MAXIMUM_RESPONSE_TEXT_LENGTH,
    )
    && isBoundedText(
      value.en,
      ASSISTANT_MAXIMUM_RESPONSE_TEXT_LENGTH,
    )
  );
}

function isSafeInternalHref(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  return (
    value.length > 0
    && value.length <= ASSISTANT_MAXIMUM_SOURCE_HREF_LENGTH
    && value.startsWith("/")
    && !value.startsWith("//")
    && !value.includes("\\")
    && !/[\r\n\0]/u.test(value)
  );
}

function isAssistantSource(
  value: unknown,
): value is AssistantSource {
  if (!isRecord(value)) {
    return false;
  }

  const hasValidHref =
    value.href === undefined
    || isSafeInternalHref(value.href);

  return (
    isBoundedText(
      value.id,
      ASSISTANT_MAXIMUM_SOURCE_ID_LENGTH,
    )
    && isBoundedText(
      value.title,
      ASSISTANT_MAXIMUM_SOURCE_TITLE_LENGTH,
    )
    && isAssistantKnowledgeSection(value.section)
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
  maximumItemLength: number,
): value is readonly string[] {
  return (
    Array.isArray(value)
    && value.length <= ASSISTANT_MAXIMUM_TOOL_ITEMS
    && value.every((item) =>
      isBoundedText(item, maximumItemLength),
    )
  );
}

function isAssistantToolPayload(
  value: unknown,
): value is AssistantToolPayload {
  if (!isRecord(value)) {
    return false;
  }

  const validPasswords =
    value.passwordSuggestions === undefined
    || isStringArray(value.passwordSuggestions, 30);

  const validAliases =
    value.aliasSuggestions === undefined
    || isStringArray(value.aliasSuggestions, 40);

  const validAction =
    value.authAction === undefined
    || isAssistantAuthAction(value.authAction);

  const validRequiresUserInput =
    value.requiresUserInput === undefined
    || typeof value.requiresUserInput === "boolean";

  const validPasswordLength =
    value.passwordLength === undefined
    || (
      typeof value.passwordLength === "number"
      && Number.isInteger(value.passwordLength)
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
  if (!isRecord(value)) {
    return false;
  }

  const hasValidTools =
    value.tools === undefined
    || isAssistantToolPayload(value.tools);

  return (
    isBoundedText(
      value.message,
      ASSISTANT_MAXIMUM_RESPONSE_TEXT_LENGTH,
    )
    && isAssistantTranslations(value.translations)
    && Array.isArray(value.sources)
    && value.sources.length <= ASSISTANT_CONFIG.maxKnowledgeResults
    && value.sources.every(isAssistantSource)
    && hasValidTools
  );
}

function isAssistantErrorResponse(
  value: unknown,
): value is AssistantErrorResponse {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isBoundedText(value.error, ASSISTANT_MAXIMUM_ERROR_LENGTH)
    && isAssistantErrorCode(value.code)
  );
}

function isJsonContentType(value: string | null): boolean {
  if (!value) {
    return false;
  }

  const mediaType = value
    .split(";", 1)[0]
    ?.trim()
    .toLowerCase();

  return (
    mediaType === "application/json"
    || mediaType?.endsWith("+json") === true
  );
}

function readResponseContentLength(response: Response): number | null {
  const value = response.headers.get("content-length")?.trim();

  if (!value) {
    return null;
  }

  if (!/^\d+$/u.test(value)) {
    return null;
  }

  const parsedValue = Number.parseInt(value, 10);

  return Number.isSafeInteger(parsedValue)
    ? parsedValue
    : null;
}

async function cancelResponseReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    // La conexión puede haber terminado antes de cancelar la lectura.
  }
}

async function readResponseBodyWithLimit(
  response: Response,
  locale: AssistantLocale,
): Promise<Uint8Array | null> {
  const declaredLength = readResponseContentLength(response);

  if (
    declaredLength !== null
    && declaredLength > ASSISTANT_MAXIMUM_RESPONSE_BYTES
  ) {
    throw new AssistantServiceError(
      locale === "es"
        ? "El asistente devolvió una respuesta demasiado grande."
        : "The assistant returned a response that was too large.",
      "INTERNAL_ERROR",
      response.status,
    );
  }

  if (!response.body) {
    return null;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const result = await reader.read();

      if (result.done) {
        break;
      }

      const chunk = result.value;

      if (chunk.byteLength > ASSISTANT_MAXIMUM_RESPONSE_BYTES - totalBytes) {
        await cancelResponseReader(reader);

        throw new AssistantServiceError(
          locale === "es"
            ? "El asistente devolvió una respuesta demasiado grande."
            : "The assistant returned a response that was too large.",
          "INTERNAL_ERROR",
          response.status,
        );
      }

      chunks.push(chunk);
      totalBytes += chunk.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return body;
}

async function parseResponseBody(
  response: Response,
  locale: AssistantLocale,
): Promise<unknown> {
  if (!isJsonContentType(response.headers.get("content-type"))) {
    return null;
  }

  const body = await readResponseBodyWithLimit(response, locale);

  if (!body || body.byteLength === 0) {
    return null;
  }

  let text: string;

  try {
    text = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    }).decode(body);
  } catch {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function validateHistoryMessage(
  value: AssistantHistoryMessage,
): AssistantHistoryMessage {
  if (
    (value.role !== "user" && value.role !== "assistant")
    || typeof value.content !== "string"
  ) {
    throw new AssistantServiceError(
      "El historial del asistente no es válido.",
      "INVALID_REQUEST",
    );
  }

  const content = value.content.trim();

  if (
    content.length === 0
    || content.length > ASSISTANT_CONFIG.maxHistoryMessageLength
    || hasForbiddenControlCharacters(content)
  ) {
    throw new AssistantServiceError(
      "El historial del asistente no es válido.",
      "INVALID_REQUEST",
    );
  }

  return {
    role: value.role,
    content,
  };
}

function validateAssistantRequest(
  request: AssistantRequest,
): AssistantRequest {
  if (
    !isAssistantLocale(request.locale)
    || typeof request.message !== "string"
  ) {
    throw new AssistantServiceError(
      "La solicitud del asistente no es válida.",
      "INVALID_REQUEST",
    );
  }

  const message = request.message.trim();

  if (message.length === 0) {
    throw new AssistantServiceError(
      request.locale === "es"
        ? "El mensaje no puede estar vacío."
        : "The message cannot be empty.",
      "EMPTY_MESSAGE",
    );
  }

  if (message.length > ASSISTANT_CONFIG.maxMessageLength) {
    throw new AssistantServiceError(
      request.locale === "es"
        ? "El mensaje supera el límite permitido."
        : "The message exceeds the allowed limit.",
      "MESSAGE_TOO_LONG",
    );
  }

  const history = request.history
    ?.slice(-ASSISTANT_CONFIG.maxHistoryMessages)
    .map(validateHistoryMessage);

  return {
    message,
    locale: request.locale,
    ...(history && history.length > 0 ? { history } : {}),
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

type RequestAbortControl = {
  signal: AbortSignal;
  didTimeout: () => boolean;
  cleanup: () => void;
};

function createRequestAbortControl(
  externalSignal?: AbortSignal,
): RequestAbortControl {
  const controller = new AbortController();
  let timedOut = false;

  const abortFromExternalSignal = (): void => {
    controller.abort(externalSignal?.reason);
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener(
        "abort",
        abortFromExternalSignal,
        { once: true },
      );
    }
  }

  const timeoutIdentifier = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ASSISTANT_REQUEST_TIMEOUT_MILLISECONDS);

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      globalThis.clearTimeout(timeoutIdentifier);
      externalSignal?.removeEventListener(
        "abort",
        abortFromExternalSignal,
      );
    },
  };
}

export async function requestAssistantResponse(
  request: AssistantRequest,
  signal?: AbortSignal,
): Promise<AssistantResponse> {
  const validatedRequest = validateAssistantRequest(request);
  const abortControl = createRequestAbortControl(signal);

  try {
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
          signal: abortControl.signal,
          credentials: "same-origin",
          cache: "no-store",
          mode: "same-origin",
          redirect: "error",
          referrerPolicy: "same-origin",
        },
      );
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }

      if (abortControl.didTimeout()) {
        throw new AssistantServiceError(
          request.locale === "es"
            ? "El asistente tardó demasiado en responder. Inténtalo nuevamente."
            : "The assistant took too long to respond. Please try again.",
          "NETWORK_ERROR",
        );
      }

      if (isAbortError(error)) {
        throw error;
      }

      throw new AssistantServiceError(
        request.locale === "es"
          ? "No se pudo conectar con el asistente."
          : "Unable to connect to the assistant.",
        "NETWORK_ERROR",
      );
    }

    let responseBody: unknown;

    try {
      responseBody = await parseResponseBody(
        response,
        request.locale,
      );
    } catch (error) {
      if (error instanceof AssistantServiceError) {
        throw error;
      }

      if (signal?.aborted) {
        throw error;
      }

      if (abortControl.didTimeout()) {
        throw new AssistantServiceError(
          request.locale === "es"
            ? "El asistente tardó demasiado en responder. Inténtalo nuevamente."
            : "The assistant took too long to respond. Please try again.",
          "NETWORK_ERROR",
        );
      }

      if (isAbortError(error)) {
        throw error;
      }

      throw new AssistantServiceError(
        request.locale === "es"
          ? "No se pudo leer la respuesta del asistente."
          : "The assistant response could not be read.",
        "NETWORK_ERROR",
        response.status,
      );
    }

    if (!response.ok) {
      if (isAssistantErrorResponse(responseBody)) {
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

    if (!isAssistantResponse(responseBody)) {
      throw new AssistantServiceError(
        request.locale === "es"
          ? "El asistente devolvió una respuesta inválida."
          : "The assistant returned an invalid response.",
        "INTERNAL_ERROR",
        response.status,
      );
    }

    return responseBody;
  } finally {
    abortControl.cleanup();
  }
}