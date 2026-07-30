"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ArrowUpRight,
  Check,
  CircleAlert,
  Clock3,
  Copy,
} from "lucide-react";

import {
  useReducedMotion,
} from "motion/react";

import {
  AssistantAvatar,
} from "@/components/atoms/assistant-avatar";

import {
  cn,
} from "@/utils/cn";

import type {
  AssistantLocale,
} from "@/types/assistant";

import type {
  AssistantMessageProps,
} from "./AssistantMessage.types";

type MessageLabels = {
  assistant: string;
  user: string;
  sources: string;
  sending: string;
  error: string;
  tools: string;
  passwords: string;
  aliases: string;
  copyPassword: string;
  copyAlias: string;
  copied: string;
};

const MESSAGE_LABELS: Record<
  AssistantLocale,
  MessageLabels
> = {
  es: {
    assistant:
      "Asistente Fixora",

    user:
      "Tú",

    sources:
      "Fuentes relacionadas",

    sending:
      "Enviando...",

    error:
      "No se pudo completar la respuesta",

    tools:
      "Herramientas del asistente",

    passwords:
      "Contraseñas generadas",

    aliases:
      "Nombres sugeridos",

    copyPassword:
      "Copiar contraseña",

    copyAlias:
      "Copiar nombre sugerido",

    copied:
      "Copiado",
  },

  en: {
    assistant:
      "Fixora Assistant",

    user:
      "You",

    sources:
      "Related sources",

    sending:
      "Sending...",

    error:
      "The response could not be completed",

    tools:
      "Assistant tools",

    passwords:
      "Generated passwords",

    aliases:
      "Suggested names",

    copyPassword:
      "Copy password",

    copyAlias:
      "Copy suggested name",

    copied:
      "Copied",
  },
};

const TYPE_INTERVAL_MS =
  42;

const MAX_TYPING_DURATION_MS =
  4_000;

const COPY_CONFIRMATION_DURATION_MS =
  1_500;

function formatMessageTime(
  timestamp: number,
  locale: AssistantLocale,
): string {
  const date =
    new Date(
      timestamp,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "";
  }

  return new Intl.DateTimeFormat(
    locale === "es"
      ? "es-PE"
      : "en-US",
    {
      hour:
        "2-digit",

      minute:
        "2-digit",
    },
  ).format(
    date,
  );
}

function getTypingStep(
  contentLength: number,
): number {
  if (
    contentLength <= 0
  ) {
    return 1;
  }

  const maximumIterations =
    Math.max(
      1,
      Math.floor(
        MAX_TYPING_DURATION_MS
        / TYPE_INTERVAL_MS,
      ),
    );

  return Math.max(
    1,
    Math.ceil(
      contentLength
      / maximumIterations,
    ),
  );
}

