import {
  NextResponse,
} from "next/server";

import {
  ASSISTANT_CONFIG,
} from "@/config/assistant.config";

import {
  ASSISTANT_KNOWLEDGE_EN,
} from "@/content/assistant/knowledge.en";

import {
  ASSISTANT_KNOWLEDGE_ES,
} from "@/content/assistant/knowledge.es";

import {
  getAuthAssistanceResponse,
} from "@/lib/assistant/get-auth-assistance-response";

import {
  getConversationalResponse,
} from "@/lib/assistant/get-conversational-response";

import {
  searchAssistantKnowledge,
} from "@/lib/assistant/search-assistant-knowledge";

import type {
  AssistantErrorCode,
  AssistantHistoryMessage,
  AssistantKnowledgeItem,
  AssistantLocale,
  AssistantRequest,
  AssistantResponse,
  AssistantSearchResult,
  AssistantSource,
  AssistantTranslations,
} from "@/types/assistant";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const ALL_ASSISTANT_KNOWLEDGE:
  readonly AssistantKnowledgeItem[] = [
    ...ASSISTANT_KNOWLEDGE_ES,
    ...ASSISTANT_KNOWLEDGE_EN,
  ];

const SENSITIVE_PASSWORD_PATTERN =
  /\b(?:mi\s+)?(?:contrase(?:ñ|n)a|password)\s*(?:es|is|:|=)\s*\S+/iu;

const SENSITIVE_VERIFICATION_CODE_PATTERN =
  /\b(?:c[oó]digo|code|verification\s+code)\s*(?:es|is|:|=)\s*[A-Z0-9]{6}\b/iu;

const SENSITIVE_TOKEN_PATTERN =
  /\b(?:token|bearer|session|sesión|reset\s+token)\s*(?:es|is|:|=)?\s*[A-Za-z0-9._~-]{20,}\b/iu;

const SENSITIVE_PAYMENT_PATTERN =
  /\b(?:cvv|cvc|n[uú]mero\s+de\s+tarjeta|card\s+number)\s*(?:es|is|:|=)\s*\S+/iu;

type JsonRecord =
  Record<
    string,
    unknown
  >;

type LocalizedKnowledgeResult = {
  message:
    string;

  results:
    readonly AssistantSearchResult[];
};

function isRecord(
  value: unknown,
): value is JsonRecord {
  return (
    typeof value === "object"
    && value !== null
    && !Array.isArray(
      value,
    )
  );
}

function isAssistantLocale(
  value: unknown,
): value is AssistantLocale {
  return (
    value === "es"
    || value === "en"
  );
}

function isAssistantHistoryMessage(
  value: unknown,
): value is AssistantHistoryMessage {
  if (
    !isRecord(
      value,
    )
  ) {
    return false;
  }

  const validRole =
    value.role === "user"
    || value.role === "assistant";

  const validContent =
    typeof value.content === "string"
    && value.content.trim().length > 0
    && value.content.trim().length
      <= ASSISTANT_CONFIG.maxMessageLength;

  return (
    validRole
    && validContent
  );
}

async function readJsonBody(
  request: Request,
): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function parseAssistantRequest(
  value: unknown,
): AssistantRequest | null {
  if (
    !isRecord(
      value,
    )
    || typeof value.message
      !== "string"
    || !isAssistantLocale(
      value.locale,
    )
  ) {
    return null;
  }

  const history =
    Array.isArray(
      value.history,
    )
      ? value.history
          .filter(
            isAssistantHistoryMessage,
          )
          .slice(
            -ASSISTANT_CONFIG
              .maxHistoryMessages,
          )
          .map(
            (
              historyMessage,
            ): AssistantHistoryMessage => ({
              role:
                historyMessage.role,

              content:
                historyMessage
                  .content
                  .trim(),
            }),
          )
      : undefined;

  return {
    message:
      value.message,

    locale:
      value.locale,

    history,
  };
}

function createErrorResponse(
  error: string,
  code: AssistantErrorCode,
  status: number,
): NextResponse {
  return NextResponse.json(
    {
      error,
      code,
    },
    {
      status,

      headers: {
        "Cache-Control":
          "no-store",

        Pragma:
          "no-cache",
      },
    },
  );
}

function createSuccessResponse(
  response: AssistantResponse,
): NextResponse {
  return NextResponse.json(
    response,
    {
      status:
        200,

      headers: {
        "Cache-Control":
          "no-store",

        Pragma:
          "no-cache",
      },
    },
  );
}

function containsSensitiveCredentials(
  message: string,
): boolean {
  return (
    SENSITIVE_PASSWORD_PATTERN.test(
      message,
    )
    || SENSITIVE_VERIFICATION_CODE_PATTERN.test(
      message,
    )
    || SENSITIVE_TOKEN_PATTERN.test(
      message,
    )
    || SENSITIVE_PAYMENT_PATTERN.test(
      message,
    )
  );
}

