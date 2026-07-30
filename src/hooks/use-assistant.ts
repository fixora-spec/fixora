"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ASSISTANT_CONFIG,
  getAssistantCopy,
} from "@/config/assistant.config";

import {
  useAuth,
} from "@/providers/auth-provider";

import {
  AssistantServiceError,
  requestAssistantResponse,
} from "@/services/assistant";

import type {
  AssistantAuthAction,
  AssistantMessage,
  AssistantMessageStatus,
  AssistantRole,
  AssistantSource,
  AssistantToolPayload,
  AssistantTranslations,
  SendAssistantMessageOptions,
  UseAssistantReturn,
} from "@/types/assistant";

const ASSISTANT_AUTH_ACTIONS:
  readonly AssistantAuthAction[] = [
    "NONE",
    "ASK_PASSWORD_LENGTH",
    "SHOW_GENERATED_PASSWORDS",
    "OPEN_USER_SIGN_IN",
    "OPEN_USER_REGISTRATION",
    "OPEN_EMAIL_VERIFICATION",
    "OPEN_PASSWORD_RECOVERY",
    "OPEN_PASSWORD_RESET",
    "OPEN_ADMIN_SIGN_IN",
    "CHECK_USERNAME_AVAILABILITY",
    "REQUEST_USERNAME_FOR_SUGGESTIONS",
  ];

function createAssistantMessageId(
  prefix: AssistantRole,
): string {
  if (
    typeof crypto !== "undefined"
    && typeof crypto.randomUUID === "function"
  ) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return [
    prefix,
    Date.now().toString(36),
    Math.random()
      .toString(36)
      .slice(2, 10),
  ].join("-");
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object"
    && value !== null
    && !Array.isArray(value)
  );
}

function isAssistantRole(
  value: unknown,
): value is AssistantRole {
  return (
    value === "user"
    || value === "assistant"
  );
}

function isAssistantMessageStatus(
  value: unknown,
): value is AssistantMessageStatus {
  return (
    value === "sending"
    || value === "completed"
    || value === "error"
  );
}

function isAssistantTranslations(
  value: unknown,
): value is AssistantTranslations {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.es === "string"
    && value.es.trim().length > 0
    && typeof value.en === "string"
    && value.en.trim().length > 0
  );
}

function isAssistantSource(
  value: unknown,
): value is AssistantSource {
  if (!isRecord(value)) {
    return false;
  }

  const hasValidHref =
    value.href === undefined
    || typeof value.href === "string";

  return (
    typeof value.id === "string"
    && typeof value.title === "string"
    && typeof value.section === "string"
    && hasValidHref
  );
}

function isAssistantAuthAction(
  value: unknown,
): value is AssistantAuthAction {
  return (
    typeof value === "string"
    && ASSISTANT_AUTH_ACTIONS.includes(
      value as AssistantAuthAction,
    )
  );
}

function isStringArray(
  value: unknown,
): value is readonly string[] {
  return (
    Array.isArray(value)
    && value.every(
      (item) =>
        typeof item === "string"
        && item.length > 0,
    )
  );
}

function isAssistantToolPayload(
  value: unknown,
): value is AssistantToolPayload {
  if (!isRecord(value)) {
    return false;
  }

  const validPasswords =
    value.passwordSuggestions === undefined
    || isStringArray(
      value.passwordSuggestions,
    );

  const validAliases =
    value.aliasSuggestions === undefined
    || isStringArray(
      value.aliasSuggestions,
    );

  const validAction =
    value.authAction === undefined
    || isAssistantAuthAction(
      value.authAction,
    );

  const validRequiresUserInput =
    value.requiresUserInput === undefined
    || typeof value.requiresUserInput === "boolean";

  const validPasswordLength =
    value.passwordLength === undefined
    || (
      typeof value.passwordLength === "number"
      && Number.isInteger(
        value.passwordLength,
      )
      && value.passwordLength >= 8
      && value.passwordLength <= 30
    );

  return (
    validPasswords
    && validAliases
    && validAction
    && validRequiresUserInput
    && validPasswordLength
  );
}

