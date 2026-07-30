import type {
  HTMLAttributes,
  ReactNode,
} from "react";

export type AuthMessageVariant =
  | "INFO"
  | "SUCCESS"
  | "WARNING"
  | "ERROR";

export type AuthMessageLiveRegion =
  | "off"
  | "polite"
  | "assertive";

export type AuthMessageRole =
  | "status"
  | "alert"
  | "note";

export type AuthMessageProps =
  Omit<
    HTMLAttributes<HTMLDivElement>,
    | "children"
    | "role"
    | "title"
  > & {
    messageId?: string;

    variant?:
      AuthMessageVariant;

    title?:
      ReactNode;

    children:
      ReactNode;

    role?:
      AuthMessageRole;

    live?:
      AuthMessageLiveRegion;

    atomic?:
      boolean;

    hidden?:
      boolean;
  };