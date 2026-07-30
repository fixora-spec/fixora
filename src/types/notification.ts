import type {
  AccountId,
} from "@/types/account";

import type {
  JsonObject,
} from "@/types/database";

export type NotificationId = string;

export const NOTIFICATION_TYPES = [
  "USER_ACCOUNT_CREATED",
  "ADMIN_ACCOUNT_ACTIVATED",
  "EMAIL_VERIFIED",
  "PASSWORD_CHANGED",
  "PASSWORD_RESET_COMPLETED",
  "NEW_SIGN_IN",
  "SECURITY_ALERT",
  "GENERAL",
] as const;

export type NotificationType =
  (typeof NOTIFICATION_TYPES)[number];

export type NotificationRecord = {
  notificationId: NotificationId;
  accountId: AccountId;

  type: NotificationType;

  titleKey: string;
  messageKey: string;

  metadata: JsonObject | null;

  readAt: string | null;
  createdAt: string;
};

export type NotificationItem = Pick<
  NotificationRecord,
  | "notificationId"
  | "type"
  | "titleKey"
  | "messageKey"
  | "metadata"
  | "readAt"
  | "createdAt"
>;

export type NotificationListRequest = {
  unreadOnly?: boolean;
  offset?: number;
  limit?: number;
};

export type NotificationListResult = {
  notifications: readonly NotificationItem[];

  unreadCount: number;

  pagination: {
    offset: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
};

export type MarkNotificationReadRequest = {
  notificationId: NotificationId;
};

export type MarkNotificationReadResult = {
  notificationId: NotificationId;
  read: true;
  readAt: string;
};

export type CreateNotificationInput = {
  accountId: AccountId;
  type: NotificationType;

  titleKey: string;
  messageKey: string;

  metadata?: JsonObject | null;
};

export type NotificationState = {
  notifications: readonly NotificationItem[];

  unreadCount: number;

  isLoading: boolean;
  isMarkingAsRead: boolean;

  error: string | null;
};

export type NotificationContextValue =
  NotificationState & {
    refreshNotifications: () => Promise<void>;

    markAsRead: (
      notificationId: NotificationId,
    ) => Promise<void>;

    clearNotificationError: () => void;
  };

export function isNotificationType(
  value: unknown,
): value is NotificationType {
  return (
    typeof value === "string"
    && NOTIFICATION_TYPES.includes(
      value as NotificationType,
    )
  );
}

export function isNotificationRead(
  notification: NotificationItem,
): boolean {
  return notification.readAt !== null;
}