function isAssistantMessage(
  value: unknown,
): value is AssistantMessage {
  if (!isRecord(value)) {
    return false;
  }

  const hasValidSources =
    value.sources === undefined
    || (
      Array.isArray(value.sources)
      && value.sources.every(
        isAssistantSource,
      )
    );

  const hasValidTranslations =
    value.translations === undefined
    || isAssistantTranslations(
      value.translations,
    );

  const hasValidTools =
    value.tools === undefined
    || isAssistantToolPayload(
      value.tools,
    );

  return (
    typeof value.id === "string"
    && isAssistantRole(
      value.role,
    )
    && typeof value.content === "string"
    && typeof value.createdAt === "number"
    && Number.isFinite(
      value.createdAt,
    )
    && isAssistantMessageStatus(
      value.status,
    )
    && hasValidSources
    && hasValidTranslations
    && hasValidTools
  );
}

function limitStoredMessages(
  messages: readonly AssistantMessage[],
): AssistantMessage[] {
  return messages.slice(
    -ASSISTANT_CONFIG.maxStoredMessages,
  );
}

function removeGeneratedPasswordsFromTools(
  tools: AssistantToolPayload,
): AssistantToolPayload | undefined {
  const sanitizedTools:
    AssistantToolPayload = {
      ...(tools.aliasSuggestions
        ? {
            aliasSuggestions:
              tools.aliasSuggestions,
          }
        : {}),

      ...(tools.authAction
        ? {
            authAction:
              tools.authAction,
          }
        : {}),

      ...(typeof tools.requiresUserInput
        === "boolean"
        ? {
            requiresUserInput:
              tools.requiresUserInput,
          }
        : {}),

      ...(typeof tools.passwordLength
        === "number"
        ? {
            passwordLength:
              tools.passwordLength,
          }
        : {}),
    };

  return Object.keys(
    sanitizedTools,
  ).length > 0
    ? sanitizedTools
    : undefined;
}

function sanitizeMessageForStorage(
  message: AssistantMessage,
): AssistantMessage {
  if (
    message.tools === undefined
    || message.tools.passwordSuggestions === undefined
  ) {
    return message;
  }

  const sanitizedTools =
    removeGeneratedPasswordsFromTools(
      message.tools,
    );

  const sanitizedMessage:
    AssistantMessage = {
      ...message,
    };

  if (
    sanitizedTools === undefined
  ) {
    delete sanitizedMessage.tools;

    return sanitizedMessage;
  }

  sanitizedMessage.tools =
    sanitizedTools;

  return sanitizedMessage;
}

function createAccountStorageKey(
  accountId: string,
): string {
  return [
    ASSISTANT_CONFIG.storageKey,
    "account",
    accountId,
  ].join(":");
}

function readStoredMessages(
  storageKey: string,
): AssistantMessage[] {
  if (
    typeof window === "undefined"
  ) {
    return [];
  }

  try {
    const storedValue =
      window.localStorage.getItem(
        storageKey,
      );

    if (!storedValue) {
      return [];
    }

    const parsedValue: unknown =
      JSON.parse(
        storedValue,
      );

    if (
      !Array.isArray(
        parsedValue,
      )
    ) {
      return [];
    }

    return limitStoredMessages(
      parsedValue.filter(
        isAssistantMessage,
      ),
    );
  } catch {
    return [];
  }
}

function writeStoredMessages(
  storageKey: string,
  messages: readonly AssistantMessage[],
): void {
  if (
    typeof window === "undefined"
  ) {
    return;
  }

  try {
    const sanitizedMessages =
      limitStoredMessages(
        messages,
      ).map(
        sanitizeMessageForStorage,
      );

    window.localStorage.setItem(
      storageKey,
      JSON.stringify(
        sanitizedMessages,
      ),
    );
  } catch {
    // El asistente continúa aunque localStorage falle.
  }
}

function removeStoredMessages(
  storageKey: string,
): void {
  if (
    typeof window === "undefined"
  ) {
    return;
  }

  try {
    window.localStorage.removeItem(
      storageKey,
    );
  } catch {
    // No se requiere otra acción.
  }
}

function removeLegacyStoredMessages():
  void {
  if (
    typeof window === "undefined"
  ) {
    return;
  }

  try {
    window.localStorage.removeItem(
      ASSISTANT_CONFIG.storageKey,
    );
  } catch {
    // No se requiere otra acción.
  }
}

function normalizeQuestion(
  value: string,
): string {
  return value
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/gu,
      "",
    )
    .toLowerCase()
    .replace(
      /[^a-z0-9\s]/gu,
      " ",
    )
    .replace(
      /\s+/gu,
      " ",
    )
    .trim();
}

