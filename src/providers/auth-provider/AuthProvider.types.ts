import type {
  ReactNode,
} from "react";

import type {
  AuthAccountData,
  AuthSessionResponseData,
} from "@/services/auth";

export type AuthenticationPanelView =
  | "USER_SIGN_IN"
  | "USER_REGISTRATION"
  | "EMAIL_VERIFICATION"
  | "PASSWORD_RECOVERY"
  | "PASSWORD_RESET"
  | "ADMIN_SIGN_IN";

export type AuthenticationStatus =
  | "LOADING"
  | "AUTHENTICATED"
  | "UNAUTHENTICATED"
  | "ERROR";

export type AuthenticationPanelState = {
  open: boolean;
  view: AuthenticationPanelView;
};

export type AuthenticationSessionState = {
  status: AuthenticationStatus;

  account:
    AuthAccountData
    | null;

  expiresAt:
    string
    | null;

  errorMessage:
    string
    | null;
};

export type RefreshAuthenticationOptions = {
  silent?: boolean;
  signal?: AbortSignal;
};

export type OpenAuthenticationOptions = {
  view?: AuthenticationPanelView;
};

export type AuthenticationResultInput = {
  account: AuthAccountData;
  expiresAt: string;
};

export type AuthProviderContextValue = {
  status: AuthenticationStatus;

  loading: boolean;
  authenticated: boolean;

  account:
    AuthAccountData
    | null;

  sessionExpiresAt:
    string
    | null;

  errorMessage:
    string
    | null;

  panelOpen: boolean;
  panelView: AuthenticationPanelView;

  openAuthentication: (
    options?: OpenAuthenticationOptions,
  ) => void;

  closeAuthentication: () => void;

  setAuthenticationView: (
    view: AuthenticationPanelView,
  ) => void;

  applyAuthenticatedSession: (
    input: AuthenticationResultInput,
  ) => void;

  applySessionResponse: (
    response: AuthSessionResponseData,
  ) => void;

  clearAuthenticatedSession: () => void;

  refreshAuthentication: (
    options?: RefreshAuthenticationOptions,
  ) => Promise<AuthSessionResponseData | null>;

  signOut: () => Promise<boolean>;
};

export type AuthProviderProps = {
  children: ReactNode;
};