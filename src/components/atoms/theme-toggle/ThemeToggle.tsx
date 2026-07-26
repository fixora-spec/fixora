"use client";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "@/providers/theme-provider";

import { useMounted } from "@/hooks/use-mounted";
import { cn } from "@/utils/cn";

import type {
  ThemeToggleProps,
  ThemeToggleSize,
} from "@/types/theme";

const ICON_SIZES: Record<ThemeToggleSize, number> = {
  sm: 17,
  md: 20,
  lg: 22,
};

const ICON_CONTAINER_CLASSES: Record<ThemeToggleSize, string> = {
  sm: "size-5",
  md: "size-6",
  lg: "size-7",
};

const ICON_ONLY_CLASSES: Record<ThemeToggleSize, string> = {
  sm: "size-9",
  md: "size-11",
  lg: "size-12",
};

const WITH_LABEL_CLASSES: Record<ThemeToggleSize, string> = {
  sm: "h-9 px-3 text-xs",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-5 text-sm",
};

export function ThemeToggle({
  className,
  size = "md",
  showLabel = false,
}: ThemeToggleProps) {
  const isMounted = useMounted();
  const { resolvedTheme, setTheme } = useTheme();
  const t = useTranslations("theme");

  const isDarkTheme = resolvedTheme === "dark";
  const nextTheme = isDarkTheme ? "light" : "dark";

  const accessibleLabel = isDarkTheme
    ? t("switchToLight")
    : t("switchToDark");

  const visibleLabel = isDarkTheme
    ? t("light")
    : t("dark");

  const handleThemeChange = (): void => {
    setTheme(nextTheme);
  };

  const buttonClassName = cn(
    "group inline-flex shrink-0 items-center justify-center gap-2",
    "rounded-full border font-medium",
    "transition-[background-color,color,border-color,box-shadow,transform]",
    "duration-300 ease-out",
    "focus-visible:outline-none",
    "focus-visible:ring-2",
    "focus-visible:ring-[#4ead35]",
    "focus-visible:ring-offset-2",
    "focus-visible:ring-offset-[#fdfefe]",
    "hover:scale-[1.04]",
    "active:scale-[0.96]",
    "disabled:pointer-events-none",
    "disabled:opacity-60",
    "dark:focus-visible:ring-offset-[#0c0f0c]",
    "motion-reduce:transform-none",
    "motion-reduce:transition-none",

    "border-[#393939]/15",
    "bg-white text-[#393939]",
    "shadow-[0_8px_24px_rgba(57,57,57,0.10)]",
    "hover:border-[#4ead35]/50",
    "hover:bg-[#f6faf5]",
    "hover:shadow-[0_10px_28px_rgba(78,173,53,0.16)]",

    "dark:border-white/12",
    "dark:bg-[#191c19]",
    "dark:text-[#f1f3f1]",
    "dark:shadow-[0_8px_28px_rgba(0,0,0,0.34)]",
    "dark:hover:border-[#57af33]/60",
    "dark:hover:bg-[#222622]",
    "dark:hover:shadow-[0_10px_30px_rgba(87,175,51,0.18)]",

    showLabel
      ? WITH_LABEL_CLASSES[size]
      : ICON_ONLY_CLASSES[size],

    className,
  );

  if (!isMounted) {
    return (
      <button
        type="button"
        aria-label={t("switchToDark")}
        disabled
        className={buttonClassName}
      >
        <span
          aria-hidden="true"
          className={cn(
            "block rounded-full bg-current opacity-10",
            ICON_CONTAINER_CLASSES[size],
          )}
        />

        {showLabel ? (
          <span aria-hidden="true" className="opacity-0">
            {t("dark")}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={accessibleLabel}
      aria-pressed={isDarkTheme}
      title={accessibleLabel}
      onClick={handleThemeChange}
      className={buttonClassName}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative inline-flex shrink-0 items-center justify-center",
          ICON_CONTAINER_CLASSES[size],
        )}
      >
        <Sun
          size={ICON_SIZES[size]}
          strokeWidth={1.9}
          className={cn(
            "absolute text-[#4ead35]",
            "transition-[opacity,transform] duration-300 ease-out",
            "motion-reduce:transition-none",
            isDarkTheme
              ? "scale-100 rotate-0 opacity-100"
              : "scale-75 -rotate-90 opacity-0",
          )}
        />

        <Moon
          size={ICON_SIZES[size]}
          strokeWidth={1.9}
          className={cn(
            "absolute text-[#393939]",
            "transition-[opacity,transform] duration-300 ease-out",
            "dark:text-[#dfe5df]",
            "motion-reduce:transition-none",
            isDarkTheme
              ? "scale-75 rotate-90 opacity-0"
              : "scale-100 rotate-0 opacity-100",
          )}
        />
      </span>

      {showLabel ? (
        <span className="whitespace-nowrap">
          {visibleLabel}
        </span>
      ) : null}
    </button>
  );
}