"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  USERNAME_RULES,
} from "@/config/auth.config";

export type UsernameAvailabilityStatus =
  | "IDLE"
  | "CHECKING"
  | "AVAILABLE"
  | "UNAVAILABLE"
  | "INVALID"
  | "ERROR";

export type UsernameUnavailableReason =
  | "TAKEN"
  | "TOO_SIMILAR"
  | "INVALID"
  | "UNKNOWN";

export type UsernameAvailabilitySnapshot = {
  username: string;
  normalizedUsername: string | null;

  status: UsernameAvailabilityStatus;
  available: boolean | null;

  reason:
    UsernameUnavailableReason
    | null;

  suggestions:
    readonly string[];

  errorMessage: string | null;
};

export type UseUsernameAvailabilityOptions = {
  username: string;

  enabled?: boolean;
  debounceMilliseconds?: number;
};

export type UseUsernameAvailabilityResult =
  UsernameAvailabilitySnapshot & {
    check: (
      usernameOverride?: string,
    ) => Promise<
      UsernameAvailabilitySnapshot
    >;

    reset: () => void;
  };

type UsernameAvailabilityApiData = {
  username?: unknown;
  normalizedUsername?: unknown;
  available?: unknown;
  reason?: unknown;
  suggestions?: unknown;
};

type ApiSuccessResponse = {
  success: true;
  data: UsernameAvailabilityApiData;
};

type ApiErrorResponse = {
  success: false;

  error?: {
    message?: unknown;
  };
};

const DEFAULT_DEBOUNCE_MILLISECONDS =
  400;

const MAXIMUM_DEBOUNCE_MILLISECONDS =
  5_000;

const EMPTY_SNAPSHOT:
  UsernameAvailabilitySnapshot = {
  username:
    "",

  normalizedUsername:
    null,

  status:
    "IDLE",

  available:
    null,

  reason:
    null,

  suggestions:
    [],

  errorMessage:
    null,
};

function normalizeDebounceMilliseconds(
  value: number | undefined,
): number {
  if (
    typeof value === "undefined"
  ) {
    return DEFAULT_DEBOUNCE_MILLISECONDS;
  }

  if (
    !Number.isFinite(value)
  ) {
    return DEFAULT_DEBOUNCE_MILLISECONDS;
  }

  return Math.min(
    MAXIMUM_DEBOUNCE_MILLISECONDS,
    Math.max(
      0,
      Math.trunc(value),
    ),
  );
}

function normalizeUsernameInput(
  username: string,
): string {
  return username
    .trim()
    .normalize("NFC");
}

function isUsernameInputValid(
  username: string,
): boolean {
  return (
    username.length
      >= USERNAME_RULES.minimumLength
    && username.length
      <= USERNAME_RULES.maximumLength
    && USERNAME_RULES
      .allowedPattern
      .test(username)
  );
}

function normalizeUnavailableReason(
  value: unknown,
): UsernameUnavailableReason {
  switch (value) {
    case "TAKEN":
    case "TOO_SIMILAR":
    case "INVALID":
      return value;

    default:
      return "UNKNOWN";
  }
}

function normalizeSuggestions(
  value: unknown,
): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const suggestions =
    new Set<string>();

  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }

    const suggestion =
      normalizeUsernameInput(item);

    if (
      !isUsernameInputValid(
        suggestion,
      )
    ) {
      continue;
    }

    suggestions.add(
      suggestion,
    );

    if (suggestions.size >= 12) {
      break;
    }
  }

  return [...suggestions];
}

function readErrorMessage(
  payload: unknown,
  fallbackMessage: string,
): string {
  if (
    typeof payload !== "object"
    || payload === null
    || !("error" in payload)
  ) {
    return fallbackMessage;
  }

  const error =
    payload.error;

  if (
    typeof error !== "object"
    || error === null
    || !("message" in error)
    || typeof error.message
      !== "string"
  ) {
    return fallbackMessage;
  }

  const message =
    error.message.trim();

  return message
    || fallbackMessage;
}

function isAbortError(
  error: unknown,
): boolean {
  return (
    error instanceof DOMException
    && error.name === "AbortError"
  );
}