export function AssistantMessage({
  message,
  locale = "es",
  assistantLabel,
  userLabel,
  sourcesLabel,
  sendingLabel,
  errorLabel,
  toolsLabel,
  passwordSuggestionsLabel,
  aliasSuggestionsLabel,
  copyPasswordLabel,
  copyAliasLabel,
  copiedLabel,
  showTimestamp = true,
  className,
  ...articleProperties
}: AssistantMessageProps) {
  const prefersReducedMotion =
    useReducedMotion();

  const defaultLabels =
    MESSAGE_LABELS[
      locale
    ];

  const isAssistant =
    message.role
    === "assistant";

  const isSending =
    message.status
    === "sending";

  const isError =
    message.status
    === "error";

  /*
   * Los mensajes escritos por el usuario
   * permanecen exactamente como fueron enviados.
   *
   * Los mensajes del asistente pueden cambiar
   * entre español e inglés.
   */
  const displayedContent =
    isAssistant
      ? (
          message
            .translations?.[
              locale
            ]
          ?? message.content
        )
      : message.content;

  /*
   * Guarda el contenido con el cual se montó
   * inicialmente el mensaje.
   *
   * Cuando cambia el idioma no se vuelve a
   * ejecutar la animación de escritura.
   */
  const [
    initialTypingContent,
  ] =
    useState<string>(
      () =>
        displayedContent,
    );

  const shouldAnimateText =
    isAssistant
    && !isSending
    && !isError
    && !prefersReducedMotion
    && displayedContent.length > 0
    && displayedContent
      === initialTypingContent;

  const [
    visibleCharacterCount,
    setVisibleCharacterCount,
  ] =
    useState<number>(
      () =>
        shouldAnimateText
          ? 0
          : displayedContent.length,
    );

  const [
    copiedValue,
    setCopiedValue,
  ] =
    useState<
      string | null
    >(
      null,
    );

  const copyResetTimeoutReference =
    useRef<
      number | null
    >(
      null,
    );

  useEffect(
    () => {
      if (
        !shouldAnimateText
        || initialTypingContent.length
          === 0
      ) {
        return undefined;
      }

      const typingStep =
        getTypingStep(
          initialTypingContent.length,
        );

      const intervalIdentifier =
        window.setInterval(
          () => {
            setVisibleCharacterCount(
              (
                currentCount,
              ) => {
                const nextCount =
                  Math.min(
                    initialTypingContent.length,
                    currentCount
                    + typingStep,
                  );

                if (
                  nextCount
                  >= initialTypingContent.length
                ) {
                  window.clearInterval(
                    intervalIdentifier,
                  );
                }

                return nextCount;
              },
            );
          },
          TYPE_INTERVAL_MS,
        );

      return () => {
        window.clearInterval(
          intervalIdentifier,
        );
      };
    },
    [
      initialTypingContent,
      shouldAnimateText,
    ],
  );

  useEffect(
    () => {
      return () => {
        if (
          copyResetTimeoutReference
            .current
          !== null
        ) {
          window.clearTimeout(
            copyResetTimeoutReference
              .current,
          );
        }
      };
    },
    [],
  );

  const visibleContent =
    shouldAnimateText
      ? displayedContent.slice(
          0,
          visibleCharacterCount,
        )
      : displayedContent;

  const isTyping =
    shouldAnimateText
    && visibleCharacterCount
      < displayedContent.length;

  const resolvedAuthorLabel =
    isAssistant
      ? (
          assistantLabel
          ?? defaultLabels
            .assistant
        )
      : (
          userLabel
          ?? defaultLabels
            .user
        );

  const resolvedSourcesLabel =
    sourcesLabel
    ?? defaultLabels.sources;

  const resolvedSendingLabel =
    sendingLabel
    ?? defaultLabels.sending;

  const resolvedErrorLabel =
    errorLabel
    ?? defaultLabels.error;

  const resolvedToolsLabel =
    toolsLabel
    ?? defaultLabels.tools;

  const resolvedPasswordSuggestionsLabel =
    passwordSuggestionsLabel
    ?? defaultLabels.passwords;

  const resolvedAliasSuggestionsLabel =
    aliasSuggestionsLabel
    ?? defaultLabels.aliases;

  const resolvedCopyPasswordLabel =
    copyPasswordLabel
    ?? defaultLabels.copyPassword;

  const resolvedCopyAliasLabel =
    copyAliasLabel
    ?? defaultLabels.copyAlias;

  const resolvedCopiedLabel =
    copiedLabel
    ?? defaultLabels.copied;

  const formattedTime =
    formatMessageTime(
      message.createdAt,
      locale,
    );

  const passwordSuggestions =
    message
      .tools
      ?.passwordSuggestions
    ?? [];

  const aliasSuggestions =
    message
      .tools
      ?.aliasSuggestions
    ?? [];

  const hasAssistantTools =
    passwordSuggestions.length > 0
    || aliasSuggestions.length > 0;

  const handleCopyValue =
    async (
      value: string,
    ): Promise<void> => {
      try {
        if (
          typeof navigator
            .clipboard
            ?.writeText
          !== "function"
        ) {
          return;
        }

        await navigator
          .clipboard
          .writeText(
            value,
          );

        setCopiedValue(
          value,
        );

        if (
          copyResetTimeoutReference
            .current
          !== null
        ) {
          window.clearTimeout(
            copyResetTimeoutReference
              .current,
          );
        }

        copyResetTimeoutReference.current =
          window.setTimeout(
            () => {
              setCopiedValue(
                null,
              );

              copyResetTimeoutReference.current =
                null;
            },
            COPY_CONFIRMATION_DURATION_MS,
          );
      } catch {
        setCopiedValue(
          null,
        );
      }
    };

  return (
    <article
      {...articleProperties}
      data-role={
        message.role
      }
      data-status={
        message.status
      }
      aria-label={
        resolvedAuthorLabel
      }
      className={cn(
        "flex w-full gap-2.5",

        isAssistant
          ? "justify-start"
          : "justify-end",

        className,
      )}
    >
      {isAssistant ? (
        <AssistantAvatar
          size="sm"
          isActive={
            !isError
          }
          decorative
          className="mt-1"
        />
      ) : null}

      <div
        className={cn(
          "flex min-w-0",
          "max-w-[84%]",
          "flex-col",

          "sm:max-w-[78%]",

          isAssistant
            ? "items-start"
            : "items-end",
        )}
      >
        <span
          className={cn(
            "mb-1 px-1",

            "text-[11px]",
            "leading-none",
            "font-semibold",

            isAssistant
              ? [
                  "text-[#656b65]",
                  "dark:text-[#aeb4ae]",
                ]
              : [
                  "text-[#318b22]",
                  "dark:text-[#82d363]",
                ],
          )}
        >
          {
            resolvedAuthorLabel
          }
        </span>

        <div
          className={cn(
            "min-w-0 max-w-full",

            "rounded-2xl",
            "px-3.5 py-3",

            "text-sm leading-6",
            "shadow-sm",

            "transition-[background-color,border-color,color,opacity]",
            "duration-300",

            isAssistant
              ? [
                  "rounded-tl-md",

                  "border border-[#393939]/10",
                  "bg-white",
                  "text-[#303530]",

                  "dark:border-white/10",
                  "dark:bg-[#171b17]",
                  "dark:text-[#edf0ed]",
                ]
              : [
                  "rounded-tr-md",

                  "border border-[#4ead35]/30",
                  "bg-[#4ead35]",
                  "text-[#0c0f0c]",

                  "shadow-[0_8px_22px_rgba(78,173,53,0.18)]",

                  "dark:border-[#63bd3d]/35",
                  "dark:bg-[#57af33]",
                  "dark:text-[#0c0f0c]",

                  "dark:shadow-[0_8px_24px_rgba(87,175,51,0.20)]",
                ],

            isSending
            && "opacity-70",

            isError
            && [
              "border-[#cf3f3f]/25",
              "bg-[#cf3f3f]/[0.07]",
              "text-[#9f2929]",

              "dark:border-[#ef6262]/25",
              "dark:bg-[#ef6262]/[0.09]",
              "dark:text-[#ff9090]",
            ],
          )}
        >
          {isError ? (
            <div
              className={cn(
                "mb-2 flex",
                "items-center gap-1.5",
                "text-xs font-semibold",
              )}
            >
              <CircleAlert
                aria-hidden="true"
                className="size-4 shrink-0"
                strokeWidth={
                  2
                }
              />

              <span>
                {
                  resolvedErrorLabel
                }
              </span>
            </div>
          ) : null}

          <p className="whitespace-pre-wrap break-words">
            {
              visibleContent
            }

            {isTyping ? (
              <span
                aria-hidden="true"
                className={cn(
                  "ml-0.5 inline-block",

                  "h-[1.05em]",
                  "w-[2px]",

                  "translate-y-[2px]",
                  "rounded-full",
                  "bg-current",

                  "animate-pulse",

                  "motion-reduce:hidden",
                )}
              />
            ) : null}
          </p>

          {isSending ? (
            <div
              role="status"
              aria-live="polite"
              className={cn(
                "mt-2 flex",
                "items-center gap-1.5",

                "text-xs",
                "font-medium",
                "opacity-70",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5",
                  "rounded-full",
                  "bg-current",

                  "animate-pulse",

                  "motion-reduce:animate-none",
                )}
              />

              <span>
                {
                  resolvedSendingLabel
                }
              </span>
            </div>
          ) : null}
        </div>

        {isAssistant
        && hasAssistantTools
        && !isTyping ? (
          <section
            aria-label={
              resolvedToolsLabel
            }
          >
            {passwordSuggestions.length
            > 0 ? (
              <div>
                <p>
                  {
                    resolvedPasswordSuggestionsLabel
                  }
                </p>

                <ol>
                  {passwordSuggestions.map(
                    (
                      value,
                      index,
                    ) => {
                      const wasCopied =
                        copiedValue
                        === value;

                      return (
                        <li
                          key={
                            `${value}-${index}`
                          }
                        >
                          <code>
                            {
                              value
                            }
                          </code>

                          {" "}

                          <button
                            type="button"
                            aria-label={
                              wasCopied
                                ? resolvedCopiedLabel
                                : resolvedCopyPasswordLabel
                            }
                            title={
                              wasCopied
                                ? resolvedCopiedLabel
                                : resolvedCopyPasswordLabel
                            }
                            onClick={
                              () => {
                                void handleCopyValue(
                                  value,
                                );
                              }
                            }
                          >
                            {wasCopied ? (
                              <Check
                                aria-hidden="true"
                                size={
                                  16
                                }
                              />
                            ) : (
                              <Copy
                                aria-hidden="true"
                                size={
                                  16
                                }
                              />
                            )}
                          </button>
                        </li>
                      );
                    },
                  )}
                </ol>
              </div>
            ) : null}

            {aliasSuggestions.length
            > 0 ? (
              <div>
                <p>
                  {
                    resolvedAliasSuggestionsLabel
                  }
                </p>

                <ul>
                  {aliasSuggestions.map(
                    (
                      value,
                      index,
                    ) => {
                      const wasCopied =
                        copiedValue
                        === value;

                      return (
                        <li
                          key={
                            `${value}-${index}`
                          }
                        >
                          <code>
                            {
                              value
                            }
                          </code>

                          {" "}

                          <button
                            type="button"
                            aria-label={
                              wasCopied
                                ? resolvedCopiedLabel
                                : resolvedCopyAliasLabel
                            }
                            title={
                              wasCopied
                                ? resolvedCopiedLabel
                                : resolvedCopyAliasLabel
                            }
                            onClick={
                              () => {
                                void handleCopyValue(
                                  value,
                                );
                              }
                            }
                          >
                            {wasCopied ? (
                              <Check
                                aria-hidden="true"
                                size={
                                  16
                                }
                              />
                            ) : (
                              <Copy
                                aria-hidden="true"
                                size={
                                  16
                                }
                              />
                            )}
                          </button>
                        </li>
                      );
                    },
                  )}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        {isAssistant
        && message.sources
        && message.sources.length > 0
        && !isTyping ? (
          <div className="mt-2 w-full px-1">
            <p
              className={cn(
                "mb-1.5",

                "text-[11px]",
                "leading-none",
                "font-semibold",

                "text-[#707670]",
                "dark:text-[#a9afa9]",
              )}
            >
              {
                resolvedSourcesLabel
              }
            </p>

            <div className="flex flex-wrap gap-1.5">
              {message.sources.map(
                (
                  source,
                ) =>
                  source.href ? (
                    <a
                      key={
                        source.id
                      }
                      href={
                        source.href
                      }
                      className={cn(
                        "inline-flex min-w-0",
                        "items-center gap-1",

                        "rounded-full",

                        "border border-[#393939]/10",
                        "bg-[#393939]/[0.04]",
                        "px-2.5 py-1.5",

                        "text-[11px]",
                        "leading-none",
                        "font-medium",

                        "text-[#4b514b]",

                        "transition-[background-color,border-color,color,transform]",
                        "duration-200 ease-out",

                        "hover:border-[#4ead35]/30",
                        "hover:bg-[#4ead35]/10",
                        "hover:text-[#318b22]",

                        "active:scale-[0.97]",

                        "focus-visible:outline-none",
                        "focus-visible:ring-2",
                        "focus-visible:ring-[#4ead35]",
                        "focus-visible:ring-offset-2",
                        "focus-visible:ring-offset-white",

                        "dark:border-white/10",
                        "dark:bg-white/[0.05]",
                        "dark:text-[#c5cac5]",

                        "dark:hover:border-[#63bd3d]/30",
                        "dark:hover:bg-[#63bd3d]/10",
                        "dark:hover:text-[#82d363]",

                        "dark:focus-visible:ring-[#63bd3d]",
                        "dark:focus-visible:ring-offset-[#171b17]",
                      )}
                    >
                      <span className="truncate">
                        {
                          source.title
                        }
                      </span>

                      <ArrowUpRight
                        aria-hidden="true"
                        className="size-3 shrink-0"
                        strokeWidth={
                          2
                        }
                      />
                    </a>
                  ) : (
                    <span
                      key={
                        source.id
                      }
                      className={cn(
                        "inline-flex min-w-0",
                        "items-center",

                        "rounded-full",

                        "border border-[#393939]/10",
                        "bg-[#393939]/[0.04]",
                        "px-2.5 py-1.5",

                        "text-[11px]",
                        "leading-none",
                        "font-medium",

                        "text-[#4b514b]",

                        "dark:border-white/10",
                        "dark:bg-white/[0.05]",
                        "dark:text-[#c5cac5]",
                      )}
                    >
                      <span className="truncate">
                        {
                          source.title
                        }
                      </span>
                    </span>
                  ),
              )}
            </div>
          </div>
        ) : null}

        {showTimestamp
        && formattedTime
        && !isTyping ? (
          <time
            dateTime={
              new Date(
                message.createdAt,
              ).toISOString()
            }
            suppressHydrationWarning
            className={cn(
              "mt-1.5 inline-flex",
              "items-center gap-1 px-1",

              "text-[10px]",
              "leading-none",
              "font-medium",

              "text-[#858b85]",
              "dark:text-[#858c85]",
            )}
          >
            <Clock3
              aria-hidden="true"
              className="size-2.5"
              strokeWidth={
                1.8
              }
            />

            <span
              suppressHydrationWarning
            >
              {
                formattedTime
              }
            </span>
          </time>
        ) : null}
      </div>
    </article>
  );
}