"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useTransition,
  type WheelEvent as ReactWheelEvent,
} from "react";

import {
  EllipsisVertical,
  Moon,
  Sun,
  X,
} from "lucide-react";

import {
  useLocale,
  useTranslations,
} from "next-intl";

import {
  MenuTrigger,
} from "@/components/atoms/menu-trigger";

import {
  QuickActionItem,
} from "@/components/molecules/quick-action-item";

import {
  AssistantPanel,
} from "@/components/organisms/assistant-panel";

import {
  NotificationsPanel,
} from "@/components/organisms/notifications-panel/NotificationsPanel";

import {
  ACCOUNT_QUICK_ACTIONS,
  PUBLIC_QUICK_ACTIONS,
  QUICK_ACTIONS_LAYOUT,
} from "@/config/quick-actions.config";

import {
  useClickOutside,
} from "@/hooks/use-click-outside";

import {
  useEscapeKey,
} from "@/hooks/use-escape-key";

import {
  useMediaQuery,
} from "@/hooks/use-media-query";

import {
  useNotifications,
} from "@/hooks/use-notifications";

import {
  useQuickActionsCarousel,
} from "@/hooks/use-quick-actions-carousel";

import {
  usePathname,
  useRouter,
} from "@/i18n/navigation";

import {
  useAuth,
} from "@/providers/auth-provider";

import {
  useTheme,
} from "@/providers/theme-provider";

import type {
  Locale,
} from "@/types/locale";

import type {
  QuickAction,
  QuickActionId,
  QuickActionPosition,
} from "@/types/quick-action";

import {
  cn,
} from "@/utils/cn";

import type {
  QuickActionsMenuProps,
} from "./QuickActionsMenu.types";

const ACTIONS_CONTAINER_ID =
  "fixora-quick-actions";

const MOBILE_POSITIONS = [
  {
    x: 0,
    y: -126,
  },
  {
    x: 66,
    y: -108,
  },
  {
    x: 108,
    y: -66,
  },
  {
    x: 126,
    y: 0,
  },
] as const;

const DESKTOP_POSITIONS = [
  {
    x: 0,
    y: -160,
  },
  {
    x: 84,
    y: -138,
  },
  {
    x: 138,
    y: -84,
  },
  {
    x: 160,
    y: 0,
  },
] as const;

function getAccountActionLabel(
  actionId: QuickActionId,
  locale: Locale,
): string | undefined {
  const english =
    locale === "en";

  switch (
    actionId
  ) {
    case "profile":
      return english
        ? "Profile"
        : "Perfil";

    case "notifications":
      return english
        ? "Notifications"
        : "Notificaciones";

    case "cart":
      return english
        ? "Cart"
        : "Carrito";

    case "logout":
      return english
        ? "Sign out"
        : "Cerrar sesión";

    default:
      return undefined;
  }
}

function formatNotificationBadge(
  unreadCount: number,
): string | undefined {
  if (
    unreadCount <= 0
  ) {
    return undefined;
  }

  return unreadCount > 99
    ? "99+"
    : String(
        unreadCount,
      );
}

