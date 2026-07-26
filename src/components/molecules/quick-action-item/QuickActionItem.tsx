"use client";

import {
  motion,
  useReducedMotion,
} from "motion/react";
import { useTranslations } from "next-intl";

import { cn } from "@/utils/cn";

import type { QuickActionItemProps } from "./QuickActionItem.types";

export function QuickActionItem({
  action,
  position,
  isOpen,
  isActive = false,
  iconOverride,
  badge,
  labelOverride,
  onSelect,
  className,
}: QuickActionItemProps) {
  const t = useTranslations("quickActions");
  const prefersReducedMotion = useReducedMotion();

  const Icon = iconOverride ?? action.icon;
  const label = labelOverride ?? t(action.labelKey);
  const isUnavailable = !action.isAvailable;

  const accessibleLabel = isUnavailable
    ? `${label}. ${t("comingSoon")}`
    : label;

  const handleSelect = (): void => {
    if (!isOpen || isUnavailable) {
      return;
    }

    onSelect(action);
  };

  return (
    <motion.button
      type="button"
      initial={false}
      animate={{
        x: isOpen ? position.x : 0,
        y: isOpen ? position.y : 0,
        scale: isOpen ? 1 : 0.55,
        opacity: isOpen ? 1 : 0,
      }}
      transition={
        prefersReducedMotion
          ? { duration: 0 }
          : isOpen
            ? {
                type: "spring",
                stiffness: 390,
                damping: 27,
                mass: 0.76,
                delay: position.index * 0.035,
              }
            : {
                duration: 0.18,
                ease: "easeIn",
              }
      }
      whileHover={
        isOpen &&
        action.isAvailable &&
        !prefersReducedMotion
          ? { scale: 1.08 }
          : undefined
      }
      whileTap={
        isOpen &&
        action.isAvailable &&
        !prefersReducedMotion
          ? { scale: 0.94 }
          : undefined
      }
      aria-label={accessibleLabel}
      aria-disabled={isUnavailable}
      aria-hidden={!isOpen}
      tabIndex={isOpen ? 0 : -1}
      title={accessibleLabel}
      data-active={isActive ? "true" : "false"}
      data-action={action.id}
      onClick={handleSelect}
      className={cn(
        "group absolute top-1/2 left-1/2 z-40",
        "-mt-6 -ml-6",
        "flex size-12 items-center justify-center",
        "overflow-visible rounded-full border",

        "border-[#393939]/15",
        "bg-white text-[#393939]",
        "shadow-[0_10px_28px_rgba(57,57,57,0.14)]",

        "transition-[background-color,color,border-color,box-shadow]",
        "duration-200 ease-out",

        "hover:z-[80]",
        "hover:border-[#4ead35]",
        "hover:bg-[#f5faf3]",
        "hover:text-[#3f9d2b]",
        "hover:shadow-[0_12px_32px_rgba(78,173,53,0.24)]",

        "focus-visible:z-[80]",
        "focus-visible:outline-none",
        "focus-visible:ring-2",
        "focus-visible:ring-[#4ead35]",
        "focus-visible:ring-offset-3",
        "focus-visible:ring-offset-[#fdfefe]",

        "dark:border-white/15",
        "dark:bg-[#191d19]",
        "dark:text-[#edf0ed]",
        "dark:shadow-[0_10px_30px_rgba(0,0,0,0.45)]",

        "dark:hover:border-[#57af33]",
        "dark:hover:bg-[#242924]",
        "dark:hover:text-[#6ac447]",
        "dark:hover:shadow-[0_12px_34px_rgba(87,175,51,0.24)]",

        "dark:focus-visible:ring-[#57af33]",
        "dark:focus-visible:ring-offset-[#0c0f0c]",

        !isOpen && "pointer-events-none",

        isActive && [
          "border-[#4ead35]",
          "bg-[#4ead35]",
          "text-[#0c0f0c]",
        ],

        isUnavailable && [
          "cursor-default opacity-70",
          "hover:border-[#393939]/15",
          "hover:bg-white",
          "hover:text-[#393939]",
          "dark:hover:border-white/15",
          "dark:hover:bg-[#191d19]",
          "dark:hover:text-[#edf0ed]",
        ],

        className,
      )}
    >
      <Icon
        aria-hidden="true"
        size={22}
        strokeWidth={1.9}
      />

      {badge ? (
        <span
          aria-hidden="true"
          className={cn(
            "absolute -right-1.5 -bottom-1.5 z-20",
            "flex h-5 min-w-5 items-center justify-center",
            "rounded-full border-2 px-1",
            "border-[#fdfefe] bg-[#4ead35]",
            "text-[9px] leading-none font-bold text-white",
            "shadow-[0_4px_12px_rgba(78,173,53,0.32)]",
            "dark:border-[#0c0f0c]",
            "dark:bg-[#57af33]",
            "dark:text-[#0c0f0c]",
          )}
        >
          {badge}
        </span>
      ) : null}

      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute",
          "top-1/2 left-[calc(100%+0.875rem)] z-[100]",
          "hidden -translate-y-1/2 whitespace-nowrap md:block",

          "rounded-lg border px-3 py-2",
          "text-xs leading-none font-semibold",

          "border-[#393939]/12",
          "bg-white text-[#393939]",
          "shadow-[0_10px_28px_rgba(57,57,57,0.16)]",

          "translate-x-2 opacity-0",
          "transition-[opacity,transform]",
          "duration-200 ease-out",

          "group-hover:translate-x-0",
          "group-hover:opacity-100",
          "group-focus-visible:translate-x-0",
          "group-focus-visible:opacity-100",

          "dark:border-white/12",
          "dark:bg-[#191d19]",
          "dark:text-[#edf0ed]",
          "dark:shadow-[0_10px_30px_rgba(0,0,0,0.52)]",
        )}
      >
        {isUnavailable
          ? `${label} · ${t("comingSoon")}`
          : label}
      </span>
    </motion.button>
  );
}