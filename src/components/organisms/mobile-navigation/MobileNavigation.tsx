"use client";

import { useEffect, useRef } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "motion/react";
import { useTranslations } from "next-intl";

import { LoginLink } from "@/components/molecules/login-link";
import { MobileNavItem } from "@/components/molecules/mobile-nav-item";
import { NAVIGATION_ITEMS } from "@/config/navigation.config";
import { useEscapeKey } from "@/hooks/use-escape-key";
import { useLockBodyScroll } from "@/hooks/use-lock-body-scroll";
import { usePathname } from "@/i18n/navigation";
import { cn } from "@/utils/cn";

import type { MobileNavigationProps } from "./MobileNavigation.types";

const DEFAULT_PANEL_ID = "mobile-navigation-panel";

const FOCUSABLE_ELEMENTS_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function MobileNavigation({
  isOpen,
  onClose,
  id = DEFAULT_PANEL_ID,
  className,
  "aria-label": ariaLabel,
  ...navigationProps
}: MobileNavigationProps) {
  const pathname = usePathname();
  const t = useTranslations("navigation");
  const prefersReducedMotion = useReducedMotion();

  const panelRef = useRef<HTMLElement>(null);

  const navigationLabel = ariaLabel ?? t("mainLabel");

  useEscapeKey(onClose, isOpen);
  useLockBodyScroll(isOpen);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const panel = panelRef.current;

    const previouslyFocusedElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const getFocusableElements = (): HTMLElement[] => {
      if (!panel) {
        return [];
      }

      return Array.from(
        panel.querySelectorAll<HTMLElement>(
          FOCUSABLE_ELEMENTS_SELECTOR,
        ),
      ).filter(
        (element) =>
          !element.hasAttribute("disabled") &&
          element.getAttribute("aria-hidden") !== "true",
      );
    };

    const focusableElements = getFocusableElements();
    const firstFocusableElement = focusableElements.at(0);

    if (firstFocusableElement) {
      firstFocusableElement.focus();
    } else {
      panel?.focus();
    }

    const handleTabKey = (event: KeyboardEvent): void => {
      if (event.key !== "Tab") {
        return;
      }

      const currentFocusableElements = getFocusableElements();

      if (currentFocusableElements.length === 0) {
        event.preventDefault();
        panel?.focus();
        return;
      }

      const firstElement = currentFocusableElements.at(0);
      const lastElement = currentFocusableElements.at(-1);

      if (!firstElement || !lastElement) {
        return;
      }

      if (
        event.shiftKey &&
        document.activeElement === firstElement
      ) {
        event.preventDefault();
        lastElement.focus();
        return;
      }

      if (
        !event.shiftKey &&
        document.activeElement === lastElement
      ) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleTabKey);

    return () => {
      document.removeEventListener("keydown", handleTabKey);
      previouslyFocusedElement?.focus();
    };
  }, [isOpen]);

  const animationDuration = prefersReducedMotion ? 0 : 0.3;

  return (
    <AnimatePresence initial={false}>
      {isOpen ? (
        <motion.div
          key="mobile-navigation-overlay"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            duration: prefersReducedMotion ? 0 : 0.18,
            ease: "easeOut",
          }}
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) {
              onClose();
            }
          }}
          className={cn(
            "fixed inset-0 z-40 xl:hidden",

            // Oscurecimiento exterior muy suave.
            "bg-black/10",
            "backdrop-blur-[1px]",

            "dark:bg-black/20",
          )}
        >
          <motion.aside
            ref={panelRef}
            id={id}
            role="dialog"
            aria-modal="true"
            aria-label={navigationLabel}
            tabIndex={-1}
            initial={{
              opacity: 0,
              x: prefersReducedMotion ? 0 : 32,
              scale: prefersReducedMotion ? 1 : 0.98,
            }}
            animate={{
              opacity: 1,
              x: 0,
              scale: 1,
            }}
            exit={{
              opacity: 0,
              x: prefersReducedMotion ? 0 : 32,
              scale: prefersReducedMotion ? 1 : 0.98,
            }}
            transition={{
              duration: animationDuration,
              ease: [0.22, 1, 0.36, 1],
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

              // Panel translúcido estilo vidrio.
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
              aria-label={navigationLabel}
              className="flex min-h-0 flex-1 flex-col"
            >
              <ul className="flex flex-col gap-1.5">
                {NAVIGATION_ITEMS.map((item) => {
                  const isActive = pathname === item.href;

                  return (
                    <MobileNavItem
                      key={item.id}
                      item={item}
                      label={t(item.labelKey)}
                      isActive={isActive}
                      onNavigate={onClose}
                    />
                  );
                })}
              </ul>

              <div
                className={cn(
                  "mt-4 border-t pt-3",
                  "border-[#393939]/10",
                  "dark:border-white/10",
                )}
              >
                <LoginLink
                  label={t("signIn")}
                  variant="mobile"
                  onNavigate={onClose}
                />
              </div>
            </nav>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}