export function QuickActionsMenu({
  className,
  ...containerProps
}: QuickActionsMenuProps) {
  const containerRef =
    useRef<HTMLDivElement>(
      null,
    );

  const wheelDeltaRef =
    useRef(
      0,
    );

  const [
    isOpen,
    setIsOpen,
  ] = useState(
    false,
  );

  const [
    isAssistantOpen,
    setIsAssistantOpen,
  ] = useState(
    false,
  );

  const [
    isNotificationsOpen,
    setIsNotificationsOpen,
  ] = useState(
    false,
  );

  const [
    ,
    startLocaleTransition,
  ] = useTransition();

  const isDesktop =
    useMediaQuery(
      "(min-width: 768px)",
    );

  const locale =
    useLocale() as Locale;

  const pathname =
    usePathname();

  const router =
    useRouter();

  const {
    resolvedTheme,
    toggleTheme,
  } = useTheme();

  const {
    authenticated:
      isAuthenticated,

    panelOpen:
      isAuthenticationOpen,

    signOut,
  } = useAuth();

  const {
    unreadCount:
      unreadNotificationsCount,

    refresh:
      refreshNotifications,
  } = useNotifications({
    enabled:
      isAuthenticated,

    automaticLoad:
      true,
  });

  const availableActions =
    useMemo<readonly QuickAction[]>(
      () => {
        if (
          isAuthenticationOpen
        ) {
          return PUBLIC_QUICK_ACTIONS.filter(
            (
              action,
            ) =>
              action.id === "appearance"
              || action.id === "language",
          );
        }

        return isAuthenticated
          ? [
              ...PUBLIC_QUICK_ACTIONS,
              ...ACCOUNT_QUICK_ACTIONS,
            ]
          : [
              ...PUBLIC_QUICK_ACTIONS,
            ];
      },
      [
        isAuthenticated,
        isAuthenticationOpen,
      ],
    );

  const translations =
    useTranslations(
      "quickActions",
    );

  const themeTranslations =
    useTranslations(
      "theme",
    );

  const languageTranslations =
    useTranslations(
      "language",
    );

  const {
    visibleActions,
    showPrevious,
    showNext,
  } = useQuickActionsCarousel({
    actions:
      availableActions,
  });

  const positions =
    useMemo<QuickActionPosition[]>(
      () => {
        const source =
          isDesktop
            ? DESKTOP_POSITIONS
            : MOBILE_POSITIONS;

        return source.map(
          (
            position,
            index,
          ) => ({
            index,
            angle:
              0,
            x:
              position.x,
            y:
              position.y,
          }),
        );
      },
      [
        isDesktop,
      ],
    );

  const closeMenu =
    useCallback(
      (): void => {
        setIsOpen(
          false,
        );

        wheelDeltaRef.current =
          0;
      },
      [],
    );

  const toggleMenu =
    useCallback(
      (): void => {
        setIsOpen(
          (
            currentState,
          ) =>
            !currentState,
        );

        wheelDeltaRef.current =
          0;
      },
      [],
    );

  const closeAssistant =
    useCallback(
      (): void => {
        setIsAssistantOpen(
          false,
        );
      },
      [],
    );

  const closeNotifications =
    useCallback(
      (): void => {
        setIsNotificationsOpen(
          false,
        );
      },
      [],
    );

  const handleNotificationRead =
    useCallback(
      (): void => {
        void refreshNotifications();
      },
      [
        refreshNotifications,
      ],
    );

  useClickOutside(
    containerRef,
    closeMenu,
    isOpen,
  );

  useEscapeKey(
    closeMenu,
    isOpen,
  );

  const handleLanguageChange =
    useCallback(
      (): void => {
        const nextLocale:
          Locale =
            locale === "es"
              ? "en"
              : "es";

        closeMenu();
        closeNotifications();

        startLocaleTransition(
          () => {
            router.replace(
              pathname,
              {
                locale:
                  nextLocale,

                scroll:
                  false,
              },
            );
          },
        );
      },
      [
        closeMenu,
        closeNotifications,
        locale,
        pathname,
        router,
      ],
    );

  const handleActionSelect =
    useCallback(
      (
        action:
          QuickAction,
      ): void => {
        if (
          !action.isAvailable
        ) {
          return;
        }

        switch (
          action.behavior
        ) {
          case "theme": {
            toggleTheme();

            return;
          }

          case "language": {
            handleLanguageChange();

            return;
          }

          case "assistant": {
            closeMenu();
            closeNotifications();

            setIsAssistantOpen(
              true,
            );

            return;
          }

          case "notifications": {
            closeMenu();
            closeAssistant();

            setIsNotificationsOpen(
              true,
            );

            return;
          }

          case "logout": {
            closeMenu();
            closeNotifications();
            closeAssistant();

            void signOut();

            return;
          }

          case "placeholder":
          default: {
            return;
          }
        }
      },
      [
        closeAssistant,
        closeMenu,
        closeNotifications,
        handleLanguageChange,
        signOut,
        toggleTheme,
      ],
    );

  const handleWheel =
    useCallback(
      (
        event:
          ReactWheelEvent<HTMLDivElement>,
      ): void => {
        if (
          !isOpen
        ) {
          return;
        }

        event.preventDefault();

        wheelDeltaRef.current +=
          event.deltaY;

        if (
          Math.abs(
            wheelDeltaRef.current,
          )
          < QUICK_ACTIONS_LAYOUT
            .wheelThreshold
        ) {
          return;
        }

        if (
          wheelDeltaRef.current > 0
        ) {
          showNext();
        } else {
          showPrevious();
        }

        wheelDeltaRef.current =
          0;
      },
      [
        isOpen,
        showNext,
        showPrevious,
      ],
    );

  const canShowPrivatePanels =
    isAuthenticated
    && !isAuthenticationOpen;

  const isNotificationsPanelVisible =
    isNotificationsOpen
    && canShowPrivatePanels;

  const isAssistantPanelVisible =
    isAssistantOpen
    && !isAuthenticationOpen;

  const languageCode =
    locale === "es"
      ? "ES"
      : "EN";

  const appearanceLabel =
    resolvedTheme === "dark"
      ? themeTranslations(
          "switchToLight",
        )
      : themeTranslations(
          "switchToDark",
        );

  const languageLabel =
    locale === "es"
      ? languageTranslations(
          "switchToEnglish",
        )
      : languageTranslations(
          "switchToSpanish",
        );

  const notificationBadge =
    formatNotificationBadge(
      unreadNotificationsCount,
    );

  const triggerOpenLabel =
    notificationBadge
    && isAuthenticated
      ? locale === "en"
        ? `${translations("open")}. ${unreadNotificationsCount} unread notifications.`
        : `${translations("open")}. ${unreadNotificationsCount} notificaciones sin leer.`
      : translations(
          "open",
        );

  return (
    <>
      <div
        {...containerProps}
        ref={
          containerRef
        }
        data-state={
          isOpen
            ? "open"
            : "closed"
        }
        onWheel={
          handleWheel
        }
        className={cn(
          "fixed z-[110]",

          "bottom-[calc(1.25rem+env(safe-area-inset-bottom))]",
          "left-[calc(1.25rem+env(safe-area-inset-left))]",

          "md:bottom-[calc(2rem+env(safe-area-inset-bottom))]",
          "md:left-[calc(2rem+env(safe-area-inset-left))]",

          "select-none",

          className,
        )}
      >
        <div
          id={
            ACTIONS_CONTAINER_ID
          }
          aria-label={
            translations(
              "label",
            )
          }
          aria-hidden={
            !isOpen
          }
          className="absolute inset-0 overflow-visible"
        >
          {visibleActions.map(
            (
              action,
              index,
            ) => {
              const position =
                positions[
                  index
                ];

              if (
                !position
              ) {
                return null;
              }

              const isAppearance =
                action.id
                === "appearance";

              const isLanguage =
                action.id
                === "language";

              const isAssistant =
                action.id
                === "assistant";

              const isNotifications =
                action.id
                === "notifications";

              const accountActionLabel =
                getAccountActionLabel(
                  action.id,
                  locale,
                );

              return (
                <QuickActionItem
                  key={
                    action.id
                  }
                  action={
                    action
                  }
                  position={
                    position
                  }
                  isOpen={
                    isOpen
                  }
                  isActive={
                    (
                      isAssistant
                      && isAssistantOpen
                    )
                    || (
                      isNotifications
                      && isNotificationsOpen
                    )
                  }
                  iconOverride={
                    isAppearance
                      ? resolvedTheme
                        === "dark"
                        ? Sun
                        : Moon
                      : undefined
                  }
                  badge={
                    isLanguage
                      ? languageCode
                      : isNotifications
                        ? notificationBadge
                        : undefined
                  }
                  labelOverride={
                    isAppearance
                      ? appearanceLabel
                      : isLanguage
                        ? languageLabel
                        : accountActionLabel
                  }
                  onSelect={
                    handleActionSelect
                  }
                />
              );
            },
          )}
        </div>

        <div className="relative z-50">
          <MenuTrigger
            isOpen={
              isOpen
            }
            openLabel={
              triggerOpenLabel
            }
            closeLabel={
              translations(
                "close",
              )
            }
            controlsId={
              ACTIONS_CONTAINER_ID
            }
            openIcon={
              EllipsisVertical
            }
            closeIcon={
              X
            }
            variant="quick-actions"
            size="lg"
            onClick={
              toggleMenu
            }
          />

          {notificationBadge
          && isAuthenticated ? (
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute -top-1.5 -right-1.5 z-[70]",

                "flex h-6 min-w-6 items-center justify-center",

                "rounded-full border-2 px-1.5",

                "border-[#fdfefe] bg-[#4ead35]",

                "text-[10px] leading-none font-bold text-white",

                "shadow-[0_4px_14px_rgba(78,173,53,0.38)]",

                "dark:border-[#0c0f0c]",

                "dark:bg-[#57af33]",

                "dark:text-[#0c0f0c]",
              )}
            >
              {
                notificationBadge
              }
            </span>
          ) : null}
        </div>
      </div>

      <NotificationsPanel
        open={
          isNotificationsPanelVisible
        }
        onClose={
          closeNotifications
        }
        onNotificationRead={
          handleNotificationRead
        }
      />

      <AssistantPanel
        locale={
          locale
        }
        isOpen={
          isAssistantPanelVisible
        }
        onClose={
          closeAssistant
        }
        showBackdrop
        closeOnBackdrop
        closeOnEscape
      />
    </>
  );
}