import type {
  ButtonHTMLAttributes,
  ReactNode,
} from "react";

import type {
  AuthFieldProps,
} from "@/components/molecules/auth-field";

export type PasswordVisibilityButtonProps =
  Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    | "children"
    | "type"
    | "aria-label"
    | "aria-controls"
    | "aria-pressed"
    | "onClick"
  >;

export type PasswordVisibilityContent =
  | ReactNode
  | ((
      passwordVisible:
        boolean,
    ) => ReactNode);

export type PasswordFieldProps =
  Omit<
    AuthFieldProps,
    "type"
  > & {
    passwordVisible?:
      boolean;

    defaultPasswordVisible?:
      boolean;

    showVisibilityControl?:
      boolean;

    showPasswordLabel:
      string;

    hidePasswordLabel:
      string;

    visibilityContent?:
      PasswordVisibilityContent;

    visibilityButtonProps?:
      PasswordVisibilityButtonProps;

    onPasswordVisibilityChange?: (
      passwordVisible:
        boolean,
    ) => void;
  };