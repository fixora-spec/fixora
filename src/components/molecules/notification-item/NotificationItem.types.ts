import type {
  HTMLAttributes,
} from "react";

import type {
  NotificationHookItem,
} from "@/hooks/use-notifications";

export type NotificationItemReadStatus =
  | "IDLE"
  | "SUBMITTING"
  | "SUCCESS"
  | "ERROR";

export type NotificationItemProps =
  Omit<
    HTMLAttributes<HTMLElement>,
    | "children"
    | "onClick"
  > & {
    notification:
      NotificationHookItem;

    itemId?:
      string;

    disabled?:
      boolean;

    showReadStatus?:
      boolean;

    onRequestRead?: (
      notification:
        NotificationHookItem,
    ) =>
      void
      | Promise<void>;

    onReadSuccess?: (
      notification:
        NotificationHookItem,
    ) => void;

    onReadError?: (
      error:
        unknown,

      notification:
        NotificationHookItem,
    ) => void;
  };