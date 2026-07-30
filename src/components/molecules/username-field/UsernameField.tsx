"use client";

import {
  useEffect,
  useId,
} from "react";

import {
  AuthField,
} from "@/components/molecules/auth-field";

import {
  useUsernameAvailability,
} from "@/hooks/use-username-availability";

import type {
  UsernameAvailabilityStatus,
  UsernameFieldProps,
  UsernameUnavailabilityReason,
} from "./UsernameField.types";

function normalizeGeneratedId(
  value: string,
): string {
  return value.replace(
    /[^A-Za-z0-9_-]/gu,
    "",
  );
}

function combineDescriptionIds(
  ...values:
    Array<
      string
      | undefined
    >
): string | undefined {
  const identifiers =
    values.flatMap(
      (
        value,
      ) =>
        value
          ?.split(/\s+/u)
          .filter(Boolean)
        ?? [],
    );

  const uniqueIdentifiers =
    Array.from(
      new Set(
        identifiers,
      ),
    );

  return uniqueIdentifiers.length
    > 0
    ? uniqueIdentifiers.join(" ")
    : undefined;
}

function normalizeAvailabilityStatus(
  value: string,
): UsernameAvailabilityStatus {
  switch (value) {
    case "CHECKING":
    case "AVAILABLE":
    case "UNAVAILABLE":
    case "INVALID":
    case "ERROR":
      return value;

    default:
      return "IDLE";
  }
}

function normalizeUnavailabilityReason(
  value:
    string
    | null
    | undefined,
): UsernameUnavailabilityReason {
  if (
    value === "TAKEN"
    || value === "TOO_SIMILAR"
  ) {
    return value;
  }

  return null;
}

export function UsernameField({
  fieldId,
  username,
  onUsernameChange,
  availabilityEnabled = true,
  debounceMilliseconds = 400,
  messages,
  showSuggestions = true,
  suggestionButtonProps,
  onSuggestionSelect,
  onAvailabilityChange,
  disabled,
  errorMessage,
  "aria-describedby":
    providedAriaDescribedBy,
  ...authFieldProperties
}: UsernameFieldProps) {
  const generatedId =
    useId();

  const resolvedFieldId =
    fieldId
    ?? `username-field-${normalizeGeneratedId(
      generatedId,
    )}`;

  const availability =
    useUsernameAvailability({
      username,

      enabled:
        availabilityEnabled
        && !disabled,

      debounceMilliseconds,
    });

  const availabilityStatus =
    normalizeAvailabilityStatus(
      availability.status,
    );

  const unavailabilityReason =
    normalizeUnavailabilityReason(
      availability.reason,
    );

  const statusMessage =
    (() => {
      switch (
        availabilityStatus
      ) {
        case "CHECKING":
          return messages.checking;

        case "AVAILABLE":
          return messages.available;

        case "UNAVAILABLE":
          return unavailabilityReason
            === "TOO_SIMILAR"
            ? messages.tooSimilar
            : messages.taken;

        case "INVALID":
          return messages.invalid;

        case "ERROR":
          return (
            availability.errorMessage
            ?? messages.error
          );

        default:
          return null;
      }
    })();

  const statusId =
    statusMessage
      ? `${resolvedFieldId}-availability`
      : undefined;

  const suggestionsId =
    showSuggestions
    && availability.suggestions
      .length > 0
      ? `${resolvedFieldId}-suggestions`
      : undefined;

  const describedBy =
    combineDescriptionIds(
      providedAriaDescribedBy,
      statusId,
      suggestionsId,
    );

  useEffect(
    () => {
      onAvailabilityChange?.(
        availabilityStatus,
        unavailabilityReason,
      );
    },
    [
      availabilityStatus,
      unavailabilityReason,
      onAvailabilityChange,
    ],
  );

  const handleSuggestionSelection =
    (
      suggestion:
        string,
    ): void => {
      if (disabled) {
        return;
      }

      onUsernameChange(
        suggestion,
      );

      onSuggestionSelect?.(
        suggestion,
      );
    };

  return (
    <div
      data-username-field=""
      data-username-availability-status={
        availabilityStatus.toLowerCase()
      }
      data-username-unavailability-reason={
        unavailabilityReason
          ?.toLowerCase()
      }
    >
      <AuthField
        {...authFieldProperties}
        fieldId={
          resolvedFieldId
        }
        name={
          authFieldProperties.name
        }
        type="text"
        value={username}
        autoComplete="username"
        disabled={disabled}
        errorMessage={
          errorMessage
        }
        aria-describedby={
          describedBy
        }
        aria-busy={
          availabilityStatus
          === "CHECKING"
        }
        onChange={
          (
            event,
          ) => {
            onUsernameChange(
              event.target.value,
            );
          }
        }
      />

      {statusMessage ? (
        <p
          id={statusId}
          role={
            availabilityStatus
              === "ERROR"
              ? "alert"
              : "status"
          }
          aria-live={
            availabilityStatus
              === "ERROR"
              ? "assertive"
              : "polite"
          }
          aria-atomic="true"
        >
          {statusMessage}
        </p>
      ) : null}

      {showSuggestions
      && availability.suggestions
        .length > 0 ? (
        <div
          id={suggestionsId}
          data-username-suggestions=""
        >
          <p>
            {messages.suggestionsLabel}
          </p>

          <ul>
            {availability.suggestions.map(
              (
                suggestion,
              ) => (
                <li
                  key={
                    suggestion
                  }
                >
                  <button
                    {...suggestionButtonProps}
                    type="button"
                    disabled={
                      disabled
                      || suggestionButtonProps
                        ?.disabled
                    }
                    onClick={
                      () => {
                        handleSuggestionSelection(
                          suggestion,
                        );
                      }
                    }
                  >
                    {suggestion}
                  </button>
                </li>
              ),
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}