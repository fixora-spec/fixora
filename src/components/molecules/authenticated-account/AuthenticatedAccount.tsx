"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import {
  useTranslations,
} from "next-intl";

import {
  AccountAvatar,
} from "@/components/atoms/account-avatar";

import type {
  AuthenticatedAccountProps,
  AuthenticatedAccountSignOutStatus,
  AuthenticatedAccountView,
} from "./AuthenticatedAccount.types";

function normalizeGeneratedId(
  value:
    string,
): string {
  return value.replace(
    /[^A-Za-z0-9_-]/gu,
    "",
  );
}

function normalizeUnreadCount(
  value:
    number,
): number {
  if (
    !Number.isFinite(
      value,
    )
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.trunc(
      value,
    ),
  );
}

function createDisplayName({
  username,
  firstNames,
  lastNames,
}: AuthenticatedAccountProps[
  "account"
]): string {
  const completeName =
    [
      firstNames
        ?.trim(),

      lastNames
        ?.trim(),
    ]
      .filter(Boolean)
      .join(" ")
      .normalize("NFC");

  return (
    completeName
    || username
      .trim()
      .normalize("NFC")
  );
}

export function AuthenticatedAccount({
  account,
  accountControlId,
  disabled = false,
  unreadNotificationsCount = 0,
  onRequestProfile,
  onRequestNotifications,
  onRequestCart,
  onRequestSignOut,
  onMenuOpenChange,
  onViewChange,
}: AuthenticatedAccountProps) {
  const translations =
    useTranslations(
      "auth.authenticatedAccount",
    );

  const generatedId =
    useId();

  const resolvedControlId =
    accountControlId
    ?? `authenticated-account-${normalizeGeneratedId(
      generatedId,
    )}`;

  const menuId =
    `${resolvedControlId}-menu`;

  const panelId =
    `${resolvedControlId}-panel`;

  const messageId =
    `${resolvedControlId}-message`;

  const containerReference =
    useRef<
      HTMLDivElement | null
    >(
      null,
    );

  const [
    menuOpen,
    setMenuOpen,
  ] = useState(
    false,
  );

  const [
    activeView,
    setActiveView,
  ] = useState<
    AuthenticatedAccountView
  >(
    "NONE",
  );

  const [
    signOutStatus,
    setSignOutStatus,
  ] = useState<
    AuthenticatedAccountSignOutStatus
  >(
    "IDLE",
  );

  const [
    errorMessage,
    setErrorMessage,
  ] = useState<
    string | null
  >(
    null,
  );

  const displayName =
    createDisplayName(
      account,
    );

  const normalizedUnreadCount =
    normalizeUnreadCount(
      unreadNotificationsCount,
    );

  const signingOut =
    signOutStatus
    === "SUBMITTING";

  const controlsDisabled =
    disabled
    || signingOut;

  const changeMenuOpen =
    useCallback(
      (
        nextOpen:
          boolean,
      ): void => {
        setMenuOpen(
          nextOpen,
        );

        onMenuOpenChange?.(
          nextOpen,
        );
      },
      [
        onMenuOpenChange,
      ],
    );

  const changeActiveView =
    useCallback(
      (
        nextView:
          AuthenticatedAccountView,
      ): void => {
        setActiveView(
          nextView,
        );

        onViewChange?.(
          nextView,
        );
      },
      [
        onViewChange,
      ],
    );

  const closeAccountControl =
    useCallback(
      (): void => {
        changeMenuOpen(
          false,
        );

        changeActiveView(
          "NONE",
        );

        setErrorMessage(
          null,
        );

        if (
          signOutStatus
          === "ERROR"
        ) {
          setSignOutStatus(
            "IDLE",
          );
        }
      },
      [
        changeActiveView,
        changeMenuOpen,
        signOutStatus,
      ],
    );

  useEffect(
    () => {
      if (
        !menuOpen
        && activeView
          === "NONE"
      ) {
        return undefined;
      }

      const handlePointerDown =
        (
          event:
            MouseEvent,
        ): void => {
          const container =
            containerReference
              .current;

          if (
            !container
            || container.contains(
              event.target as Node,
            )
          ) {
            return;
          }

          closeAccountControl();
        };

      const handleKeyDown =
        (
          event:
            KeyboardEvent,
        ): void => {
          if (
            event.key
            !== "Escape"
          ) {
            return;
          }

          event.preventDefault();

          closeAccountControl();
        };

      document.addEventListener(
        "mousedown",
        handlePointerDown,
      );

      document.addEventListener(
        "keydown",
        handleKeyDown,
      );

      return () => {
        document.removeEventListener(
          "mousedown",
          handlePointerDown,
        );

        document.removeEventListener(
          "keydown",
          handleKeyDown,
        );
      };
    },
    [
      menuOpen,
      activeView,
      closeAccountControl,
    ],
  );

  const handleMenuToggle =
    (): void => {
      if (
        controlsDisabled
      ) {
        return;
      }

      const nextOpen =
        !menuOpen;

      changeMenuOpen(
        nextOpen,
      );

      if (!nextOpen) {
        changeActiveView(
          "NONE",
        );
      }

      setErrorMessage(
        null,
      );
    };

  const handleProfileRequest =
    (): void => {
      if (
        controlsDisabled
      ) {
        return;
      }

      changeMenuOpen(
        false,
      );

      changeActiveView(
        "PROFILE",
      );

      onRequestProfile?.();
    };

  const handleNotificationsRequest =
    (): void => {
      if (
        controlsDisabled
      ) {
        return;
      }

      changeMenuOpen(
        false,
      );

      changeActiveView(
        "NOTIFICATIONS",
      );

      onRequestNotifications?.();
    };

  const handleCartRequest =
    (): void => {
      if (
        controlsDisabled
      ) {
        return;
      }

      changeMenuOpen(
        false,
      );

      changeActiveView(
        "CART",
      );

      onRequestCart?.();
    };

  const handleSignOut =
    async (): Promise<void> => {
      if (
        controlsDisabled
      ) {
        return;
      }

      setSignOutStatus(
        "SUBMITTING",
      );

      setErrorMessage(
        null,
      );

      try {
        await onRequestSignOut();

        changeMenuOpen(
          false,
        );

        changeActiveView(
          "NONE",
        );

        setSignOutStatus(
          "IDLE",
        );
      } catch (error) {
        setSignOutStatus(
          "ERROR",
        );

        setErrorMessage(
          error instanceof Error
            ? error.message
            : translations(
                "errors.signOutFailed",
              ),
        );
      }
    };

  return (
    <div
      ref={
        containerReference
      }
      id={
        resolvedControlId
      }
      data-authenticated-account=""
      data-account-role={
        account.accountRole
      }
      data-account-menu-open={
        menuOpen
          ? "true"
          : "false"
      }
      data-account-active-view={
        activeView.toLowerCase()
      }
    >
      <div>
        <AccountAvatar
          imageUrl={
            account.imageUrl
          }
          username={
            account.username
          }
          firstNames={
            account.firstNames
          }
          lastNames={
            account.lastNames
          }
          accountRole={
            account.accountRole
          }
          alternativeText={
            translations(
              "avatarAlternativeText",
              {
                name:
                  displayName,
              },
            )
          }
        />

        <span>
          {account.username}
        </span>

        <button
          type="button"
          disabled={
            controlsDisabled
          }
          aria-label={
            translations(
              menuOpen
                ? "actions.closeMenu"
                : "actions.openMenu",
            )
          }
          aria-haspopup="menu"
          aria-expanded={
            menuOpen
          }
          aria-controls={
            menuId
          }
          onClick={
            handleMenuToggle
          }
        >
          ⋮
        </button>
      </div>

      {menuOpen ? (
        <div
          id={menuId}
          role="menu"
          aria-label={
            translations(
              "menu.label",
            )
          }
        >
          <button
            type="button"
            role="menuitem"
            disabled={
              controlsDisabled
            }
            onClick={
              handleProfileRequest
            }
          >
            {translations(
              "menu.profile",
            )}
          </button>

          <button
            type="button"
            role="menuitem"
            disabled={
              controlsDisabled
            }
            onClick={
              handleNotificationsRequest
            }
          >
            {translations(
              "menu.notifications",
            )}

            {normalizedUnreadCount
              > 0 ? (
              <span>
                {
                  normalizedUnreadCount
                }
              </span>
            ) : null}
          </button>

          <button
            type="button"
            role="menuitem"
            disabled={
              controlsDisabled
            }
            onClick={
              handleCartRequest
            }
          >
            {translations(
              "menu.cart",
            )}
          </button>

          <button
            type="button"
            role="menuitem"
            disabled={
              controlsDisabled
            }
            onClick={
              () => {
                void handleSignOut();
              }
            }
          >
            {signingOut
              ? translations(
                  "actions.signingOut",
                )
              : translations(
                  "menu.signOut",
                )}
          </button>
        </div>
      ) : null}

      {activeView
        !== "NONE" ? (
        <section
          id={panelId}
          aria-live="polite"
          aria-labelledby={
            `${panelId}-title`
          }
        >
          <header>
            <h2
              id={
                `${panelId}-title`
              }
            >
              {translations(
                `panels.${activeView.toLowerCase()}.title`,
              )}
            </h2>

            <button
              type="button"
              disabled={
                controlsDisabled
              }
              onClick={
                closeAccountControl
              }
            >
              {translations(
                "actions.closePanel",
              )}
            </button>
          </header>

          {activeView
            === "PROFILE" ? (
            <p>
              {translations(
                "panels.profile.empty",
              )}
            </p>
          ) : null}

          {activeView
            === "NOTIFICATIONS" ? (
            <p>
              {translations(
                "panels.notifications.loading",
              )}
            </p>
          ) : null}

          {activeView
            === "CART" ? (
            <p>
              {translations(
                "panels.cart.empty",
              )}
            </p>
          ) : null}
        </section>
      ) : null}

      {errorMessage ? (
        <p
          id={messageId}
          role="alert"
          aria-live="assertive"
        >
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}