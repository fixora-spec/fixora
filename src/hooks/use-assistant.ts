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
  AssistantServiceError,
  requestAssistantResponse,
} from "@/services/assistant";

import type {
  AssistantMessage,
  AssistantMessageStatus,
  AssistantRole,
  AssistantSource,
  AssistantTranslations,
  SendAssistantMessageOptions,
  UseAssistantReturn,
} from "@/types/assistant";

function createAssistantMessageId(
  prefix: AssistantRole,
): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return [
    prefix,
    Date.now().toString(36),
    Math.random().toString(36).slice(2, 10),
  ].join("-");
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isAssistantRole(
  value: unknown,
): value is AssistantRole {
  return (
    value === "user" ||
    value === "assistant"
  );
}

function isAssistantMessageStatus(
  value: unknown,
): value is AssistantMessageStatus {
  return (
    value === "sending" ||
    value === "completed" ||
    value === "error"
  );
}

function isAssistantTranslations(
  value: unknown,
): value is AssistantTranslations {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.es === "string" &&
    value.es.trim().length > 0 &&
    typeof value.en === "string" &&
    value.en.trim().length > 0
  );
}

function isAssistantSource(
  value: unknown,
): value is AssistantSource {
  if (!isRecord(value)) {
    return false;
  }

  const hasValidHref =
    value.href === undefined ||
    typeof value.href === "string";

  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.section === "string" &&
    hasValidHref
  );
}

function isAssistantMessage(
  value: unknown,
): value is AssistantMessage {
  if (!isRecord(value)) {
    return false;
  }

  const hasValidSources =
    value.sources === undefined ||
    (
      Array.isArray(value.sources) &&
      value.sources.every(
        isAssistantSource,
      )
    );

  const hasValidTranslations =
    value.translations === undefined ||
    isAssistantTranslations(
      value.translations,
    );

  return (
    typeof value.id === "string" &&
    isAssistantRole(value.role) &&
    typeof value.content === "string" &&
    typeof value.createdAt === "number" &&
    Number.isFinite(value.createdAt) &&
    isAssistantMessageStatus(
      value.status,
    ) &&
    hasValidSources &&
    hasValidTranslations
  );
}

function limitStoredMessages(
  messages: readonly AssistantMessage[],
): AssistantMessage[] {
  return messages.slice(
    -ASSISTANT_CONFIG.maxStoredMessages,
  );
}

function readStoredMessages(): AssistantMessage[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storedValue =
      window.localStorage.getItem(
        ASSISTANT_CONFIG.storageKey,
      );

    if (!storedValue) {
      return [];
    }

    const parsedValue: unknown =
      JSON.parse(storedValue);

    if (!Array.isArray(parsedValue)) {
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
  messages: readonly AssistantMessage[],
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      ASSISTANT_CONFIG.storageKey,
      JSON.stringify(
        limitStoredMessages(messages),
      ),
    );
  } catch {
    // El asistente continúa funcionando
    // aunque localStorage no esté disponible.
  }
}

function removeStoredMessages(): void {
  if (typeof window === "undefined") {
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

export function useAssistant(): UseAssistantReturn {
  const [isOpen, setIsOpen] =
    useState(false);

  const [isLoading, setIsLoading] =
    useState(false);

  const [messages, setMessages] =
    useState<AssistantMessage[]>(
      readStoredMessages,
    );

  const [error, setError] =
    useState<string | null>(null);

  const abortControllerRef =
    useRef<AbortController | null>(null);

  const isMountedRef = useRef(true);
  const isSendingRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      isSendingRef.current = false;

      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    writeStoredMessages(messages);
  }, [messages]);

  const openAssistant =
    useCallback((): void => {
      setIsOpen(true);
    }, []);

  const closeAssistant =
    useCallback((): void => {
      setIsOpen(false);
    }, []);

  const toggleAssistant =
    useCallback((): void => {
      setIsOpen(
        (currentValue) =>
          !currentValue,
      );
    }, []);

  const clearError =
    useCallback((): void => {
      setError(null);
    }, []);

  const clearMessages =
    useCallback((): void => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;

      isSendingRef.current = false;

      setMessages([]);
      setError(null);
      setIsLoading(false);

      removeStoredMessages();
    }, []);

  const sendMessage = useCallback(
    async ({
      message,
      locale,
    }: SendAssistantMessageOptions): Promise<void> => {
      const normalizedMessage =
        message.trim();

      if (
        !normalizedMessage ||
        isSendingRef.current
      ) {
        return;
      }

      const currentCopy =
        getAssistantCopy(locale);

      if (
        normalizedMessage.length >
        ASSISTANT_CONFIG.maxMessageLength
      ) {
        setError(
          currentCopy.messageTooLong,
        );

        return;
      }

      const history = messages
        .filter(
          (storedMessage) =>
            storedMessage.status ===
            "completed",
        )
        .slice(
          -ASSISTANT_CONFIG.maxHistoryMessages,
        )
        .map((storedMessage) => ({
          role: storedMessage.role,

          content:
            storedMessage.role ===
            "assistant"
              ? storedMessage
                  .translations?.[
                  locale
                ] ??
                storedMessage.content
              : storedMessage.content,
        }));

      const userMessage: AssistantMessage = {
        id:
          createAssistantMessageId(
            "user",
          ),
        role: "user",
        content: normalizedMessage,
        createdAt: Date.now(),
        status: "completed",
      };

      setMessages(
        (currentMessages) =>
          limitStoredMessages([
            ...currentMessages,
            userMessage,
          ]),
      );

      setError(null);
      setIsLoading(true);

      isSendingRef.current = true;

      abortControllerRef.current?.abort();

      const controller =
        new AbortController();

      abortControllerRef.current =
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
          controller.signal.aborted ||
          !isMountedRef.current
        ) {
          return;
        }

        const assistantMessage:
          AssistantMessage = {
          id:
            createAssistantMessageId(
              "assistant",
            ),

          role: "assistant",

          content:
            response.message,

          translations:
            response.translations,

          createdAt: Date.now(),

          status: "completed",

          sources:
            response.sources,
        };

        setMessages(
          (currentMessages) =>
            limitStoredMessages([
              ...currentMessages,
              assistantMessage,
            ]),
        );
      } catch (caughtError) {
        if (
          controller.signal.aborted ||
          !isMountedRef.current
        ) {
          return;
        }

        const errorMessage =
          caughtError instanceof
          AssistantServiceError
            ? caughtError.message
            : currentCopy.errorMessage;

        const spanishCopy =
          getAssistantCopy("es");

        const englishCopy =
          getAssistantCopy("en");

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

        setError(errorMessage);

        const assistantErrorMessage:
          AssistantMessage = {
          id:
            createAssistantMessageId(
              "assistant",
            ),

          role: "assistant",

          content:
            errorTranslations[locale],

          translations:
            errorTranslations,

          createdAt: Date.now(),

          status: "error",
        };

        setMessages(
          (currentMessages) =>
            limitStoredMessages([
              ...currentMessages,
              assistantErrorMessage,
            ]),
        );
      } finally {
        if (
          abortControllerRef.current ===
          controller
        ) {
          abortControllerRef.current =
            null;
        }

        isSendingRef.current = false;

        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [messages],
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