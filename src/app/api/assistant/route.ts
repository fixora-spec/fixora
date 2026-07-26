import { NextResponse } from "next/server";

import {
  ASSISTANT_CONFIG,
  getAssistantCopy,
} from "@/config/assistant.config";

import { buildAssistantContext } from "@/lib/assistant/build-assistant-context";
import { normalizeAssistantText } from "@/lib/assistant/search-assistant-knowledge";

import type {
  AssistantErrorCode,
  AssistantErrorResponse,
  AssistantHistoryMessage,
  AssistantLocale,
  AssistantRequest,
  AssistantResponse,
  AssistantSearchResult,
} from "@/types/assistant";

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isAssistantLocale(
  value: unknown,
): value is AssistantLocale {
  return value === "es" || value === "en";
}

function isAssistantHistoryMessage(
  value: unknown,
): value is AssistantHistoryMessage {
  if (!isRecord(value)) {
    return false;
  }

  return (
    (
      value.role === "user" ||
      value.role === "assistant"
    ) &&
    typeof value.content === "string" &&
    value.content.trim().length > 0
  );
}

function parseAssistantRequest(
  value: unknown,
): AssistantRequest | null {
  if (
    !isRecord(value) ||
    typeof value.message !== "string" ||
    !isAssistantLocale(value.locale)
  ) {
    return null;
  }

  const history = Array.isArray(value.history)
    ? value.history
        .filter(isAssistantHistoryMessage)
        .slice(
          -ASSISTANT_CONFIG.maxHistoryMessages,
        )
    : undefined;

  return {
    message: value.message,
    locale: value.locale,
    history,
  };
}

function createErrorResponse(
  error: string,
  code: AssistantErrorCode,
  status: number,
): NextResponse<AssistantErrorResponse> {
  return NextResponse.json(
    {
      error,
      code,
    },
    {
      status,
    },
  );
}

function isGreeting(
  message: string,
  locale: AssistantLocale,
): boolean {
  const normalizedMessage =
    normalizeAssistantText(message);

  const greetings =
    locale === "es"
      ? [
          "hola",
          "buenos dias",
          "buenas tardes",
          "buenas noches",
          "hola asistente",
          "hola fixora",
        ]
      : [
          "hello",
          "hi",
          "good morning",
          "good afternoon",
          "good evening",
          "hello assistant",
          "hello fixora",
        ];

  return greetings.includes(normalizedMessage);
}

function buildNoInformationMessage(
  locale: AssistantLocale,
): string {
  return locale === "es"
    ? [
        "Todavía no tengo información suficiente para responder esa consulta.",
        "Puedes preguntarme sobre Fixora, recursos gráficos, software y licencias, hardware, servicios técnicos, soporte remoto, planes, promociones, ayuda o contacto.",
      ].join(" ")
    : [
        "I do not have enough information to answer that question yet.",
        "You can ask me about Fixora, graphic resources, software and licenses, hardware, technical services, remote support, plans, promotions, help or contact.",
      ].join(" ");
}

function buildRelatedText(
  results: readonly AssistantSearchResult[],
  locale: AssistantLocale,
): string {
  const relatedTitles = results
    .slice(1, 3)
    .map((result) => result.item.title);

  if (relatedTitles.length === 0) {
    return "";
  }

  const prefix =
    locale === "es"
      ? "También puede interesarte:"
      : "You may also be interested in:";

  return `\n\n${prefix} ${relatedTitles.join(", ")}.`;
}

function buildKnowledgeResponse(
  results: readonly AssistantSearchResult[],
  locale: AssistantLocale,
): string {
  const primaryResult = results[0];

  if (!primaryResult) {
    return buildNoInformationMessage(locale);
  }

  return [
    primaryResult.item.content,
    buildRelatedText(results, locale),
  ].join("");
}

export async function POST(
  request: Request,
): Promise<
  NextResponse<
    AssistantResponse | AssistantErrorResponse
  >
> {
  let requestBody: unknown;

  try {
    requestBody = await request.json();
  } catch {
    return createErrorResponse(
      "La solicitud contiene datos inválidos.",
      "INVALID_REQUEST",
      400,
    );
  }

  const assistantRequest =
    parseAssistantRequest(requestBody);

  if (!assistantRequest) {
    return createErrorResponse(
      "La solicitud del asistente no es válida.",
      "INVALID_REQUEST",
      400,
    );
  }

  const message = assistantRequest.message.trim();
  const { locale } = assistantRequest;

  if (!message) {
    return createErrorResponse(
      locale === "es"
        ? "El mensaje no puede estar vacío."
        : "The message cannot be empty.",
      "EMPTY_MESSAGE",
      400,
    );
  }

  if (
    message.length >
    ASSISTANT_CONFIG.maxMessageLength
  ) {
    return createErrorResponse(
      locale === "es"
        ? "El mensaje supera el límite permitido."
        : "The message exceeds the allowed limit.",
      "MESSAGE_TOO_LONG",
      413,
    );
  }

  if (isGreeting(message, locale)) {
    const copy = getAssistantCopy(locale);

    return NextResponse.json({
      message: copy.greeting,
      sources: [],
    } satisfies AssistantResponse);
  }

  try {
    const assistantContext =
      buildAssistantContext({
        message,
        locale,
      });

    if (!assistantContext.hasResults) {
      return NextResponse.json({
        message:
          buildNoInformationMessage(locale),
        sources: [],
      } satisfies AssistantResponse);
    }

    return NextResponse.json({
      message: buildKnowledgeResponse(
        assistantContext.results,
        locale,
      ),
      sources: assistantContext.sources,
    } satisfies AssistantResponse);
  } catch {
    return createErrorResponse(
      locale === "es"
        ? "Ocurrió un error al procesar la consulta."
        : "An error occurred while processing the request.",
      "INTERNAL_ERROR",
      500,
    );
  }
}

export function GET(): NextResponse<{
  name: string;
  status: "available";
}> {
  return NextResponse.json({
    name: ASSISTANT_CONFIG.name,
    status: "available",
  });
}