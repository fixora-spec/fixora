"use client";

import {
  useState,
  type FocusEvent,
} from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "motion/react";

import { NavIcon } from "@/components/atoms/nav-icon";
import { Link } from "@/i18n/navigation";
import { cn } from "@/utils/cn";

import type { NavigationItemId } from "@/types/navigation";
import type { ExpandingNavItemProps } from "./ExpandingNavItem.types";

const COLLAPSED_WIDTH = 52;

const EXPANDED_WIDTHS: Record<NavigationItemId, number> = {
  home: 108,
  about: 150,
  "graphic-resources": 196,
  "software-licenses": 222,
  hardware: 132,
  "technical-services": 202,
  "remote-support": 176,
  "plans-promotions": 216,
  "help-center": 176,
  contact: 132,
};

export function ExpandingNavItem({
  item,
  label,
  isActive,
  onNavigate,
  className,
  style,
  ...listItemProps
}: ExpandingNavItemProps) {
  const prefersReducedMotion = useReducedMotion();

  const [isHovered, setIsHovered] = useState(false);
  const [isKeyboardFocused, setIsKeyboardFocused] =
    useState(false);

  const isExpanded = isHovered || isKeyboardFocused;
  const expandedWidth = EXPANDED_WIDTHS[item.id];

  const handleFocus = (
    event: FocusEvent<HTMLAnchorElement>,
  ): void => {
    const element = event.currentTarget;

    requestAnimationFrame(() => {
      if (document.activeElement !== element) {
        return;
      }

      setIsKeyboardFocused(
        element.matches(":focus-visible"),
      );
    });
  };

  const handleBlur = (): void => {
    setIsKeyboardFocused(false);
  };

  const handleNavigate = (): void => {
    onNavigate?.();
  };

  return (
    <li
      {...listItemProps}
      data-active={isActive ? "true" : "false"}
      data-expanded={isExpanded ? "true" : "false"}
      onMouseEnter={() => {
        setIsHovered(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
      }}
      style={{
        ...style,
        width: isExpanded
          ? `${expandedWidth}px`
          : `${COLLAPSED_WIDTH}px`,
        transitionDelay: isExpanded ? "0ms" : "40ms",
      }}
      className={cn(
        "relative h-[52px] shrink-0",
        "transition-[width] duration-[380ms]",
        "[transition-timing-function:cubic-bezier(0.22,1,0.36,1)]",
        "will-change-[width]",
        "motion-reduce:transition-none",
        className,
      )}
    >
      <Link
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        aria-label={label}
        title={label}
        onClick={handleNavigate}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={cn(
          "group relative flex h-[52px] w-full",
          "items-center overflow-hidden rounded-full",
          "whitespace-nowrap",

          "transition-[background-color,color,box-shadow,transform]",
          "duration-300 ease-out",

          "active:scale-[0.97]",

          "focus-visible:outline-none",
          "focus-visible:ring-2",
          "focus-visible:ring-[#4ead35]",
          "focus-visible:ring-offset-2",
          "focus-visible:ring-offset-[#fdfefe]",

          "dark:focus-visible:ring-[#57af33]",
          "dark:focus-visible:ring-offset-[#0c0f0c]",

          "motion-reduce:transform-none",
          "motion-reduce:transition-none",

          isActive
            ? [
                "bg-[#4ead35]",
                "text-[#0c0f0c]",
                "shadow-[0_8px_24px_rgba(78,173,53,0.26)]",

                "hover:bg-[#57af33]",
                "hover:shadow-[0_10px_30px_rgba(78,173,53,0.32)]",

                "dark:bg-[#57af33]",
                "dark:text-[#0c0f0c]",
                "dark:shadow-[0_8px_26px_rgba(87,175,51,0.28)]",

                "dark:hover:bg-[#63bd3d]",
                "dark:hover:shadow-[0_10px_32px_rgba(87,175,51,0.34)]",
              ]
            : [
                "bg-transparent",
                "text-[#393939]",

                "hover:bg-[#393939]/[0.08]",
                "hover:text-[#318b22]",
                "hover:shadow-[0_8px_24px_rgba(57,57,57,0.10)]",

                "focus-visible:bg-[#393939]/[0.08]",
                "focus-visible:text-[#318b22]",

                "dark:text-[#e3e7e3]",

                "dark:hover:bg-white/10",
                "dark:hover:text-[#6ac447]",
                "dark:hover:shadow-[0_8px_26px_rgba(0,0,0,0.30)]",

                "dark:focus-visible:bg-white/10",
                "dark:focus-visible:text-[#6ac447]",
              ],
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "relative z-10",
            "flex size-[52px] shrink-0",
            "items-center justify-center",

            "transition-transform duration-300 ease-out",

            isExpanded && "-translate-x-0.5",

            "motion-reduce:transform-none",
            "motion-reduce:transition-none",
          )}
        >
          <NavIcon
            icon={item.icon}
            size="md"
            isActive={isActive}
            iconSize={21}
            strokeWidth={1.9}
          />
        </span>

        <div
          aria-hidden="true"
          className="relative min-w-0 flex-1 overflow-hidden pr-3"
        >
          <AnimatePresence initial={false} mode="wait">
            {isExpanded ? (
              <motion.span
                key={`${item.id}-${label}`}
                initial={
                  prefersReducedMotion
                    ? false
                    : {
                        opacity: 0,
                        x: 24,
                      }
                }
                animate={{
                  opacity: 1,
                  x: 0,
                }}
                exit={
                  prefersReducedMotion
                    ? {
                        opacity: 0,
                      }
                    : {
                        opacity: 0,
                        x: -24,
                      }
                }
                transition={{
                  duration: prefersReducedMotion
                    ? 0
                    : 0.2,
                  ease: "easeOut",
                }}
                className={cn(
                  "block whitespace-nowrap",
                  "text-sm leading-none font-semibold",
                  "tracking-[-0.01em]",

                  isActive
                    ? "text-[#0c0f0c]"
                    : [
                        "text-[#303530]",
                        "dark:text-[#f1f3f1]",
                      ],
                )}
              >
                {label}
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>
      </Link>
    </li>
  );
}