function asksForAccountName(
  message: string,
): boolean {
  const normalizedMessage =
    normalizeQuestion(
      message,
    );

  const exactQuestions = [
    "que nombre tengo",
    "cual es mi nombre",
    "como me llamo",
    "dime mi nombre",
    "dime mi nombre de pila",
    "cual es mi nombre de pila",
    "what is my name",
    "whats my name",
    "tell me my name",
    "what is my username",
  ];

  if (
    exactQuestions.includes(
      normalizedMessage,
    )
  ) {
    return true;
  }

  return (
    normalizedMessage.includes(
      "mi nombre de pila",
    )
    || normalizedMessage.includes(
      "my username",
    )
  );
}

function createWelcomeMessage(
  username: string,
): AssistantMessage {
  const translations:
    AssistantTranslations = {
      es:
        `Hola, ${username}. Bienvenido a Fixora. ¿En qué puedo ayudarte?`,

      en:
        `Hello, ${username}. Welcome to Fixora. How can I help you?`,
    };

  return {
    id:
      createAssistantMessageId(
        "assistant",
      ),

    role:
      "assistant",

    content:
      translations.es,

    translations,

    createdAt:
      Date.now(),

    status:
      "completed",
  };
}

function isWelcomeMessage(
  message: AssistantMessage,
): boolean {
  const possibleContents = [
    message.content,
    message.translations?.es,
    message.translations?.en,
  ];

  return possibleContents.some(
    (
      value,
    ): boolean => {
      if (
        typeof value !== "string"
      ) {
        return false;
      }

      const normalizedValue =
        normalizeQuestion(
          value,
        );

      return (
        normalizedValue.includes(
          "bienvenido a fixora",
        )
        || normalizedValue.includes(
          "welcome to fixora",
        )
      );
    },
  );
}

function createAuthenticatedConversation(
  storedMessages:
    readonly AssistantMessage[],
  username:
    string,
): AssistantMessage[] {
  const welcomeMessage =
    createWelcomeMessage(
      username,
    );

  if (
    storedMessages.length === 0
  ) {
    return [
      welcomeMessage,
    ];
  }

  const firstMessage =
    storedMessages[0];

  if (
    firstMessage
    && isWelcomeMessage(
      firstMessage,
    )
  ) {
    return [
      welcomeMessage,
      ...storedMessages.slice(
        1,
      ),
    ];
  }

  return [
    welcomeMessage,
    ...storedMessages,
  ];
}

function createAccountNameMessage(
  username: string,
): AssistantMessage {
  const translations:
    AssistantTranslations = {
      es:
        `Tu nombre de pila en Fixora es ${username}.`,

      en:
        `Your Fixora username is ${username}.`,
    };

  return {
    id:
      createAssistantMessageId(
        "assistant",
      ),

    role:
      "assistant",

    content:
      translations.es,

    translations,

    createdAt:
      Date.now(),

    status:
      "completed",
  };
}

