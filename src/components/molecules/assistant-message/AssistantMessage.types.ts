import type {
  ComponentPropsWithoutRef,
} from "react";

import type {
  AssistantLocale,
  AssistantMessage as AssistantMessageData,
} from "@/types/assistant";

export type AssistantMessageProps =
  Omit<
    ComponentPropsWithoutRef<"article">,
    "children"
  > & {
    message:
      AssistantMessageData;

    locale?:
      AssistantLocale;

    assistantLabel?:
      string;

    userLabel?:
      string;

    sourcesLabel?:
      string;

    sendingLabel?:
      string;

    errorLabel?:
      string;

    toolsLabel?:
      string;

    passwordSuggestionsLabel?:
      string;

    aliasSuggestionsLabel?:
      string;

    copyPasswordLabel?:
      string;

    copyAliasLabel?:
      string;

    copiedLabel?:
      string;

    showTimestamp?:
      boolean;
  };