export function useUsernameAvailability({
  username,
  enabled = true,
  debounceMilliseconds,
}: UseUsernameAvailabilityOptions):
  UseUsernameAvailabilityResult {
  const [
    snapshot,
    setSnapshot,
  ] = useState<
    UsernameAvailabilitySnapshot
  >(
    EMPTY_SNAPSHOT,
  );

  const requestSequenceReference =
    useRef(
      0,
    );

  const abortControllerReference =
    useRef<
      AbortController | null
    >(
      null,
    );

  const normalizedUsername =
    useMemo(
      () =>
        normalizeUsernameInput(
          username,
        ),
      [
        username,
      ],
    );

  const normalizedDebounceMilliseconds =
    useMemo(
      () =>
        normalizeDebounceMilliseconds(
          debounceMilliseconds,
        ),
      [
        debounceMilliseconds,
      ],
    );

  const performCheck =
    useCallback(
      async (
        candidateValue: string,
      ): Promise<
        UsernameAvailabilitySnapshot
      > => {
        const candidate =
          normalizeUsernameInput(
            candidateValue,
          );

        if (
          !isUsernameInputValid(
            candidate,
          )
        ) {
          const invalidSnapshot:
            UsernameAvailabilitySnapshot = {
            username:
              candidate,

            normalizedUsername:
              null,

            status:
              candidate.length === 0
                ? "IDLE"
                : "INVALID",

            available:
              false,

            reason:
              candidate.length === 0
                ? null
                : "INVALID",

            suggestions:
              [],

            errorMessage:
              null,
          };

          setSnapshot(
            invalidSnapshot,
          );

          return invalidSnapshot;
        }

        abortControllerReference
          .current
          ?.abort();

        const abortController =
          new AbortController();

        abortControllerReference.current =
          abortController;

        requestSequenceReference.current += 1;

        const requestSequence =
          requestSequenceReference.current;

        const checkingSnapshot:
          UsernameAvailabilitySnapshot = {
          username:
            candidate,

          normalizedUsername:
            null,

          status:
            "CHECKING",

          available:
            null,

          reason:
            null,

          suggestions:
            [],

          errorMessage:
            null,
        };

        setSnapshot(
          checkingSnapshot,
        );

        try {
          const searchParameters =
            new URLSearchParams({
              username:
                candidate,
            });

          const response =
            await fetch(
              `/api/auth/username/availability?${searchParameters.toString()}`,
              {
                method:
                  "GET",

                headers: {
                  Accept:
                    "application/json",
                },

                cache:
                  "no-store",

                credentials:
                  "same-origin",

                signal:
                  abortController.signal,
              },
            );

          const payload =
            await response.json()
              .catch(
                () => null,
              ) as
                | ApiSuccessResponse
                | ApiErrorResponse
                | null;

          if (
            !response.ok
            || !payload
            || payload.success
              !== true
          ) {
            throw new Error(
              readErrorMessage(
                payload,
                "No se pudo comprobar el nombre de pila.",
              ),
            );
          }

          const available =
            payload.data.available
              === true;

          const resultSnapshot:
            UsernameAvailabilitySnapshot = {
            username:
              candidate,

            normalizedUsername:
              typeof payload.data
                .normalizedUsername
                === "string"
                ? payload.data
                    .normalizedUsername
                    .trim()
                : candidate
                    .toLowerCase(),

            status:
              available
                ? "AVAILABLE"
                : "UNAVAILABLE",

            available,

            reason:
              available
                ? null
                : normalizeUnavailableReason(
                    payload.data.reason,
                  ),

            suggestions:
              normalizeSuggestions(
                payload.data
                  .suggestions,
              ),

            errorMessage:
              null,
          };

          if (
            requestSequence
            === requestSequenceReference
              .current
          ) {
            setSnapshot(
              resultSnapshot,
            );
          }

          return resultSnapshot;
        } catch (error) {
          if (isAbortError(error)) {
            return checkingSnapshot;
          }

          const errorSnapshot:
            UsernameAvailabilitySnapshot = {
            username:
              candidate,

            normalizedUsername:
              null,

            status:
              "ERROR",

            available:
              null,

            reason:
              null,

            suggestions:
              [],

            errorMessage:
              error instanceof Error
                ? error.message
                : "No se pudo comprobar el nombre de pila.",
          };

          if (
            requestSequence
            === requestSequenceReference
              .current
          ) {
            setSnapshot(
              errorSnapshot,
            );
          }

          return errorSnapshot;
        } finally {
          if (
            requestSequence
            === requestSequenceReference
              .current
          ) {
            abortControllerReference.current =
              null;
          }
        }
      },
      [],
    );

  const check =
    useCallback(
      (
        usernameOverride?: string,
      ): Promise<
        UsernameAvailabilitySnapshot
      > => {
        return performCheck(
          usernameOverride
          ?? normalizedUsername,
        );
      },
      [
        normalizedUsername,
        performCheck,
      ],
    );

  const reset =
    useCallback(
      (): void => {
        abortControllerReference
          .current
          ?.abort();

        abortControllerReference.current =
          null;

        requestSequenceReference.current += 1;

        setSnapshot(
          EMPTY_SNAPSHOT,
        );
      },
      [],
    );

  useEffect(
    () => {
      if (
        !enabled
        || normalizedUsername.length
          === 0
      ) {
        return undefined;
      }

      const timeoutIdentifier =
        window.setTimeout(
          () => {
            void performCheck(
              normalizedUsername,
            );
          },
          normalizedDebounceMilliseconds,
        );

      return () => {
        window.clearTimeout(
          timeoutIdentifier,
        );

        abortControllerReference
          .current
          ?.abort();
      };
    },
    [
      enabled,
      normalizedUsername,
      normalizedDebounceMilliseconds,
      performCheck,
    ],
  );

  useEffect(
    () => {
      return () => {
        abortControllerReference
          .current
          ?.abort();
      };
    },
    [],
  );

  const representsCurrentUsername =
    snapshot.username
    === normalizedUsername;

  if (
    normalizedUsername.length === 0
    || !representsCurrentUsername
  ) {
    return {
      ...EMPTY_SNAPSHOT,

      username:
        normalizedUsername,

      check,
      reset,
    };
  }

  return {
    ...snapshot,

    check,
    reset,
  };
}