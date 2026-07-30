"use client";

import {
  useCallback,
  useEffect,
  useRef,
} from "react";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "motion/react";

import {
  useTranslations,
} from "next-intl";

import {
  AuthenticatedAccount,
} from "@/components/molecules/authenticated-account";

import type {
  AuthenticatedAccountData,
} from "@/components/molecules/authenticated-account";

import {
  LoginLink,
} from "@/components/molecules/login-link";

import {
  MobileNavItem,
} from "@/components/molecules/mobile-nav-item";

import {
  NAVIGATION_ITEMS,
} from "@/config/navigation.config";

import {
  useEscapeKey,
} from "@/hooks/use-escape-key";

import {
  useLockBodyScroll,
} from "@/hooks/use-lock-body-scroll";

import {
  usePathname,
} from "@/i18n/navigation";

import {
  useAuth,
} from "@/providers/auth-provider";

import {
  cn,
} from "@/utils/cn";

import type {
  MobileNavigationProps,
} from "./MobileNavigation.types";

const DEFAULT_PANEL_ID =
  "mobile-navigation-panel";

const FOCUSABLE_ELEMENTS_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

type UnknownRecord =
  Record<string, unknown>;

type DynamicAuthAction = (
  ...arguments_: unknown[]
) => unknown | Promise<unknown>;

function isRecord(
  value: unknown,
): value is UnknownRecord {
  return (
    typeof value === "object"
    && value !== null
    && !Array.isArray(value)
  );
}

function readNonEmptyString(
  values: readonly unknown[],
): string | null {
  for (const value of values) {
    if (
      typeof value !== "string"
    ) {
      continue;
    }

    const normalizedValue =
      value
        .trim()
        .normalize("NFC");

    if (
      normalizedValue.length > 0
    ) {
      return normalizedValue;
    }
  }

  return null;
}

function normalizeAccountRole(
  value: unknown,
): AuthenticatedAccountData["accountRole"] {
  if (
    typeof value !== "string"
  ) {
    return "USER";
  }

  const normalizedRole =
    value
      .trim()
      .toUpperCase();

  return (
    normalizedRole === "ADMIN"
    || normalizedRole === "ADMINISTRATOR"
    || normalizedRole === "ADMINISTRADOR"
  )
    ? "ADMIN"
    : "USER";
}

function getAccountRecord(
  authContext: UnknownRecord,
): UnknownRecord | null {
  if (
    isRecord(
      authContext.account,
    )
  ) {
    return authContext.account;
  }

  const session =
    isRecord(
      authContext.session,
    )
      ? authContext.session
      : null;

  if (
    isRecord(
      session?.account,
    )
  ) {
    return session.account;
  }

  const currentSession =
    isRecord(
      authContext.currentSession,
    )
      ? authContext.currentSession
      : null;

  if (
    isRecord(
      currentSession?.account,
    )
  ) {
    return currentSession.account;
  }

  return null;
}

function normalizeAuthenticatedAccount(
  authContext: UnknownRecord,
): AuthenticatedAccountData | null {
  const account =
    getAccountRecord(
      authContext,
    );

  if (
    account === null
  ) {
    return null;
  }

  const email =
    readNonEmptyString([
      account.email,
      account.emailAddress,
    ]);

  const emailUsername =
    email
      ?.split("@")[0]
      ?.trim()
    || null;

  const username =
    readNonEmptyString([
      account.username,
      account.publicUsername,
      account.alias,
      account.displayName,
      emailUsername,
    ]);

  if (
    username === null
  ) {
    return null;
  }

  const accountId =
    readNonEmptyString([
      account.accountId,
      account.id,
      account.userId,
      account.adminId,
      username,
    ]);

  if (
    accountId === null
  ) {
    return null;
  }

  return {
    accountId,
    username,

    firstNames:
      readNonEmptyString([
        account.firstNames,
        account.firstName,
        account.names,
        account.givenName,
      ]),

    lastNames:
      readNonEmptyString([
        account.lastNames,
        account.lastName,
        account.surnames,
        account.familyName,
      ]),

    imageUrl:
      readNonEmptyString([
        account.imageUrl,
        account.avatarUrl,
        account.profileImageUrl,
        account.photoUrl,
      ]),

    accountRole:
      normalizeAccountRole(
        account.accountRole
        ?? account.role,
      ),
  };
}

function isAuthenticationLoading(
  authContext: UnknownRecord,
): boolean {
  const status =
    readNonEmptyString([
      authContext.status,
      authContext.sessionStatus,
      authContext.authenticationStatus,
    ]);

  if (
    status === null
  ) {
    return false;
  }

  return [
    "LOADING",
    "INITIALIZING",
    "CHECKING",
    "PENDING",
  ].includes(
    status.toUpperCase(),
  );
}

