import type {
  ComponentPropsWithoutRef,
  RefObject,
} from "react";

import type {
  AssistantLocale,
  AssistantMessage,
  AssistantPanelCopy,
  AssistantSuggestion,
} from "@/types/assistant";

export type AssistantChatSubmitHandler = (
  message: string,
) => void | Promise<void>;

export type AssistantChatSuggestionHandler = (
  suggestion: AssistantSuggestion,
) => void | Promise<void>;

export type AssistantChatTemplateProps = Omit<
  ComponentPropsWithoutRef<"div">,
  "children"
> & {
  locale: AssistantLocale;

  copy: AssistantPanelCopy;

  messages: readonly AssistantMessage[];

  suggestions: readonly AssistantSuggestion[];

  inputValue: string;

  onInputValueChange: (value: string) => void;

  onSubmitMessage: AssistantChatSubmitHandler;

  onSuggestionSelect: AssistantChatSuggestionHandler;

  isLoading?: boolean;

  error?: string | null;

  disabled?: boolean;

  showSuggestions?: boolean;

  messagesContainerRef?: RefObject<HTMLDivElement | null>;
};