export function useAssistant():
  UseAssistantReturn {
  const {
    status:
      authenticationStatus,

    authenticated,
    account,
  } = useAuth();

  const accountId =
    authenticated
      ? account?.accountId
        ?? null
      : null;

  const username =
    authenticated
      ? account?.username
        ?.trim()
        ?? null
      : null;

  const [
    isOpen,
    setIsOpen,
  ] = useState(
    false,
  );

  const [
    isLoading,
    setIsLoading,
  ] = useState(
    false,
  );

  const [
    messages,
    setMessages,
  ] = useState<
    AssistantMessage[]
  >(
    [],
  );

  const [
    error,
    setError,
  ] = useState<
    string | null
  >(
    null,
  );

  const abortControllerReference =
    useRef<
      AbortController | null
    >(
      null,
    );

  const isMountedReference =
    useRef(
      true,
    );

  const isSendingReference =
    useRef(
      false,
    );

  const activeStorageKeyReference =
    useRef<
      string | null
    >(
      null,
    );

  const activeAccountIdReference =
    useRef<
      string | null
    >(
      null,
    );

  const storageReadyReference =
    useRef(
      false,
    );

  const resetConversationState =
    useCallback(
      (): void => {
        abortControllerReference
          .current
          ?.abort();

        abortControllerReference.current =
          null;

        isSendingReference.current =
          false;

        setMessages(
          [],
        );

        setError(
          null,
        );

        setIsLoading(
          false,
        );
      },
      [],
    );

  useEffect(
    () => {
      isMountedReference.current =
        true;

      return () => {
        isMountedReference.current =
          false;

        isSendingReference.current =
          false;

        abortControllerReference
          .current
          ?.abort();

        abortControllerReference.current =
          null;
      };
    },
    [],
  );

  useEffect(
    () => {
      if (
        authenticationStatus === "LOADING"
      ) {
        return undefined;
      }

      if (
        authenticationStatus === "AUTHENTICATED"
        && accountId
        && username
      ) {
        if (
          activeAccountIdReference.current === accountId
          && storageReadyReference.current
        ) {
          return undefined;
        }

        const storageKey =
          createAccountStorageKey(
            accountId,
          );

        const previousStorageKey =
          activeStorageKeyReference.current;

        const storedMessages =
          readStoredMessages(
            storageKey,
          );

        const nextMessages =
          createAuthenticatedConversation(
            storedMessages,
            username,
          );

        const timeoutIdentifier =
          window.setTimeout(
            () => {
              if (
                previousStorageKey
                && previousStorageKey !== storageKey
              ) {
                removeStoredMessages(
                  previousStorageKey,
                );
              }

              removeLegacyStoredMessages();

              activeStorageKeyReference.current =
                storageKey;

              activeAccountIdReference.current =
                accountId;

              storageReadyReference.current =
                true;

              abortControllerReference
                .current
                ?.abort();

              abortControllerReference.current =
                null;

              isSendingReference.current =
                false;

              setMessages(
                nextMessages,
              );

              setError(
                null,
              );

              setIsLoading(
                false,
              );
            },
            0,
          );

        return () => {
          window.clearTimeout(
            timeoutIdentifier,
          );
        };
      }

      if (
        authenticationStatus === "UNAUTHENTICATED"
      ) {
        const activeStorageKey =
          activeStorageKeyReference.current;

        const timeoutIdentifier =
          window.setTimeout(
            () => {
              if (
                activeStorageKey
              ) {
                removeStoredMessages(
                  activeStorageKey,
                );
              }

              removeLegacyStoredMessages();

              activeStorageKeyReference.current =
                null;

              activeAccountIdReference.current =
                null;

              storageReadyReference.current =
                false;

              resetConversationState();
            },
            0,
          );

        return () => {
          window.clearTimeout(
            timeoutIdentifier,
          );
        };
      }

      return undefined;
    },
    [
      accountId,
      authenticationStatus,
      resetConversationState,
      username,
    ],
  );

  useEffect(
    () => {
      const storageKey =
        activeStorageKeyReference.current;

      if (
        !storageReadyReference.current
        || !storageKey
        || authenticationStatus !== "AUTHENTICATED"
      ) {
        return;
      }

      writeStoredMessages(
        storageKey,
        messages,
      );
    },
    [
      authenticationStatus,
      messages,
    ],
  );

  const openAssistant =
    useCallback(
      (): void => {
        setIsOpen(
          true,
        );
      },
      [],
    );

  const closeAssistant =
    useCallback(
      (): void => {
        setIsOpen(
          false,
        );
      },
      [],
    );

  const toggleAssistant =
    useCallback(
      (): void => {
        setIsOpen(
          (
            currentValue,
          ) =>
            !currentValue,
        );
      },
      [],
    );

  const clearError =
    useCallback(
      (): void => {
        setError(
          null,
        );
      },
      [],
    );

  const clearMessages =
    useCallback(
      (): void => {
        abortControllerReference
          .current
          ?.abort();

        abortControllerReference.current =
          null;

        isSendingReference.current =
          false;

        const storageKey =
          activeStorageKeyReference.current
          ?? (
            accountId
              ? createAccountStorageKey(
                  accountId,
                )
              : null
          );

        if (
          authenticated
          && accountId
          && username
        ) {
          const welcomeMessages:
            AssistantMessage[] = [
              createWelcomeMessage(
                username,
              ),
            ];

          activeStorageKeyReference.current =
            storageKey;

          activeAccountIdReference.current =
            accountId;

          storageReadyReference.current =
            true;

          setMessages(
            welcomeMessages,
          );

          setError(
            null,
          );

          setIsLoading(
            false,
          );

          if (
            storageKey
          ) {
            writeStoredMessages(
              storageKey,
              welcomeMessages,
            );
          }

          return;
        }

        resetConversationState();

        if (
          storageKey
        ) {
          removeStoredMessages(
            storageKey,
          );
        }
      },
      [
        accountId,
        authenticated,
        resetConversationState,
        username,
      ],
    );

  const sendMessage =
    useCallback(
      async ({
        message,
        locale,
      }: SendAssistantMessageOptions):
        Promise<void> => {
        const normalizedMessage =
          message.trim();

        if (
          normalizedMessage.length === 0
          || isSendingReference.current
        ) {
          return;
        }

        const currentCopy =
          getAssistantCopy(
            locale,
          );

        if (
          normalizedMessage.length
          > ASSISTANT_CONFIG.maxMessageLength
        ) {
          setError(
            currentCopy.messageTooLong,
          );

          return;
        }

        const history =
          messages
            .filter(
              (
                storedMessage,
              ) =>
                storedMessage.status === "completed",
            )
            .slice(
              -ASSISTANT_CONFIG.maxHistoryMessages,
            )
            .map(
              (
                storedMessage,
              ) => ({
                role:
                  storedMessage.role,

                content:
                  storedMessage.role === "assistant"
                    ? storedMessage
                        .translations?.[
                          locale
                        ]
                      ?? storedMessage.content
                    : storedMessage.content,
              }),
            );

        const userMessage:
          AssistantMessage = {
            id:
              createAssistantMessageId(
                "user",
              ),

            role:
              "user",

            content:
              normalizedMessage,

            createdAt:
              Date.now(),

            status:
              "completed",
          };

        if (
          authenticated
          && username
          && asksForAccountName(
            normalizedMessage,
          )
        ) {
          const nameMessage =
            createAccountNameMessage(
              username,
            );

          setMessages(
            (
              currentMessages,
            ) =>
              limitStoredMessages([
                ...currentMessages,
                userMessage,
                nameMessage,
              ]),
          );

          setError(
            null,
          );

          setIsLoading(
            false,
          );

          return;
        }

        setMessages(
          (
            currentMessages,
          ) =>
            limitStoredMessages([
              ...currentMessages,
              userMessage,
            ]),
        );

        setError(
          null,
        );

        setIsLoading(
          true,
        );

        isSendingReference.current =
          true;

        abortControllerReference
          .current
          ?.abort();

        const controller =
          new AbortController();

        abortControllerReference.current =
          controller;

        try {
          const response =
            await requestAssistantResponse(
              {
                message:
                  normalizedMessage,

                locale,
                history,
              },
              controller.signal,
            );

          if (
            controller.signal.aborted
            || !isMountedReference.current
          ) {
            return;
          }

          const assistantMessage:
            AssistantMessage = {
              id:
                createAssistantMessageId(
                  "assistant",
                ),

              role:
                "assistant",

              content:
                response.message,

              translations:
                response.translations,

              createdAt:
                Date.now(),

              status:
                "completed",

              sources:
                response.sources,

              ...(response.tools
                ? {
                    tools:
                      response.tools,
                  }
                : {}),
            };

          setMessages(
            (
              currentMessages,
            ) =>
              limitStoredMessages([
                ...currentMessages,
                assistantMessage,
              ]),
          );
        } catch (caughtError) {
          if (
            controller.signal.aborted
            || !isMountedReference.current
          ) {
            return;
          }

          const errorMessage =
            caughtError instanceof AssistantServiceError
              ? caughtError.message
              : currentCopy.errorMessage;

          const spanishCopy =
            getAssistantCopy(
              "es",
            );

          const englishCopy =
            getAssistantCopy(
              "en",
            );

          const errorTranslations:
            AssistantTranslations = {
              es:
                locale === "es"
                  ? errorMessage
                  : spanishCopy.errorMessage,

              en:
                locale === "en"
                  ? errorMessage
                  : englishCopy.errorMessage,
            };

          setError(
            errorMessage,
          );

          const assistantErrorMessage:
            AssistantMessage = {
              id:
                createAssistantMessageId(
                  "assistant",
                ),

              role:
                "assistant",

              content:
                errorTranslations[
                  locale
                ],

              translations:
                errorTranslations,

              createdAt:
                Date.now(),

              status:
                "error",
            };

          setMessages(
            (
              currentMessages,
            ) =>
              limitStoredMessages([
                ...currentMessages,
                assistantErrorMessage,
              ]),
          );
        } finally {
          if (
            abortControllerReference.current === controller
          ) {
            abortControllerReference.current =
              null;
          }

          isSendingReference.current =
            false;

          if (
            isMountedReference.current
          ) {
            setIsLoading(
              false,
            );
          }
        }
      },
      [
        authenticated,
        messages,
        username,
      ],
    );

  return {
    isOpen,
    isLoading,
    messages,
    error,
    openAssistant,
    closeAssistant,
    toggleAssistant,
    sendMessage,
    clearMessages,
    clearError,
  };
}