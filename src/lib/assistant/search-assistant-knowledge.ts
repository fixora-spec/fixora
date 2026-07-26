import type {
  AssistantKnowledgeItem,
  AssistantSearchResult,
} from "@/types/assistant";

const SEARCH_STOP_WORDS = new Set([
  "a",
  "al",
  "and",
  "are",
  "como",
  "con",
  "cual",
  "cuales",
  "de",
  "del",
  "does",
  "el",
  "en",
  "es",
  "esta",
  "este",
  "fixora",
  "for",
  "funciona",
  "hay",
  "how",
  "i",
  "in",
  "is",
  "la",
  "las",
  "lo",
  "los",
  "me",
  "of",
  "ofrece",
  "para",
  "por",
  "puedo",
  "que",
  "qué",
  "se",
  "sobre",
  "the",
  "tiene",
  "un",
  "una",
  "what",
  "with",
  "y",
]);

const DEFAULT_RESULT_LIMIT = 4;
const DEFAULT_MINIMUM_SCORE = 1;

export type SearchAssistantKnowledgeOptions = {
  query: string;
  knowledge: readonly AssistantKnowledgeItem[];
  limit?: number;
  minimumScore?: number;
};

export function normalizeAssistantText(
  value: string,
): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeAssistantText(
  value: string,
): readonly string[] {
  const normalizedValue = normalizeAssistantText(value);

  if (!normalizedValue) {
    return [];
  }

  return Array.from(
    new Set(
      normalizedValue
        .split(" ")
        .filter(
          (token) =>
            token.length >= 2 &&
            !SEARCH_STOP_WORDS.has(token),
        ),
    ),
  );
}

function getTokenSet(value: string): ReadonlySet<string> {
  return new Set(tokenizeAssistantText(value));
}

function countTokenMatches(
  queryTokens: readonly string[],
  targetTokens: ReadonlySet<string>,
): number {
  return queryTokens.reduce(
    (total, token) =>
      targetTokens.has(token) ? total + 1 : total,
    0,
  );
}

function getMatchedKeywords(
  query: string,
  queryTokens: readonly string[],
  keywords: readonly string[],
): readonly string[] {
  const normalizedQuery = normalizeAssistantText(query);

  return keywords.filter((keyword) => {
    const normalizedKeyword =
      normalizeAssistantText(keyword);

    if (!normalizedKeyword) {
      return false;
    }

    if (
      normalizedKeyword === normalizedQuery ||
      normalizedKeyword.includes(normalizedQuery) ||
      normalizedQuery.includes(normalizedKeyword)
    ) {
      return true;
    }

    const keywordTokens = getTokenSet(keyword);

    return queryTokens.some((token) =>
      keywordTokens.has(token),
    );
  });
}

function calculateKnowledgeScore(
  query: string,
  item: AssistantKnowledgeItem,
): AssistantSearchResult {
  const normalizedQuery = normalizeAssistantText(query);
  const normalizedTitle = normalizeAssistantText(
    item.title,
  );
  const normalizedSummary = normalizeAssistantText(
    item.summary,
  );
  const normalizedContent = normalizeAssistantText(
    item.content,
  );

  const queryTokens = tokenizeAssistantText(query);
  const titleTokens = getTokenSet(item.title);
  const summaryTokens = getTokenSet(item.summary);
  const contentTokens = getTokenSet(item.content);

  const matchedKeywords = getMatchedKeywords(
    query,
    queryTokens,
    item.keywords,
  );

  let score = 0;

  if (normalizedTitle === normalizedQuery) {
    score += 28;
  } else if (
    normalizedQuery &&
    normalizedTitle.includes(normalizedQuery)
  ) {
    score += 16;
  }

  if (
    normalizedQuery &&
    normalizedSummary.includes(normalizedQuery)
  ) {
    score += 10;
  }

  if (
    normalizedQuery &&
    normalizedContent.includes(normalizedQuery)
  ) {
    score += 6;
  }

  score +=
    countTokenMatches(queryTokens, titleTokens) * 5;

  score +=
    countTokenMatches(queryTokens, summaryTokens) * 3;

  score +=
    countTokenMatches(queryTokens, contentTokens) * 1;

  score += matchedKeywords.reduce((total, keyword) => {
    const normalizedKeyword =
      normalizeAssistantText(keyword);

    if (normalizedKeyword === normalizedQuery) {
      return total + 18;
    }

    if (
      normalizedKeyword.includes(normalizedQuery) ||
      normalizedQuery.includes(normalizedKeyword)
    ) {
      return total + 10;
    }

    return total + 5;
  }, 0);

  if (score > 0) {
    score += item.priority * 0.1;
  }

  return {
    item,
    score,
    matchedKeywords,
  };
}

export function searchAssistantKnowledge({
  query,
  knowledge,
  limit = DEFAULT_RESULT_LIMIT,
  minimumScore = DEFAULT_MINIMUM_SCORE,
}: SearchAssistantKnowledgeOptions): readonly AssistantSearchResult[] {
  const normalizedQuery = normalizeAssistantText(query);

  if (!normalizedQuery || limit <= 0) {
    return [];
  }

  return knowledge
    .map((item) =>
      calculateKnowledgeScore(query, item),
    )
    .filter((result) => result.score >= minimumScore)
    .sort((firstResult, secondResult) => {
      if (secondResult.score !== firstResult.score) {
        return secondResult.score - firstResult.score;
      }

      return (
        secondResult.item.priority -
        firstResult.item.priority
      );
    })
    .slice(0, limit);
}