function getUnreadNotificationsCount(
  authContext: UnknownRecord,
): number {
  const directCandidates = [
    authContext.unreadNotificationsCount,
    authContext.unreadNotifications,
    authContext.unreadCount,
  ];

  for (const candidate of directCandidates) {
    if (
      typeof candidate === "number"
      && Number.isFinite(candidate)
    ) {
      return Math.max(
        0,
        Math.trunc(candidate),
      );
    }
  }

  const notificationState =
    isRecord(
      authContext.notificationState,
    )
      ? authContext.notificationState
      : null;

  const nestedUnreadCount =
    notificationState
      ?.unreadCount;

  if (
    typeof nestedUnreadCount === "number"
    && Number.isFinite(
      nestedUnreadCount,
    )
  ) {
    return Math.max(
      0,
      Math.trunc(
        nestedUnreadCount,
      ),
    );
  }

  if (
    !Array.isArray(
      authContext.notifications,
    )
  ) {
    return 0;
  }

  return authContext.notifications.reduce<number>(
    (
      count,
      notification,
    ) => {
      if (
        !isRecord(
          notification,
        )
      ) {
        return count;
      }

      return notification.isRead === true
        ? count
        : count + 1;
    },
    0,
  );
}

function resolveAuthAction(
  authContext: UnknownRecord,
  actionNames: readonly string[],
): DynamicAuthAction | null {
  for (const actionName of actionNames) {
    const candidate =
      Reflect.get(
        authContext,
        actionName,
      );

    if (
      typeof candidate === "function"
    ) {
      return candidate as DynamicAuthAction;
    }
  }

  return null;
}

async function executeAuthAction(
  authContext: UnknownRecord,
  actionNames: readonly string[],
): Promise<boolean> {
  const action =
    resolveAuthAction(
      authContext,
      actionNames,
    );

  if (
    action === null
  ) {
    return false;
  }

  await action.call(
    authContext,
  );

  return true;
}

