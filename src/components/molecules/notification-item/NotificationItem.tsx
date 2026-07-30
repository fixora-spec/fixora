"use client";

import {
  useId,
  useMemo,
  useState,
} from "react";

import {
  useLocale,
  useTranslations,
} from "next-intl";

import type {
  NotificationHookItem,
} from "@/hooks/use-notifications";

import type {
  NotificationItemProps,
  NotificationItemReadStatus,
} from "./NotificationItem.types";

function normalizeGeneratedId(
  value: string,
): string {
  return value.replace(
    /[^A-Za-z0-9_-]/gu,
    "",
  );
}

function formatNotificationDate(
  value: string,
  formatter: Intl.DateTimeFormat,
): string {
  const parsedDate =
    new Date(value);

  if (
    Number.isNaN(
      parsedDate.getTime(),
    )
  ) {
    return value;
  }

  return formatter.format(
    parsedDate,
  );
}

function createReadNotification(
  notification:
    NotificationHookItem,
): NotificationHookItem {
  return {
    ...notification,

    isRead:
      true,

    readAt:
      notification.readAt
      ?? new Date().toISOString(),
  };
}

export function NotificationItem({
  notification,
  itemId,
  disabled = false,
  showReadStatus = true,
  onRequestRead,
  onReadSuccess,
  onReadError,
  ...articleProperties
}: NotificationItemProps) {
  const translations =
    useTranslations(
      "auth.notifications",
    );

  const locale =
    useLocale();

  const generatedId =
    useId();

  const resolvedItemId =
    itemId
    ?? `notification-item-${normalizeGeneratedId(
      generatedId,
    )}`;

  const titleId =
    `${resolvedItemId}-title`;

  const messageId =
    `${resolvedItemId}-message`;

  const createdAtId =
    `${resolvedItemId}-created-at`;

  const readStatusId =
    `${resolvedItemId}-read-status`;

  const errorMessageId =
    `${resolvedItemId}-error`;

  const [
    readStatus,
    setReadStatus,
  ] = useState<
    NotificationItemReadStatus
  >(
    "IDLE",
  );

  const [
    locallyRead,
    setLocallyRead,
  ] = useState(
    false,
  );

  const [
    errorMessage,
    setErrorMessage,
  ] = useState<
    string | null
  >(
    null,
  );

  const dateFormatter =
    useMemo(
      () =>
        new Intl.DateTimeFormat(
          locale,
          {
            dateStyle:
              "medium",

            timeStyle:
              "short",
          },
        ),
      [
        locale,
      ],
    );

  const formattedCreatedAt =
    useMemo(
      () =>
        formatNotificationDate(
          notification.createdAt,
          dateFormatter,
        ),
      [
        notification.createdAt,
        dateFormatter,
      ],
    );

  const formattedReadAt =
    useMemo(
      () => {
        if (
          !notification.readAt
        ) {
          return null;
        }

        return formatNotificationDate(
          notification.readAt,
          dateFormatter,
        );
      },
      [
        notification.readAt,
        dateFormatter,
      ],
    );

  const isRead =
    notification.isRead
    || locallyRead;

  const submitting =
    readStatus
    === "SUBMITTING";

  const controlsDisabled =
    disabled
    || submitting;

  const handleReadRequest =
    async (): Promise<void> => {
      if (
        controlsDisabled
        || isRead
        || !onRequestRead
      ) {
        return;
      }

      setReadStatus(
        "SUBMITTING",
      );

      setErrorMessage(
        null,
      );

      try {
        await onRequestRead(
          notification,
        );

        const updatedNotification =
          createReadNotification(
            notification,
          );

        setLocallyRead(
          true,
        );

        setReadStatus(
          "SUCCESS",
        );

        onReadSuccess?.(
          updatedNotification,
        );
      } catch (error) {
        setReadStatus(
          "ERROR",
        );

        setErrorMessage(
          error instanceof Error
            ? error.message
            : translations(
                "errors.markAsReadFailed",
              ),
        );

        onReadError?.(
          error,
          notification,
        );
      }
    };

  const describedBy =
    [
      messageId,
      createdAtId,
      showReadStatus
        ? readStatusId
        : undefined,
      errorMessage
        ? errorMessageId
        : undefined,
    ]
      .filter(
        (
          value,
        ): value is string =>
          Boolean(value),
      )
      .join(" ");

  return (
    <article
      {...articleProperties}
      id={resolvedItemId}
      aria-labelledby={
        titleId
      }
      aria-describedby={
        describedBy
      }
      aria-busy={
        submitting
      }
      data-notification-item=""
      data-notification-id={
        notification.notificationId
      }
      data-notification-read={
        isRead
          ? "true"
          : "false"
      }
      data-notification-read-status={
        readStatus.toLowerCase()
      }
    >
      <header>
        <h3 id={titleId}>
          {notification.title}
        </h3>
      </header>

      <p id={messageId}>
        {notification.message}
      </p>

      <time
        id={createdAtId}
        dateTime={
          notification.createdAt
        }
      >
        {formattedCreatedAt}
      </time>

      {showReadStatus ? (
        <p
          id={readStatusId}
          role="status"
          aria-live="polite"
        >
          {isRead
            ? translations(
                "messages.read",
              )
            : translations(
                "messages.unread",
              )}

          {isRead
          && formattedReadAt ? (
            <>
              {" "}
              {translations(
                "messages.readAt",
                {
                  time:
                    formattedReadAt,
                },
              )}
            </>
          ) : null}
        </p>
      ) : null}

      {!isRead
      && onRequestRead ? (
        <button
          type="button"
          disabled={
            controlsDisabled
          }
          onClick={
            () => {
              void handleReadRequest();
            }
          }
        >
          {submitting
            ? translations(
                "actions.markingAsRead",
              )
            : translations(
                "actions.markAsRead",
              )}
        </button>
      ) : null}

      {errorMessage ? (
        <p
          id={errorMessageId}
          role="alert"
          aria-live="assertive"
        >
          {errorMessage}
        </p>
      ) : null}
    </article>
  );
}