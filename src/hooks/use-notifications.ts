"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";

export type NotificationHookItem = {
  notificationId: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
};

export type NotificationsStatus = "IDLE" | "LOADING" | "READY" | "ERROR";

export type UseNotificationsOptions = {
  enabled?: boolean;
  automaticLoad?: boolean;
};

export type UseNotificationsResult = {
  notifications: readonly NotificationHookItem[];
  unreadCount: number;
  status: NotificationsStatus;
  loading: boolean;
  errorMessage: string | null;
  refresh: () => Promise<void>;
  markAsRead: (notificationId: string) => Promise<boolean>;
  clear: () => void;
};

type SupportedLocale = "es" | "en";
type UnknownRecord = Record<string, unknown>;

type NotificationsState = {
  notifications: readonly NotificationHookItem[];
  unreadCount: number;
  status: NotificationsStatus;
  errorMessage: string | null;
};

const INITIAL_STATE: NotificationsState = {
  notifications: [],
  unreadCount: 0,
  status: "IDLE",
  errorMessage: null,
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: UnknownRecord, keys: readonly string[]): string {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return "";
}

function readValue(record: UnknownRecord, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }

  return undefined;
}

function normalizeIsoDate(value: unknown): string | null {
  if (
    typeof value !== "string"
    && typeof value !== "number"
    && !(value instanceof Date)
  ) {
    return null;
  }

  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeLookupValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "");
}

function looksLikeTranslationKey(value: string): boolean {
  return /^[a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+)+$/iu.test(value);
}

function getLocalizedNotificationCopy(
  locale: SupportedLocale,
  type: string,
  titleKey: string,
  messageKey: string,
): { title: string; message: string } | null {
  const lookup = normalizeLookupValue(`${type} ${titleKey} ${messageKey}`);

  if (
    lookup.includes("useraccountcreated")
    || lookup.includes("accountcreated")
    || lookup.includes("accountverified")
  ) {
    return locale === "en"
      ? {
          title: "Welcome to Fixora",
          message:
            "Your account was verified successfully. You can now use all the features available for your account.",
        }
      : {
          title: "Bienvenido a Fixora",
          message:
            "Tu cuenta fue verificada correctamente. Ya puedes usar todas las funciones disponibles para tu cuenta.",
        };
  }

  if (
    lookup.includes("adminaccountactivated")
    || lookup.includes("administratoractivated")
    || lookup.includes("adminactivated")
  ) {
    return locale === "en"
      ? {
          title: "Administrator account activated",
          message: "Your administrator account was activated successfully.",
        }
      : {
          title: "Cuenta administrativa activada",
          message: "Tu cuenta administrativa fue activada correctamente.",
        };
  }

  if (
    lookup.includes("passwordchanged")
    || lookup.includes("passwordupdated")
  ) {
    return locale === "en"
      ? {
          title: "Password updated",
          message: "Your Fixora account password was updated successfully.",
        }
      : {
          title: "Contraseña actualizada",
          message:
            "La contraseña de tu cuenta Fixora fue actualizada correctamente.",
        };
  }

  return null;
}

function normalizeNotification(
  value: unknown,
  locale: SupportedLocale,
): NotificationHookItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const notificationId = readString(value, [
    "notificationId",
    "notification_id",
    "id",
  ]);

  const titleKey = readString(value, [
    "titleKey",
    "title_key",
  ]);

  const messageKey = readString(value, [
    "messageKey",
    "message_key",
  ]);

  const type =
    readString(value, [
      "type",
      "notificationType",
      "notification_type",
    ])
    || "GENERAL";

  const directTitle = readString(value, [
    "title",
    "localizedTitle",
    "localized_title",
  ]);

  const directMessage = readString(value, [
    "message",
    "localizedMessage",
    "localized_message",
  ]);

  const localizedCopy = getLocalizedNotificationCopy(
    locale,
    type,
    titleKey,
    messageKey,
  );

  const title =
    directTitle && !looksLikeTranslationKey(directTitle)
      ? directTitle
      : localizedCopy?.title || titleKey || directTitle;

  const message =
    directMessage && !looksLikeTranslationKey(directMessage)
      ? directMessage
      : localizedCopy?.message || messageKey || directMessage;

  const createdAt = normalizeIsoDate(
    readValue(value, [
      "createdAt",
      "created_at",
    ]),
  );

  const rawReadAt = readValue(value, [
    "readAt",
    "read_at",
  ]);

  const readAt =
    rawReadAt === null || rawReadAt === undefined
      ? null
      : normalizeIsoDate(rawReadAt);

  const rawIsRead = readValue(value, [
    "isRead",
    "is_read",
    "read",
  ]);

  if (!notificationId || !title || !message || !createdAt) {
    return null;
  }

  return {
    notificationId,
    type,
    title,
    message,
    isRead: rawIsRead === true || rawIsRead === 1 || readAt !== null,
    createdAt,
    readAt,
  };
}

function normalizeNotifications(
  value: unknown,
  locale: SupportedLocale,
): readonly NotificationHookItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const notifications: NotificationHookItem[] = [];
  const knownIds = new Set<string>();

  for (const item of value) {
    const notification = normalizeNotification(item, locale);

    if (!notification || knownIds.has(notification.notificationId)) {
      continue;
    }

    knownIds.add(notification.notificationId);
    notifications.push(notification);
  }

  return notifications.sort(
    (first, second) =>
      new Date(second.createdAt).getTime()
      - new Date(first.createdAt).getTime(),
  );
}