function buildSensitiveInformationResponse(
  locale: AssistantLocale,
): AssistantResponse {
  const translations:
    AssistantTranslations = {
      es:
        "Por seguridad, no envíes contraseñas, códigos de verificación, tokens de sesión ni datos bancarios. Elimina ese dato privado y describe únicamente el problema que necesitas resolver.",

      en:
        "For security, do not send passwords, verification codes, session tokens or banking information. Remove the private information and describe only the problem you need help with.",
  };

  return {
    message:
      translations[
        locale
      ],

    translations,

    sources:
      [],
  };
}

function getLocalizedKnowledge(
  locale: AssistantLocale,
): readonly AssistantKnowledgeItem[] {
  return locale === "es"
    ? ASSISTANT_KNOWLEDGE_ES
    : ASSISTANT_KNOWLEDGE_EN;
}

function localizeSearchResults(
  results:
    readonly AssistantSearchResult[],

  locale:
    AssistantLocale,
): readonly AssistantSearchResult[] {
  const localizedKnowledge =
    getLocalizedKnowledge(
      locale,
    );

  const localizedResults:
    AssistantSearchResult[] = [];

  const addedSections =
    new Set<string>();

  for (
    const result
    of results
  ) {
    const section =
      result.item.section;

    if (
      addedSections.has(
        section,
      )
    ) {
      continue;
    }

    const localizedItem =
      localizedKnowledge.find(
        (
          item,
        ) =>
          item.section
          === section,
      );

    if (
      !localizedItem
    ) {
      continue;
    }

    localizedResults.push({
      item:
        localizedItem,

      score:
        result.score,

      matchedKeywords:
        result.matchedKeywords,
    });

    addedSections.add(
      section,
    );

    if (
      localizedResults.length
      >= ASSISTANT_CONFIG
        .maxKnowledgeResults
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
    query:
      message,

    knowledge:
      ALL_ASSISTANT_KNOWLEDGE,

    limit:
      ASSISTANT_CONFIG
        .maxKnowledgeResults
      * 2,

    minimumScore:
      ASSISTANT_CONFIG
        .minimumSearchScore,
  });
}

function buildSource(
  result: AssistantSearchResult,
): AssistantSource {
  return {
    id:
      result.item.id,

    title:
      result.item.title,

    section:
      result.item.section,

    href:
      result.item.href,
  };
}

function buildSources(
  results:
    readonly AssistantSearchResult[],
): readonly AssistantSource[] {
  return results.map(
    buildSource,
  );
}

function buildNoInformationMessage(
  locale: AssistantLocale,
): string {
  if (
    locale === "es"
  ) {
    return [
      "Todavía no tengo información suficiente para responder esa consulta.",
      "Puedes preguntarme sobre Fixora, recursos gráficos, software, licencias, hardware, servicios técnicos, soporte remoto, planes, promociones, cuentas, autenticación, ayuda o contacto.",
    ].join(" ");
  }

  return [
    "I do not have enough information to answer that question yet.",
    "You can ask me about Fixora, graphic resources, software, licenses, hardware, technical services, remote support, plans, promotions, accounts, authentication, help or contact.",
  ].join(" ");
}

function buildRelatedText(
  results:
    readonly AssistantSearchResult[],

  locale:
    AssistantLocale,
): string {
  const relatedTitles =
    results
      .slice(
        1,
        3,
      )
      .map(
        (
          result,
        ) =>
          result.item.title,
      );

  if (
    relatedTitles.length === 0
  ) {
    return "";
  }

  const prefix =
    locale === "es"
      ? "También puede interesarte:"
      : "You may also be interested in:";

  return `\n\n${prefix} ${relatedTitles.join(
    ", ",
  )}.`;
}

function buildKnowledgeMessage(
  results:
    readonly AssistantSearchResult[],

  locale:
    AssistantLocale,
): string {
  const primaryResult =
    results[0];

  if (
    !primaryResult
  ) {
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
      (
        message,
      ) =>
        message.trim().length > 0,
    )
    .join(
      "\n\n",
    );
}

function buildLocalizedKnowledgeResult(
  searchResults:
    readonly AssistantSearchResult[],

  locale:
    AssistantLocale,
): LocalizedKnowledgeResult {
  const localizedResults =
    localizeSearchResults(
      searchResults,
      locale,
    );

  return {
    message:
      buildKnowledgeMessage(
        localizedResults,
        locale,
      ),

    results:
      localizedResults,
  };
}

function buildGeneratedPasswordMessage(
  locale:
    AssistantLocale,

  passwordLength:
    number,
): string {
  if (
    locale === "es"
  ) {
    return `Generé cinco contraseñas seguras de ${passwordLength} caracteres. Usa el botón de copiar en lugar de escribirlas manualmente. No las almaceno ni las utilizo para iniciar sesión.`;
  }

  return `I generated five secure passwords with ${passwordLength} characters. Use the copy button instead of typing them manually. I do not store them or use them to sign in.`;
}

