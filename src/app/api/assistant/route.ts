import { NextResponse } from "next/server";

import { ASSISTANT_CONFIG } from "@/config/assistant.config";

import { ASSISTANT_KNOWLEDGE_EN } from "@/content/assistant/knowledge.en";
import { ASSISTANT_KNOWLEDGE_ES } from "@/content/assistant/knowledge.es";

import {
  getConversationalResponse,
} from "@/lib/assistant/get-conversational-response";

import {
  searchAssistantKnowledge,
} from "@/lib/assistant/search-assistant-knowledge";

import type {
  AssistantErrorCode,
  AssistantErrorResponse,
  AssistantHistoryMessage,
  AssistantKnowledgeItem,
  AssistantLocale,
  AssistantRequest,
  AssistantResponse,
  AssistantSearchResult,
  AssistantSource,
  AssistantTranslations,
} from "@/types/assistant";

const ALL_ASSISTANT_KNOWLEDGE:
  readonly AssistantKnowledgeItem[] = [
    ...ASSISTANT_KNOWLEDGE_ES,
    ...ASSISTANT_KNOWLEDGE_EN,
  ];

type LocalizedKnowledgeResult = {
  message: string;
  results: readonly AssistantSearchResult[];
};

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

function getLocalizedKnowledge(
  locale: AssistantLocale,
): readonly AssistantKnowledgeItem[] {
  return locale === "es"
    ? ASSISTANT_KNOWLEDGE_ES
    : ASSISTANT_KNOWLEDGE_EN;
}

function localizeSearchResults(
  results: readonly AssistantSearchResult[],
  locale: AssistantLocale,
): readonly AssistantSearchResult[] {
  const localizedKnowledge =
    getLocalizedKnowledge(locale);

  const localizedResults:
    AssistantSearchResult[] = [];

  const addedSections = new Set<string>();

  for (const result of results) {
    const section = result.item.section;

    if (addedSections.has(section)) {
      continue;
    }

    const localizedItem =
      localizedKnowledge.find(
        (item) =>
          item.section === section,
      );

    if (!localizedItem) {
      continue;
    }

    localizedResults.push({
      item: localizedItem,
      score: result.score,
      matchedKeywords:
        result.matchedKeywords,
    });

    addedSections.add(section);

    if (
      localizedResults.length >=
      ASSISTANT_CONFIG.maxKnowledgeResults
    ) {
      break;
    }
  }

  return localizedResults;
}

function searchBilingualKnowledge(
  message: string,
): readonly AssistantSearchResult[] {
  return searchAssistantKnowledge({
    query: message,
    knowledge:
      ALL_ASSISTANT_KNOWLEDGE,
    limit:
      ASSISTANT_CONFIG.maxKnowledgeResults *
      2,
    minimumScore:
      ASSISTANT_CONFIG.minimumSearchScore,
  });
}

function buildSource(
  result: AssistantSearchResult,
): AssistantSource {
  return {
    id: result.item.id,
    title: result.item.title,
    section: result.item.section,
    href: result.item.href,
  };
}

function buildSources(
  results: readonly AssistantSearchResult[],
): readonly AssistantSource[] {
  return results.map(buildSource);
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
    .map(
      (result) =>
        result.item.title,
    );

  if (relatedTitles.length === 0) {
    return "";
  }

  const prefix =
    locale === "es"
      ? "También puede interesarte:"
      : "You may also be interested in:";

  return `\n\n${prefix} ${relatedTitles.join(", ")}.`;
}

function buildKnowledgeMessage(
  results: readonly AssistantSearchResult[],
  locale: AssistantLocale,
): string {
  const primaryResult = results[0];

  if (!primaryResult) {
    return "";
  }

  return [
    primaryResult.item.content,
    buildRelatedText(
      results,
      locale,
    ),
  ].join("");
}

function combineMessages(
  firstMessage: string,
  secondMessage: string,
): string {
  return [
    firstMessage,
    secondMessage,
  ]
    .filter(
      (message) =>
        message.trim().length > 0,
    )
    .join("\n\n");
}

function buildLocalizedKnowledgeResult(
  searchResults: readonly AssistantSearchResult[],
  locale: AssistantLocale,
): LocalizedKnowledgeResult {
  const localizedResults =
    localizeSearchResults(
      searchResults,
      locale,
    );

  return {
    message: buildKnowledgeMessage(
      localizedResults,
      locale,
    ),
    results: localizedResults,
  };
}

function buildTranslations(
  message: string,
): {
  translations: AssistantTranslations;
  spanishResults:
    readonly AssistantSearchResult[];
  englishResults:
    readonly AssistantSearchResult[];
} {
  const spanishConversation =
    getConversationalResponse(
      message,
      "es",
    );

  const englishConversation =
    getConversationalResponse(
      message,
      "en",
    );

  const shouldSearchKnowledge =
    !spanishConversation ||
    spanishConversation.continueToKnowledge ||
    !englishConversation ||
    englishConversation.continueToKnowledge;

  const bilingualResults =
    shouldSearchKnowledge
      ? searchBilingualKnowledge(message)
      : [];

  const spanishKnowledge =
    buildLocalizedKnowledgeResult(
      bilingualResults,
      "es",
    );

  const englishKnowledge =
    buildLocalizedKnowledgeResult(
      bilingualResults,
      "en",
    );

  const spanishMessage =
    spanishConversation
      ? spanishConversation.continueToKnowledge
        ? combineMessages(
            spanishConversation.message,
            spanishKnowledge.message,
          )
        : spanishConversation.message
      : spanishKnowledge.message;

  const englishMessage =
    englishConversation
      ? englishConversation.continueToKnowledge
        ? combineMessages(
            englishConversation.message,
            englishKnowledge.message,
          )
        : englishConversation.message
      : englishKnowledge.message;

  return {
    translations: {
      es:
        spanishMessage ||
        buildNoInformationMessage("es"),

      en:
        englishMessage ||
        buildNoInformationMessage("en"),
    },

    spanishResults:
      spanishKnowledge.results,

    englishResults:
      englishKnowledge.results,
  };
}

export async function POST(
  request: Request,
): Promise<
  NextResponse<
    AssistantResponse |
    AssistantErrorResponse
  >
> {
  let requestBody: unknown;

  try {
    requestBody =
      await request.json();
  } catch {
    return createErrorResponse(
      "La solicitud contiene datos inválidos.",
      "INVALID_REQUEST",
      400,
    );
  }

  const assistantRequest =
    parseAssistantRequest(
      requestBody,
    );

  if (!assistantRequest) {
    return createErrorResponse(
      "La solicitud del asistente no es válida.",
      "INVALID_REQUEST",
      400,
    );
  }

  const message =
    assistantRequest.message.trim();

  const { locale } =
    assistantRequest;

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

  try {
    const {
      translations,
      spanishResults,
      englishResults,
    } = buildTranslations(message);

    const localizedResults =
      locale === "es"
        ? spanishResults
        : englishResults;

    return NextResponse.json({
      message:
        translations[locale],
      translations,
      sources:
        buildSources(
          localizedResults,
        ),
    } satisfies AssistantResponse);
  } catch {
    return createErrorResponse(
      locale === "es"
        ? "No pude procesar tu consulta. Inténtalo nuevamente."
        : "I could not process your question. Please try again.",
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