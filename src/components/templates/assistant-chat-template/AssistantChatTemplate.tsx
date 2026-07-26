"use client";

import {
  useEffect,
  useRef,
} from "react";

import {
  CircleAlert,
  MessagesSquare,
  Sparkles,
} from "lucide-react";

import { AssistantAvatar } from "@/components/atoms/assistant-avatar";
import { AssistantStatus } from "@/components/atoms/assistant-status";
import { AssistantInput } from "@/components/molecules/assistant-input";

import {
  AssistantMessage as AssistantMessageBubble,
} from "@/components/molecules/assistant-message";

import { AssistantSuggestion } from "@/components/molecules/assistant-suggestion";

import { ASSISTANT_CONFIG } from "@/config/assistant.config";
import { cn } from "@/utils/cn";

import type {
  AssistantMessage,
  AssistantSuggestion as AssistantSuggestionData,
} from "@/types/assistant";

import type { AssistantChatTemplateProps } from "./AssistantChatTemplate.types";

export function AssistantChatTemplate({
  locale,
  copy,
  messages,
  suggestions,
  inputValue,
  onInputValueChange,
  onSubmitMessage,
  onSuggestionSelect,
  isLoading = false,
  error = null,
  disabled = false,
  showSuggestions = true,
  messagesContainerRef,
  className,
  ...divProps
}: AssistantChatTemplateProps) {
  const internalMessagesContainerRef =
    useRef<HTMLDivElement | null>(null);

  const resolvedMessagesContainerRef =
    messagesContainerRef ??
    internalMessagesContainerRef;

  const hasMessages = messages.length > 0;

  const shouldShowSuggestions =
    showSuggestions &&
    !hasMessages &&
    suggestions.length > 0;

  useEffect(() => {
    const container =
      resolvedMessagesContainerRef.current;

    if (!container) {
      return;
    }

    const animationFrame =
      window.requestAnimationFrame(() => {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: hasMessages
            ? "smooth"
            : "auto",
        });
      });

    return () => {
      window.cancelAnimationFrame(
        animationFrame,
      );
    };
  }, [
    hasMessages,
    isLoading,
    messages,
    resolvedMessagesContainerRef,
  ]);

  const handleSubmitMessage = (
    message: string,
  ): void => {
    void onSubmitMessage(message);
  };

  const handleSuggestionSelect = (
    suggestion: AssistantSuggestionData,
  ): void => {
    void onSuggestionSelect(suggestion);
  };

  const greetingMessage: AssistantMessage = {
    id: "fixora-assistant-greeting",
    role: "assistant",
    content: copy.greeting,
    createdAt: 0,
    status: "completed",
  };

  return (
    <div
      {...divProps}
      className={cn(
        "flex min-h-0 w-full flex-1 flex-col",
        "overflow-hidden",
        className,
      )}
    >
      <div
        ref={resolvedMessagesContainerRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-label={copy.title}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto",
          "overscroll-contain",
          "px-3 py-4",
          "sm:px-4",

          "[scrollbar-width:thin]",
          "[scrollbar-color:rgba(57,57,57,0.18)_transparent]",

          "dark:[scrollbar-color:rgba(255,255,255,0.14)_transparent]",
        )}
      >
        {!hasMessages ? (
          <div className="flex min-h-full flex-col">
            <div
              className={cn(
                "mx-auto flex w-full max-w-sm",
                "flex-1 flex-col items-center",
                "justify-center text-center",
                "px-2 py-5",
              )}
            >
              <div
                className={cn(
                  "relative mb-4",
                  "flex size-16 items-center justify-center",
                  "rounded-[1.4rem]",

                  "border border-[#4ead35]/25",
                  "bg-[#4ead35]/10",
                  "text-[#318b22]",

                  "shadow-[0_14px_36px_rgba(78,173,53,0.14)]",

                  "dark:border-[#63bd3d]/25",
                  "dark:bg-[#63bd3d]/10",
                  "dark:text-[#82d363]",

                  "dark:shadow-[0_16px_40px_rgba(87,175,51,0.12)]",
                )}
              >
                <MessagesSquare
                  aria-hidden="true"
                  className="size-7"
                  strokeWidth={1.8}
                />

                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute -top-1.5 -right-1.5",
                    "flex size-7 items-center justify-center",
                    "rounded-full",

                    "border-2 border-[#fdfefe]",
                    "bg-[#4ead35]",
                    "text-[#0c0f0c]",

                    "dark:border-[#0c0f0c]",
                    "dark:bg-[#57af33]",
                  )}
                >
                  <Sparkles
                    aria-hidden="true"
                    className="size-3.5"
                    strokeWidth={2}
                  />
                </span>
              </div>

              <h2
                className={cn(
                  "text-lg leading-tight font-bold",
                  "tracking-[-0.025em]",
                  "text-[#252925]",
                  "dark:text-[#f1f3f1]",
                )}
              >
                {copy.emptyTitle}
              </h2>

              <p
                className={cn(
                  "mt-2 max-w-[30rem]",
                  "text-sm leading-6",
                  "text-[#686e68]",
                  "dark:text-[#aeb4ae]",
                )}
              >
                {copy.emptyDescription}
              </p>

              <div className="mt-5 w-full text-left">
                <AssistantMessageBubble
                  message={greetingMessage}
                  locale={locale}
                  showTimestamp={false}
                />
              </div>

              {shouldShowSuggestions ? (
                <div
                  aria-label={
                    copy.emptyDescription
                  }
                  className={cn(
                    "mt-5 grid w-full",
                    "grid-cols-1 gap-2",
                    "sm:grid-cols-2",
                  )}
                >
                  {suggestions.map(
                    (suggestion) => (
                      <AssistantSuggestion
                        key={suggestion.id}
                        suggestion={suggestion}
                        disabled={
                          disabled ||
                          isLoading
                        }
                        onSuggestionSelect={
                          handleSuggestionSelect
                        }
                        className="w-full"
                      />
                    ),
                  )}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((message) => (
              <AssistantMessageBubble
                key={message.id}
                message={message}
                locale={locale}
              />
            ))}

            {isLoading ? (
              <div
                role="status"
                aria-live="polite"
                className="flex items-start gap-2.5"
              >
                <AssistantAvatar
                  size="sm"
                  decorative
                  className="mt-1"
                />

                <div
                  className={cn(
                    "rounded-2xl rounded-tl-md",

                    "border border-[#393939]/10",
                    "bg-white",
                    "px-3.5 py-3",

                    "shadow-sm",

                    "dark:border-white/10",
                    "dark:bg-[#171b17]",
                  )}
                >
                  <AssistantStatus
                    status="thinking"
                    size="sm"
                    label={copy.loadingLabel}
                  />
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div
        className={cn(
          "shrink-0",

          "border-t border-[#393939]/10",
          "bg-[#fdfefe]/95",
          "px-3 pt-3 pb-3",

          "supports-[backdrop-filter]:bg-[#fdfefe]/85",
          "supports-[backdrop-filter]:backdrop-blur-xl",

          "dark:border-white/10",
          "dark:bg-[#0f130f]/95",

          "dark:supports-[backdrop-filter]:bg-[#0f130f]/85",

          "sm:px-4 sm:pb-4",
        )}
      >
        {error ? (
          <div
            role="alert"
            className={cn(
              "mb-2.5 flex items-start gap-2",
              "rounded-xl",

              "border border-[#cf3f3f]/20",
              "bg-[#cf3f3f]/[0.07]",
              "px-3 py-2.5",

              "text-xs leading-5 font-medium",
              "text-[#a32e2e]",

              "dark:border-[#ef6262]/20",
              "dark:bg-[#ef6262]/[0.08]",
              "dark:text-[#ff8b8b]",
            )}
          >
            <CircleAlert
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
              strokeWidth={2}
            />

            <span className="min-w-0">
              {error}
            </span>
          </div>
        ) : null}

        <AssistantInput
          value={inputValue}
          onValueChange={onInputValueChange}
          onSubmitMessage={
            handleSubmitMessage
          }
          placeholder={
            copy.inputPlaceholder
          }
          sendLabel={copy.sendLabel}
          maxLength={
            ASSISTANT_CONFIG.maxMessageLength
          }
          isLoading={isLoading}
          disabled={disabled}
          showCharacterCount
        />

        <p
          className={cn(
            "mt-2 px-2 text-center",
            "text-[10px] leading-4",
            "text-[#858b85]",
            "dark:text-[#858c85]",
          )}
        >
          {locale === "es"
            ? "El asistente responde con la información disponible en Fixora."
            : "The assistant responds using the information available on Fixora."}
        </p>
      </div>
    </div>
  );
}