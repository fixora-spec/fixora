import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
} from "react";

export type AssistantCopyValueStatus =
  | "IDLE"
  | "COPYING"
  | "COPIED"
  | "ERROR";

export type AssistantCopyValueButtonProps =
  Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    | "children"
    | "type"
    | "onClick"
    | "aria-describedby"
  >;

export type AssistantCopyValueProps =
  Omit<
    HTMLAttributes<HTMLDivElement>,
    "children"
  > & {
    value:
      string;

    displayValue?:
      ReactNode;

    label?:
      ReactNode;

    copyLabel:
      ReactNode;

    copyingLabel?:
      ReactNode;

    copiedLabel:
      ReactNode;

    errorLabel:
      ReactNode;

    copiedAnnouncement?:
      ReactNode;

    errorAnnouncement?:
      ReactNode;

    copyButtonProps?:
      AssistantCopyValueButtonProps;

    resetStatusAfterMilliseconds?:
      number;

    disabled?:
      boolean;

    hidden?:
      boolean;

    onCopySuccess?: (
      value: string,
    ) => void;

    onCopyError?: (
      error: unknown,
      value: string,
    ) => void;

    onStatusChange?: (
      status:
        AssistantCopyValueStatus,
    ) => void;
  };