import { ASSISTANT_CONFIG } from "@/config/assistant.config";
import { ASSISTANT_KNOWLEDGE_EN } from "@/content/assistant/knowledge.en";
import { ASSISTANT_KNOWLEDGE_ES } from "@/content/assistant/knowledge.es";
import { searchAssistantKnowledge } from "@/lib/assistant/search-assistant-knowledge";

import type {
  AssistantKnowledgeItem,
  AssistantLocale,
  AssistantSearchResult,
  AssistantSource,
} from "@/types/assistant";

export type BuildAssistantContextOptions = {
  message: string;
  locale: AssistantLocale;
  limit?: number;
  minimumScore?: number;
};

export type AssistantContextResult = {
  locale: AssistantLocale;
  query: string;
  context: string;
  hasResults: boolean;
  results: readonly AssistantSearchResult[];
  sources: readonly AssistantSource[];
};

export function getAssistantKnowledge(
  locale: AssistantLocale,
): readonly AssistantKnowledgeItem[] {
  return locale === "en"
    ? ASSISTANT_KNOWLEDGE_EN
    : ASSISTANT_KNOWLEDGE_ES;
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

function formatKnowledgeResult(
  result: AssistantSearchResult,
  index: number,
): string {
  const { item } = result;

  const lines = [
    `[${index + 1}] ${item.title}`,
    `Sección: ${item.section}`,
    `Resumen: ${item.summary}`,
    `Información: ${item.content}`,
  ];

  if (item.href) {
    lines.push(`Ruta: ${item.href}`);
  }

  return lines.join("\n");
}

export function buildAssistantContext({
  message,
  locale,
  limit = ASSISTANT_CONFIG.maxKnowledgeResults,
  minimumScore = ASSISTANT_CONFIG.minimumSearchScore,
}: BuildAssistantContextOptions): AssistantContextResult {
  const query = message.trim();
  const knowledge = getAssistantKnowledge(locale);

  const results = searchAssistantKnowledge({
    query,
    knowledge,
    limit,
    minimumScore,
  });

  const sources = results.map(buildSource);

  const context = results
    .map(formatKnowledgeResult)
    .join("\n\n");

  return {
    locale,
    query,
    context,
    hasResults: results.length > 0,
    results,
    sources,
  };
}