export function MobileNavigation({
  isOpen,
  onClose,
  id = DEFAULT_PANEL_ID,
  className,
  "aria-label": ariaLabel,
  ...navigationProps
}: MobileNavigationProps) {
  const pathname =
    usePathname();

  const translations =
    useTranslations(
      "navigation",
    );

  const prefersReducedMotion =
    useReducedMotion();

  const authContextValue =
    useAuth();

  const authContext:
    UnknownRecord =
      authContextValue as unknown as UnknownRecord;

  const authenticatedAccount =
    normalizeAuthenticatedAccount(
      authContext,
    );

  const authenticationLoading =
    isAuthenticationLoading(
      authContext,
    );

  const unreadNotificationsCount =
    getUnreadNotificationsCount(
      authContext,
    );

  const panelReference =
    useRef<HTMLElement>(
      null,
    );

  const navigationLabel =
    ariaLabel
    ?? translations(
      "mainLabel",
    );

  useEscapeKey(
    onClose,
    isOpen,
  );

  useLockBodyScroll(
    isOpen,
  );

  const handleSignOut =
    useCallback(
      async (): Promise<void> => {
        const executed =
          await executeAuthAction(
            authContext,
            [
              "signOut",
              "logout",
              "logOut",
              "closeSession",
            ],
          );

        if (
          !executed
        ) {
          throw new Error(
            "SIGN_OUT_OPERATION_NOT_AVAILABLE",
          );
        }

        onClose();
      },
      [
        authContext,
        onClose,
      ],
    );

  const handleNotificationsRequest =
    useCallback(
      async (): Promise<void> => {
        const executed =
          await executeAuthAction(
            authContext,
            [
              "openNotifications",
              "showNotifications",
              "requestNotifications",
            ],
          );

        if (
          executed
        ) {
          onClose();
        }
      },
      [
        authContext,
        onClose,
      ],
    );

  useEffect(
    () => {
      if (
        !isOpen
      ) {
        return undefined;
      }

      const panel =
        panelReference.current;

      const previouslyFocusedElement =
        document.activeElement
          instanceof HTMLElement
          ? document.activeElement
          : null;

      const getFocusableElements =
        (): HTMLElement[] => {
          if (
            !panel
          ) {
            return [];
          }

          return Array.from(
            panel.querySelectorAll<HTMLElement>(
              FOCUSABLE_ELEMENTS_SELECTOR,
            ),
          ).filter(
            (
              element,
            ) =>
              !element.hasAttribute(
                "disabled",
              )
              && element.getAttribute(
                "aria-hidden",
              ) !== "true",
          );
        };

      const focusableElements =
        getFocusableElements();

      const firstFocusableElement =
        focusableElements.at(
          0,
        );

      if (
        firstFocusableElement
      ) {
        firstFocusableElement.focus();
      } else {
        panel?.focus();
      }

      const handleTabKey =
        (
          event:
            KeyboardEvent,
        ): void => {
          if (
            event.key !== "Tab"
          ) {
            return;
          }

          const currentFocusableElements =
            getFocusableElements();

          if (
            currentFocusableElements.length
            === 0
          ) {
            event.preventDefault();
            panel?.focus();

            return;
          }

          const firstElement =
            currentFocusableElements.at(
              0,
            );

          const lastElement =
            currentFocusableElements.at(
              -1,
            );

          if (
            !firstElement
            || !lastElement
          ) {
            return;
          }

          if (
            event.shiftKey
            && document.activeElement
              === firstElement
          ) {
            event.preventDefault();
            lastElement.focus();

            return;
          }

          if (
            !event.shiftKey
            && document.activeElement
              === lastElement
          ) {
            event.preventDefault();
            firstElement.focus();
          }
        };

      document.addEventListener(
        "keydown",
        handleTabKey,
      );

      return () => {
        document.removeEventListener(
          "keydown",
          handleTabKey,
        );

        previouslyFocusedElement
          ?.focus();
      };
    },
    [
      isOpen,
    ],
  );

  const animationDuration =
    prefersReducedMotion
      ? 0
      : 0.3;

  return (
    <AnimatePresence
      initial={false}
    >
      {isOpen ? (
        <motion.div
          key="mobile-navigation-overlay"
          role="presentation"
          initial={{
            opacity:
              0,
          }}
          animate={{
            opacity:
              1,
          }}
          exit={{
            opacity:
              0,
          }}
          transition={{
            duration:
              prefersReducedMotion
                ? 0
                : 0.18,

            ease:
              "easeOut",
          }}
          onPointerDown={
            (
              event,
            ) => {
              if (
                event.target
                === event.currentTarget
              ) {
                onClose();
              }
            }
          }
          className={cn(
            "fixed inset-0 z-40 xl:hidden",
          
            "bg-black/10",
            "backdrop-blur-[1px]",
          
            "dark:bg-black/20",
          )}
        >
          <motion.aside
            ref={
              panelReference
            }
            id={id}
            role="dialog"
            aria-modal="true"
            aria-label={
              navigationLabel
            }
            tabIndex={-1}
            initial={{
              opacity:
                0,

              x:
                prefersReducedMotion
                  ? 0
                  : 32,

              scale:
                prefersReducedMotion
                  ? 1
                  : 0.98,
            }}
            animate={{
              opacity:
                1,

              x:
                0,

              scale:
                1,
            }}
            exit={{
              opacity:
                0,

              x:
                prefersReducedMotion
                  ? 0
                  : 32,

              scale:
                prefersReducedMotion
                  ? 1
                  : 0.98,
            }}
            transition={{
              duration:
                animationDuration,

              ease:
                [
                  0.22,
                  1,
                  0.36,
                  1,
                ],
            }}
            data-state="open"
            className={cn(
              "absolute right-3",
              "top-[calc(5.25rem+env(safe-area-inset-top))]",
              "bottom-[calc(1.75rem+env(safe-area-inset-bottom))]",

              "flex w-[48vw] min-w-[11.5rem] max-w-[15rem]",
              "flex-col overflow-y-auto overscroll-contain",
              "[scrollbar-gutter:stable]",

              "rounded-2xl border",
              "border-[#393939]/10",

            
              "bg-white/55",
              "px-2.5 py-3",
              "backdrop-blur-2xl",

              "shadow-[-12px_12px_38px_rgba(12,15,12,0.14)]",

              "sm:right-4",
              "sm:top-[calc(5.5rem+env(safe-area-inset-top))]",
              "sm:bottom-[calc(2rem+env(safe-area-inset-bottom))]",
              "sm:w-[44vw]",
              "sm:max-w-[17rem]",
              "sm:px-3",

              "dark:border-white/10",
              "dark:bg-[#0f120f]/65",
              "dark:shadow-[-12px_12px_42px_rgba(0,0,0,0.35)]",

              "focus:outline-none",
              className,
            )}
          >
            <nav
              {...navigationProps}
              aria-label={
                navigationLabel
              }
              className="flex min-h-0 flex-1 flex-col"
            >
              <ul className="flex flex-col gap-1.5">
                {NAVIGATION_ITEMS.map(
                  (
                    item,
                  ) => {
                    const isActive =
                      pathname
                      === item.href;

                    return (
                      <MobileNavItem
                        key={
                          item.id
                        }
                        item={item}
                        label={
                          translations(
                            item.labelKey,
                          )
                        }
                        isActive={
                          isActive
                        }
                        onNavigate={
                          onClose
                        }
                      />
                    );
                  },
                )}
              </ul>

              <div
                className={cn(
                  "mt-4 border-t pt-3",
                  "border-[#393939]/10",
                  "dark:border-white/10",
                )}
              >
                {authenticatedAccount ? (
                  <AuthenticatedAccount
                    account={
                      authenticatedAccount
                    }
                    accountControlId="mobile-authenticated-account"
                    unreadNotificationsCount={
                      unreadNotificationsCount
                    }
                    onRequestNotifications={
                      () => {
                        void handleNotificationsRequest();
                      }
                    }
                    onRequestSignOut={
                      handleSignOut
                    }
                  />
                ) : authenticationLoading ? null : (
                  <LoginLink
                    label={
                      translations(
                        "signIn",
                      )
                    }
                    variant="mobile"
                    onNavigate={
                      onClose
                    }
                  />
                )}
              </div>
            </nav>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}