function buildAuthAssistanceResponse(
  message:
    string,

  locale:
    AssistantLocale,
): AssistantResponse | null {
  const localizedResponse =
    getAuthAssistanceResponse({
      message,
      locale,
    });

  if (
    localizedResponse.intent
    === "UNKNOWN"
  ) {
    return null;
  }

  let spanishMessage:
    string;

  let englishMessage:
    string;

  if (
    localizedResponse.passwords
    && typeof localizedResponse
      .passwordLength === "number"
  ) {
    spanishMessage =
      locale === "es"
        ? localizedResponse.message
        : buildGeneratedPasswordMessage(
            "es",
            localizedResponse
              .passwordLength,
          );

    englishMessage =
      locale === "en"
        ? localizedResponse.message
        : buildGeneratedPasswordMessage(
            "en",
            localizedResponse
              .passwordLength,
          );
  } else {
    const spanishResponse =
      locale === "es"
        ? localizedResponse
        : getAuthAssistanceResponse({
            message,
            locale:
              "es",
          });

    const englishResponse =
      locale === "en"
        ? localizedResponse
        : getAuthAssistanceResponse({
            message,
            locale:
              "en",
          });

    spanishMessage =
      spanishResponse.message;

    englishMessage =
      englishResponse.message;
  }

  const translations:
    AssistantTranslations = {
      es:
        spanishMessage,

      en:
        englishMessage,
  };

  if (
    localizedResponse.passwords
  ) {
    return {
      message:
        translations[
          locale
        ],

      translations,

      sources:
        [],

      tools: {
        passwordSuggestions:
          localizedResponse.passwords,

        authAction:
          "SHOW_GENERATED_PASSWORDS",

        requiresUserInput:
          false,

        passwordLength:
          localizedResponse.passwordLength,
      },
    };
  }

  if (
    localizedResponse.action
    !== "NONE"
  ) {
    return {
      message:
        translations[
          locale
        ],

      translations,

      sources:
        [],

      tools: {
        authAction:
          localizedResponse.action,

        requiresUserInput:
          localizedResponse
            .requiresUserInput,
      },
    };
  }

  return {
    message:
      translations[
        locale
      ],

    translations,

    sources:
      [],
  };
}

function buildTranslations(
  message: string,
): {
  translations:
    AssistantTranslations;

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
    !spanishConversation
    || spanishConversation
      .continueToKnowledge
    || !englishConversation
    || englishConversation
      .continueToKnowledge;

  const bilingualResults =
    shouldSearchKnowledge
      ? searchBilingualKnowledge(
          message,
        )
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
      ? spanishConversation
          .continueToKnowledge
        ? combineMessages(
            spanishConversation
              .message,

            spanishKnowledge
              .message,
          )
        : spanishConversation.message
      : spanishKnowledge.message;

  const englishMessage =
    englishConversation
      ? englishConversation
          .continueToKnowledge
        ? combineMessages(
            englishConversation
              .message,

            englishKnowledge
              .message,
          )
        : englishConversation.message
      : englishKnowledge.message;

  return {
    translations: {
      es:
        spanishMessage
        || buildNoInformationMessage(
          "es",
        ),

      en:
        englishMessage
        || buildNoInformationMessage(
          "en",
        ),
    },

    spanishResults:
      spanishKnowledge.results,

    englishResults:
      englishKnowledge.results,
  };
}

export async function POST(
  request: Request,
): Promise<NextResponse> {
  const requestBody =
    await readJsonBody(
      request,
    );

  if (
    requestBody === null
  ) {
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

  if (
    assistantRequest === null
  ) {
    return createErrorResponse(
      "La solicitud del asistente no es válida.",
      "INVALID_REQUEST",
      400,
    );
  }

  const message =
    assistantRequest
      .message
      .trim();

  const {
    locale,
  } = assistantRequest;

  if (
    message.length === 0
  ) {
    return createErrorResponse(
      locale === "es"
        ? "El mensaje no puede estar vacío."
        : "The message cannot be empty.",

      "EMPTY_MESSAGE",
      400,
    );
  }

  if (
    message.length
    > ASSISTANT_CONFIG
      .maxMessageLength
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
    if (
      containsSensitiveCredentials(
        message,
      )
    ) {
      return createSuccessResponse(
        buildSensitiveInformationResponse(
          locale,
        ),
      );
    }

    const authAssistanceResponse =
      buildAuthAssistanceResponse(
        message,
        locale,
      );

    if (
      authAssistanceResponse
    ) {
      return createSuccessResponse(
        authAssistanceResponse,
      );
    }

    const {
      translations,
      spanishResults,
      englishResults,
    } = buildTranslations(
      message,
    );

    const localizedResults =
      locale === "es"
        ? spanishResults
        : englishResults;

    const response:
      AssistantResponse = {
        message:
          translations[
            locale
          ],

        translations,

        sources:
          buildSources(
            localizedResults,
          ),
    };

    return createSuccessResponse(
      response,
    );
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

export function GET():
  NextResponse {
  return NextResponse.json(
    {
      name:
        ASSISTANT_CONFIG.name,

      status:
        "available",
    },
    {
      status:
        200,

      headers: {
        "Cache-Control":
          "no-store",

        Pragma:
          "no-cache",
      },
    },
  );
}