function normalizeUnreadCount(
  value: unknown,
  notifications: readonly NotificationHookItem[],
): number {
  const fallback = notifications.reduce(
    (total, notification) => (notification.isRead ? total : total + 1),
    0,
  );

  return (
    typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
  )
    ? value
    : fallback;
}

function normalizeListResponse(
  payload: unknown,
  locale: SupportedLocale,
): {
  notifications: readonly NotificationHookItem[];
  unreadCount: number;
} {
  if (
    !isRecord(payload)
    || payload.success !== true
    || !isRecord(payload.data)
  ) {
    throw new Error(
      locale === "en"
        ? "The server returned an invalid notifications response."
        : "El servidor devolvió una respuesta de notificaciones no válida.",
    );
  }

  const notifications = normalizeNotifications(
    payload.data.notifications,
    locale,
  );

  return {
    notifications,
    unreadCount: normalizeUnreadCount(
      payload.data.unreadCount,
      notifications,
    ),
  };
}

function readErrorMessage(payload: unknown, fallback: string): string {
  if (
    !isRecord(payload)
    || !isRecord(payload.error)
    || typeof payload.error.message !== "string"
  ) {
    return fallback;
  }

  return payload.error.message.trim() || fallback;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function validateNotificationId(notificationId: string): string {
  const normalizedId = notificationId.trim();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      normalizedId,
    )
  ) {
    throw new Error("El identificador de la notificación no es válido.");
  }

  return normalizedId;
}

export function useNotifications({
  enabled = true,
  automaticLoad = true,
}: UseNotificationsOptions = {}): UseNotificationsResult {
  const currentLocale = useLocale();
  const locale: SupportedLocale = currentLocale === "en" ? "en" : "es";

  const [state, setState] = useState<NotificationsState>(INITIAL_STATE);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestSequenceRef = useRef(0);

  const clear = useCallback((): void => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    requestSequenceRef.current += 1;
    setState(INITIAL_STATE);
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    if (!enabled) {
      return;
    }

    abortControllerRef.current?.abort();

    const controller = new AbortController();

    abortControllerRef.current = controller;
    requestSequenceRef.current += 1;

    const requestSequence = requestSequenceRef.current;

    setState((current) => ({
      ...current,
      status: "LOADING",
      errorMessage: null,
    }));

    try {
      const response = await fetch("/api/notifications", {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Fixora-Locale": locale,
        },
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        throw new Error(
          readErrorMessage(
            payload,
            locale === "en"
              ? "Notifications could not be loaded."
              : "No se pudieron cargar las notificaciones.",
          ),
        );
      }

      const result = normalizeListResponse(payload, locale);

      if (requestSequence !== requestSequenceRef.current) {
        return;
      }

      setState({
        notifications: result.notifications,
        unreadCount: result.unreadCount,
        status: "READY",
        errorMessage: null,
      });
    } catch (error) {
      if (
        isAbortError(error)
        || requestSequence !== requestSequenceRef.current
      ) {
        return;
      }

      setState((current) => ({
        ...current,
        status: "ERROR",
        errorMessage:
          error instanceof Error
            ? error.message
            : locale === "en"
              ? "Notifications could not be loaded."
              : "No se pudieron cargar las notificaciones.",
      }));
    } finally {
      if (requestSequence === requestSequenceRef.current) {
        abortControllerRef.current = null;
      }
    }
  }, [enabled, locale]);

  const markAsRead = useCallback(
    async (notificationId: string): Promise<boolean> => {
      if (!enabled) {
        return false;
      }

      const normalizedId = validateNotificationId(notificationId);

      const currentNotification = state.notifications.find(
        (notification) => notification.notificationId === normalizedId,
      );

      if (currentNotification?.isRead) {
        return true;
      }

      try {
        const response = await fetch(
          `/api/notifications/${encodeURIComponent(normalizedId)}/read`,
          {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              "X-Fixora-Locale": locale,
            },
            credentials: "same-origin",
            body: JSON.stringify({}),
          },
        );

        const payload = (await response.json().catch(() => null)) as unknown;

        if (
          !response.ok
          || !isRecord(payload)
          || payload.success !== true
        ) {
          throw new Error(
            readErrorMessage(
              payload,
              locale === "en"
                ? "The notification could not be marked as read."
                : "No se pudo marcar la notificación como leída.",
            ),
          );
        }

        setState((current) => {
          const wasUnread = current.notifications.some(
            (notification) =>
              notification.notificationId === normalizedId
              && !notification.isRead,
          );

          return {
            ...current,

            notifications: current.notifications.map((notification) =>
              notification.notificationId === normalizedId
                ? {
                    ...notification,
                    isRead: true,
                    readAt:
                      notification.readAt
                      ?? new Date().toISOString(),
                  }
                : notification,
            ),

            unreadCount: wasUnread
              ? Math.max(0, current.unreadCount - 1)
              : current.unreadCount,

            errorMessage: null,
          };
        });

        return true;
      } catch (error) {
        setState((current) => ({
          ...current,
          errorMessage:
            error instanceof Error
              ? error.message
              : locale === "en"
                ? "The notification could not be marked as read."
                : "No se pudo marcar la notificación como leída.",
        }));

        return false;
      }
    },
    [enabled, locale, state.notifications],
  );

  useEffect(() => {
    if (!enabled) {
      clear();
    }
  }, [clear, enabled]);

  useEffect(() => {
    if (!enabled || !automaticLoad) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      void refresh();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
      abortControllerRef.current?.abort();
    };
  }, [automaticLoad, enabled, refresh]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  return {
    notifications: state.notifications,
    unreadCount: state.unreadCount,
    status: state.status,
    loading: state.status === "LOADING",
    errorMessage: state.errorMessage,
    refresh,
    markAsRead,
    clear,
  };
}