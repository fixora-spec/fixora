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

import { MenuTrigger } from "@/components/atoms/menu-trigger";
import { QuickActionItem } from "@/components/molecules/quick-action-item";
import { QUICK_ACTIONS_LAYOUT } from "@/config/quick-actions.config";
import { useClickOutside } from "@/hooks/use-click-outside";
import { useEscapeKey } from "@/hooks/use-escape-key";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useQuickActionsCarousel } from "@/hooks/use-quick-actions-carousel";
import {
  usePathname,
  useRouter,
} from "@/i18n/navigation";
import { useTheme } from "@/providers/theme-provider";
import { cn } from "@/utils/cn";

import type { Locale } from "@/types/locale";
import type {
  QuickAction,
  QuickActionPosition,
} from "@/types/quick-action";
import type { QuickActionsMenuProps } from "./QuickActionsMenu.types";

const ACTIONS_CONTAINER_ID = "fixora-quick-actions";

const MOBILE_POSITIONS = [
  { x: 0, y: -126 },
  { x: 66, y: -108 },
  { x: 108, y: -66 },
  { x: 126, y: 0 },
] as const;

const DESKTOP_POSITIONS = [
  { x: 0, y: -160 },
  { x: 84, y: -138 },
  { x: 138, y: -84 },
  { x: 160, y: 0 },
] as const;

export function QuickActionsMenu({
  className,
  ...containerProps
}: QuickActionsMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wheelDeltaRef = useRef(0);

  const [isOpen, setIsOpen] = useState(false);
  const [, startLocaleTransition] = useTransition();

  const isDesktop = useMediaQuery("(min-width: 768px)");

  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();

  const { resolvedTheme, toggleTheme } = useTheme();

  const t = useTranslations("quickActions");
  const tTheme = useTranslations("theme");
  const tLanguage = useTranslations("language");

  const {
    visibleActions,
    showPrevious,
    showNext,
  } = useQuickActionsCarousel();

  const positions = useMemo<QuickActionPosition[]>(() => {
    const source = isDesktop
      ? DESKTOP_POSITIONS
      : MOBILE_POSITIONS;

    return source.map((position, index) => ({
      index,
      angle: 0,
      x: position.x,
      y: position.y,
    }));
  }, [isDesktop]);

  const closeMenu = useCallback((): void => {
    setIsOpen(false);
    wheelDeltaRef.current = 0;
  }, []);

  const toggleMenu = useCallback((): void => {
    setIsOpen((currentState) => !currentState);
    wheelDeltaRef.current = 0;
  }, []);

  useClickOutside(containerRef, closeMenu, isOpen);
  useEscapeKey(closeMenu, isOpen);

  const handleLanguageChange = useCallback((): void => {
    const nextLocale: Locale =
      locale === "es" ? "en" : "es";

    startLocaleTransition(() => {
      router.replace(pathname, {
        locale: nextLocale,
      });
    });
  }, [locale, pathname, router]);

  const handleActionSelect = useCallback(
    (action: QuickAction): void => {
      if (action.behavior === "theme") {
        toggleTheme();
        return;
      }

      if (action.behavior === "language") {
        handleLanguageChange();
      }
    },
    [handleLanguageChange, toggleTheme],
  );

  const handleWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>): void => {
      if (!isOpen) {
        return;
      }

      event.preventDefault();

      wheelDeltaRef.current += event.deltaY;

      if (
        Math.abs(wheelDeltaRef.current) <
        QUICK_ACTIONS_LAYOUT.wheelThreshold
      ) {
        return;
      }

      if (wheelDeltaRef.current > 0) {
        showNext();
      } else {
        showPrevious();
      }

      wheelDeltaRef.current = 0;
    },
    [isOpen, showNext, showPrevious],
  );

  const languageCode = locale === "es" ? "ES" : "EN";

  const appearanceLabel =
    resolvedTheme === "dark"
      ? tTheme("switchToLight")
      : tTheme("switchToDark");

  const languageLabel =
    locale === "es"
      ? tLanguage("switchToEnglish")
      : tLanguage("switchToSpanish");

  return (
    <div
      {...containerProps}
      ref={containerRef}
      data-state={isOpen ? "open" : "closed"}
      onWheel={handleWheel}
      className={cn(
        "fixed z-50",
        "bottom-[calc(1.25rem+env(safe-area-inset-bottom))]",
        "left-[calc(1.25rem+env(safe-area-inset-left))]",
        "md:bottom-[calc(2rem+env(safe-area-inset-bottom))]",
        "md:left-[calc(2rem+env(safe-area-inset-left))]",
        "select-none",
        className,
      )}
    >
      <div
        id={ACTIONS_CONTAINER_ID}
        aria-label={t("label")}
        aria-hidden={!isOpen}
        className="absolute inset-0 overflow-visible"
      >
        {visibleActions.map((action, index) => {
          const position = positions[index];

          if (!position) {
            return null;
          }

          const isAppearance = action.id === "appearance";
          const isLanguage = action.id === "language";

          return (
            <QuickActionItem
              key={action.id}
              action={action}
              position={position}
              isOpen={isOpen}
              iconOverride={
                isAppearance
                  ? resolvedTheme === "dark"
                    ? Sun
                    : Moon
                  : undefined
              }
              badge={
                isLanguage
                  ? languageCode
                  : undefined
              }
              labelOverride={
                isAppearance
                  ? appearanceLabel
                  : isLanguage
                    ? languageLabel
                    : undefined
              }
              onSelect={handleActionSelect}
            />
          );
        })}
      </div>

      <div className="relative z-50">
        <MenuTrigger
          isOpen={isOpen}
          openLabel={t("open")}
          closeLabel={t("close")}
          controlsId={ACTIONS_CONTAINER_ID}
          openIcon={EllipsisVertical}
          closeIcon={X}
          variant="quick-actions"
          size="lg"
          onClick={toggleMenu}
        />
      </div>
    </div>
  );
}