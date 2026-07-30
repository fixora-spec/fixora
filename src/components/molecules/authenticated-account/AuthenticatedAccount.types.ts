import type {
  AccountRole,
} from "@/types/account";

export type AuthenticatedAccountData = {
  accountId:
    string;

  username:
    string;

  firstNames?:
    string
    | null;

  lastNames?:
    string
    | null;

  imageUrl?:
    string
    | null;

  accountRole:
    AccountRole;
};

export type AuthenticatedAccountView =
  | "NONE"
  | "PROFILE"
  | "NOTIFICATIONS"
  | "CART";

export type AuthenticatedAccountSignOutStatus =
  | "IDLE"
  | "SUBMITTING"
  | "ERROR";

export type AuthenticatedAccountProps = {
  account:
    AuthenticatedAccountData;

  accountControlId?:
    string;

  disabled?:
    boolean;

  unreadNotificationsCount?:
    number;

  onRequestProfile?:
    () => void;

  onRequestNotifications?:
    () => void;

  onRequestCart?:
    () => void;

  onRequestSignOut:
    () =>
      void
      | Promise<void>;

  onMenuOpenChange?: (
    open:
      boolean,
  ) => void;

  onViewChange?: (
    view:
      AuthenticatedAccountView,
  ) => void;
};