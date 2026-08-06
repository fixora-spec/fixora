import type {
  HTMLAttributes,
  ReactNode,
} from "react";

import type {
  Locale,
} from "@/types/locale";

export type AuthenticationShellView =
  | "USER_SIGN_IN"
  | "USER_REGISTRATION"
  | "ADMIN_SIGN_IN";

export type AuthenticationShellProps =
  Omit<
    HTMLAttributes<HTMLDivElement>,
    "children"
  > & {
    view:
      AuthenticationShellView;

    locale:
      Locale;

    children:
      ReactNode;

    panelTitle:
      string;

    panelDescription:
      string;

    panelActionLabel?:
      string;

    panelActionAriaLabel?:
      string;

    closeLabel:
      string;

    onClose:
      () => void;

    onPanelAction?:
      () => void;

    panelActionDisabled?:
      boolean;
  };