import type {
  ButtonHTMLAttributes,
  ReactNode,
} from "react";

import type {
  AuthFieldProps,
} from "@/components/molecules/auth-field";

export type UsernameAvailabilityStatus =
  | "IDLE"
  | "CHECKING"
  | "AVAILABLE"
  | "UNAVAILABLE"
  | "INVALID"
  | "ERROR";

export type UsernameUnavailabilityReason =
  | "TAKEN"
  | "TOO_SIMILAR"
  | null;

export type UsernameAvailabilityMessages = {
  checking:
    ReactNode;

  available:
    ReactNode;

  taken:
    ReactNode;

  tooSimilar:
    ReactNode;

  invalid:
    ReactNode;

  error:
    ReactNode;

  suggestionsLabel:
    ReactNode;
};

export type UsernameSuggestionButtonProps =
  Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    | "children"
    | "type"
    | "onClick"
  >;

export type UsernameFieldProps =
  Omit<
    AuthFieldProps,
    | "type"
    | "value"
    | "defaultValue"
    | "onChange"
    | "autoComplete"
  > & {
    username:
      string;

    onUsernameChange: (
      username:
        string,
    ) => void;

    availabilityEnabled?:
      boolean;

    debounceMilliseconds?:
      number;

    messages:
      UsernameAvailabilityMessages;

    showSuggestions?:
      boolean;

    suggestionButtonProps?:
      UsernameSuggestionButtonProps;

    onSuggestionSelect?: (
      suggestion:
        string,
    ) => void;

    onAvailabilityChange?: (
      status:
        UsernameAvailabilityStatus,

      reason:
        UsernameUnavailabilityReason,
    ) => void;
  };