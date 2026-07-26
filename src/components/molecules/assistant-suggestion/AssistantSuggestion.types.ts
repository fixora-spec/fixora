import type {
  ComponentPropsWithoutRef,
} from "react";

import type {
  AssistantSuggestion as AssistantSuggestionData,
} from "@/types/assistant";

export type AssistantSuggestionSelectHandler = (
  suggestion: AssistantSuggestionData,
) => void | Promise<void>;

export type AssistantSuggestionProps = Omit<
  ComponentPropsWithoutRef<"button">,
  "children" | "onClick"
> & {
  suggestion: AssistantSuggestionData;

  onSuggestionSelect:
    AssistantSuggestionSelectHandler;

  compact?: boolean;

  showIcon?: boolean;
};