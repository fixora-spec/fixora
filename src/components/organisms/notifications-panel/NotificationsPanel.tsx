"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
} from "react";

import {
  useLocale,
  useTranslations,
} from "next-intl";

import {
  useNotifications,
} from "@/hooks/use-notifications";

import {
  useAuth,
} from "@/providers/auth-provider";

import type {
  NotificationHookItem,
} from "@/hooks/use-notifications";

import type {
  NotificationsPanelProps,
} from "./NotificationsPanel.types";

function formatNotificationDate(
  dateValue: string,
  formatter: Intl.DateTimeFormat,
): string {
  const parsedDate =
    new Date(dateValue);

  if (
    Number.isNaN(
      parsedDate.getTime(),
    )
  ) {
    return dateValue;
  }

  return formatter.format(
    parsedDate,
  );
}

export function NotificationsPanel({
  panelId,
  open = true,
  disabled = false,
  automaticLoad = true,
  onClose,
  onNotificationRead,
}: NotificationsPanelProps) {
  const translations =
    useTranslations(
      "auth.notifications",
    );

  const locale =
    useLocale();

  const {
    authenticated,
  } = useAuth();

  const generatedPanelId =
    useId();

  const resolvedPanelId =
    panelId
    ?? `notifications-panel-${generatedPanelId}`;

  const panelReference =
    useRef<HTMLElement | null>(
      null,
    );

  const {
    notifications,
    unreadCount,
    status,
    loading,
    errorMessage,
    refresh,
    markAsRead,
  } = useNotifications({
    enabled:
      authenticated
      && open
      && !disabled,

    automaticLoad,
  });

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

  const closePanel =
    useCallback(
      (): void => {
        onClose?.();
      },
      [
        onClose,
      ],
    );

  const handleNotificationRead =
    useCallback(
      async (
        notification:
          NotificationHookItem,
      ): Promise<void> => {
        if (
          disabled
          || notification.isRead
        ) {
          return;
        }

        const markedAsRead =
          await markAsRead(
            notification
              .notificationId,
          );

        if (!markedAsRead) {
          return;
        }

        onNotificationRead?.({
          ...notification,

          isRead:
            true,

          readAt:
            notification.readAt
            ?? new Date()
              .toISOString(),
        });
      },
      [
        disabled,
        markAsRead,
        onNotificationRead,
      ],
    );

  useEffect(
    () => {
      if (!open) {
        return undefined;
      }

      const previouslyFocusedElement =
        document.activeElement
          instanceof HTMLElement
          ? document.activeElement
          : null;

      panelReference.current
        ?.focus();

      return () => {
        previouslyFocusedElement
          ?.focus();
      };
    },
    [
      open,
    ],
  );

  useEffect(
    () => {
      if (!open) {
        return undefined;
      }

      const previousOverflow =
        document.body.style.overflow;

      document.body.style.overflow =
        "hidden";

      return () => {
        document.body.style.overflow =
          previousOverflow;
      };
    },
    [
      open,
    ],
  );

  useEffect(
    () => {
      if (!open) {
        return undefined;
      }

      const handleKeyDown =
        (
          event:
            KeyboardEvent,
        ): void => {
          if (
            event.key !== "Escape"
          ) {
            return;
          }

          event.preventDefault();

          closePanel();
        };

      document.addEventListener(
        "keydown",
        handleKeyDown,
      );

      return () => {
        document.removeEventListener(
          "keydown",
          handleKeyDown,
        );
      };
    },
    [
      open,
      closePanel,
    ],
  );

  if (!open) {
    return null;
  }

  return (
    <section
      ref={
        panelReference
      }
      id={resolvedPanelId}
      role="dialog"
      tabIndex={-1}
      aria-modal="true"
      aria-labelledby={
        `${resolvedPanelId}-title`
      }
      aria-busy={loading}
      data-notifications-panel=""
      data-notifications-open="true"
      className={[
        "fixed inset-0 z-[100]",
        "overflow-y-auto overscroll-contain",
        "bg-[var(--fixora-background)]",
        "text-[var(--fixora-foreground)]",
      ].join(
        " ",
      )}
    >
      <header>
        <h2
          id={
            `${resolvedPanelId}-title`
          }
        >
          {translations(
            "title",
          )}
        </h2>

        <p>
          {translations(
            "unreadCount",
            {
              count:
                unreadCount,
            },
          )}
        </p>

        {onClose ? (
          <button
            type="button"
            disabled={disabled}
            aria-label={
              translations(
                "actions.close",
              )
            }
            onClick={
              closePanel
            }
          >
            {translations(
              "actions.close",
            )}
          </button>
        ) : null}
      </header>

      {!authenticated ? (
        <p role="status">
          {translations(
            "messages.signInRequired",
          )}
        </p>
      ) : null}

      {authenticated
      && status === "LOADING"
      && notifications.length
        === 0 ? (
        <p
          role="status"
          aria-live="polite"
        >
          {translations(
            "messages.loading",
          )}
        </p>
      ) : null}

      {authenticated
      && status === "ERROR"
      && errorMessage ? (
        <div role="alert">
          <p>
            {errorMessage}
          </p>

          <button
            type="button"
            disabled={
              disabled
              || loading
            }
            onClick={
              () => {
                void refresh();
              }
            }
          >
            {translations(
              "actions.retry",
            )}
          </button>
        </div>
      ) : null}

      {authenticated
      && status !== "LOADING"
      && notifications.length
        === 0
      && !errorMessage ? (
        <p role="status">
          {translations(
            "messages.empty",
          )}
        </p>
      ) : null}

      {notifications.length
        > 0 ? (
        <ul>
          {notifications.map(
            (
              notification,
            ) => {
              const titleId =
                `${resolvedPanelId}-${notification.notificationId}-title`;

              const messageId =
                `${resolvedPanelId}-${notification.notificationId}-message`;

              const dateId =
                `${resolvedPanelId}-${notification.notificationId}-date`;

              return (
                <li
                  key={
                    notification
                      .notificationId
                  }
                  data-notification-read={
                    notification.isRead
                      ? "true"
                      : "false"
                  }
                >
                  <article
                    aria-labelledby={
                      titleId
                    }
                    aria-describedby={
                      [
                        messageId,
                        dateId,
                      ].join(" ")
                    }
                  >
                    <h3
                      id={titleId}
                    >
                      {
                        notification
                          .title
                      }
                    </h3>

                    <p
                      id={messageId}
                    >
                      {
                        notification
                          .message
                      }
                    </p>

                    <time
                      id={dateId}
                      dateTime={
                        notification
                          .createdAt
                      }
                    >
                      {formatNotificationDate(
                        notification
                          .createdAt,
                        dateFormatter,
                      )}
                    </time>

                    {!notification
                      .isRead ? (
                      <button
                        type="button"
                        disabled={
                          disabled
                          || loading
                        }
                        onClick={
                          () => {
                            void handleNotificationRead(
                              notification,
                            );
                          }
                        }
                      >
                        {translations(
                          "actions.markAsRead",
                        )}
                      </button>
                    ) : (
                      <p>
                        {translations(
                          "messages.read",
                        )}
                      </p>
                    )}
                  </article>
                </li>
              );
            },
          )}
        </ul>
      ) : null}

      {authenticated
      && notifications.length
        > 0 ? (
        <button
          type="button"
          disabled={
            disabled
            || loading
          }
          onClick={
            () => {
              void refresh();
            }
          }
        >
          {loading
            ? translations(
                "actions.refreshing",
              )
            : translations(
                "actions.refresh",
              )}
        </button>
      ) : null}
    </section>
  );
}