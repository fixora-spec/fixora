"use client";

import {
  useCallback,
  useState,
} from "react";

import {
  Menu,
  X,
} from "lucide-react";

import {
  useTranslations,
} from "next-intl";

import {
  BrandLogo,
} from "@/components/atoms/brand-logo";

import {
  MenuTrigger,
} from "@/components/atoms/menu-trigger";

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
  DesktopNavigation,
} from "@/components/organisms/desktop-navigation";

import {
  MobileNavigation,
} from "@/components/organisms/mobile-navigation";

import {
  Link,
} from "@/i18n/navigation";

import {
  useAuth,
} from "@/providers/auth-provider";

import {
  cn,
} from "@/utils/cn";

import type {
  PublicHeaderProps,
} from "./PublicHeader.types";

const DEFAULT_MOBILE_NAVIGATION_ID =
  "mobile-navigation-panel";

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

export function PublicHeader({
  logoAlt = "Fixora",
  mobileNavigationId =
    DEFAULT_MOBILE_NAVIGATION_ID,
  className,
  ...headerProps
}: PublicHeaderProps) {
  const [
    isMobileMenuOpen,
    setIsMobileMenuOpen,
  ] = useState(
    false,
  );

  const translations =
    useTranslations(
      "navigation",
    );

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

  const openMobileMenu =
    useCallback(
      (): void => {
        setIsMobileMenuOpen(
          true,
        );
      },
      [],
    );

  const closeMobileMenu =
    useCallback(
      (): void => {
        setIsMobileMenuOpen(
          false,
        );
      },
      [],
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
      },
      [
        authContext,
      ],
    );

  const handleNotificationsRequest =
    useCallback(
      (): void => {
        void executeAuthAction(
          authContext,
          [
            "openNotifications",
            "showNotifications",
            "requestNotifications",
          ],
        );
      },
      [
        authContext,
      ],
    );

  return (
    <>
      <header
        {...headerProps}
        className={cn(
          "sticky top-0 z-50 w-full",
          "px-4 pt-4",
          "sm:px-6 sm:pt-5",
          "lg:px-8",
          "xl:px-10",
          className,
        )}
      >
        <div
          className={cn(
            "mx-auto flex min-h-16 w-full",
            "max-w-[1600px] items-center justify-between gap-4",
            "xl:grid",
            "xl:grid-cols-[1fr_auto_1fr]",
            "xl:gap-6",
          )}
        >
          <Link
            href="/"
            aria-label={
              translations(
                "home",
              )
            }
            title={
              translations(
                "home",
              )
            }
            onClick={
              closeMobileMenu
            }
            className={cn(
              "inline-flex shrink-0 items-center rounded-md",
              "focus-visible:outline-none",
              "focus-visible:ring-2",
              "focus-visible:ring-[#4ead35]",
              "focus-visible:ring-offset-4",
              "focus-visible:ring-offset-[#fdfefe]",
              "dark:focus-visible:ring-[#57af33]",
              "dark:focus-visible:ring-offset-[#0c0f0c]",
              "xl:justify-self-start",
            )}
          >
            <BrandLogo
              variant="auto"
              size="lg"
              alt={logoAlt}
              loading="eager"
              className={cn(
                "w-24",
                "sm:w-28",
                "xl:w-36",
              )}
              imageClassName={cn(
                "drop-shadow-[0_5px_8px_rgba(57,57,57,0.14)]",
                "dark:drop-shadow-[0_5px_10px_rgba(255,255,255,0.08)]",
              )}
            />
          </Link>

          <DesktopNavigation
            className="xl:justify-self-center"
          />

          <div
            className={cn(
              "flex shrink-0 items-center gap-2",
              "xl:justify-self-end",
            )}
          >
            <div className="xl:hidden">
              <MenuTrigger
                isOpen={
                  isMobileMenuOpen
                }
                openLabel={
                  translations(
                    "openMenu",
                  )
                }
                closeLabel={
                  translations(
                    "closeMenu",
                  )
                }
                controlsId={
                  mobileNavigationId
                }
                openIcon={Menu}
                closeIcon={X}
                variant="navigation"
                size="md"
                onClick={
                  isMobileMenuOpen
                    ? closeMobileMenu
                    : openMobileMenu
                }
              />
            </div>

            <div className="hidden xl:block">
              {authenticatedAccount ? (
                <AuthenticatedAccount
                  account={
                    authenticatedAccount
                  }
                  accountControlId="desktop-authenticated-account"
                  unreadNotificationsCount={
                    unreadNotificationsCount
                  }
                  onRequestNotifications={
                    handleNotificationsRequest
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
                  variant="desktop"
                />
              )}
            </div>
          </div>
        </div>
      </header>

      <MobileNavigation
        id={
          mobileNavigationId
        }
        isOpen={
          isMobileMenuOpen
        }
        onClose={
          closeMobileMenu
        }
      />
    </>
  );
}