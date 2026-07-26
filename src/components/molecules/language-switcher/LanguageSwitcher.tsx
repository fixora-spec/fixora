"use client";

import { useTransition } from "react";
import { Globe2, LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/utils/cn";

import type { Locale } from "@/types/locale";
import type { LanguageSwitcherProps } from "./LanguageSwitcher.types";

export function LanguageSwitcher({
  currentLocale,
  variant = "icon",
  showCode = true,
  onLocaleChange,
  className,
  disabled,
  title,
  type = "button",
  ...buttonProps
}: LanguageSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("language");

  const [isPending, startTransition] = useTransition();

  const nextLocale: Locale =
    currentLocale === "es" ? "en" : "es";

  const currentCode =
    currentLocale === "es"
      ? t("spanishShort")
      : t("englishShort");

  const accessibleLabel =
    nextLocale === "es"
      ? t("switchToSpanish")
      : t("switchToEnglish");

  const handleLocaleChange = (): void => {
    if (disabled || isPending) {
      return;
    }

    onLocaleChange?.(nextLocale);

    startTransition(() => {
      router.replace(pathname, {
        locale: nextLocale,
      });
    });
  };

  return (
    <button
      {...buttonProps}
      type={type}
      aria-label={accessibleLabel}
      aria-busy={isPending || undefined}
      disabled={disabled || isPending}
      title={title ?? accessibleLabel}
      onClick={handleLocaleChange}
      data-variant={variant}
      className={cn(
        "group relative inline-flex shrink-0 items-center justify-center",
        "rounded-full border font-semibold",
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
        "disabled:cursor-not-allowed",
        "disabled:opacity-60",
        "dark:focus-visible:ring-offset-[#0c0f0c]",
        "motion-reduce:transform-none",
        "motion-reduce:transition-none",

        "border-[#393939]/15",
        "bg-white text-[#393939]",
        "shadow-[0_8px_24px_rgba(57,57,57,0.10)]",
        "hover:border-[#4ead35]/55",
        "hover:bg-[#f6faf5]",
        "hover:text-[#3f9d2b]",
        "hover:shadow-[0_10px_28px_rgba(78,173,53,0.16)]",

        "dark:border-white/12",
        "dark:bg-[#191c19]",
        "dark:text-[#f1f3f1]",
        "dark:shadow-[0_8px_28px_rgba(0,0,0,0.34)]",
        "dark:hover:border-[#57af33]/65",
        "dark:hover:bg-[#222622]",
        "dark:hover:text-[#6ac447]",
        "dark:hover:shadow-[0_10px_30px_rgba(87,175,51,0.18)]",

        variant === "icon"
          ? "size-12"
          : "h-11 min-w-[5.25rem] gap-2 px-4 text-sm",

        className,
      )}
    >
      {isPending ? (
        <LoaderCircle
          aria-hidden="true"
          size={20}
          strokeWidth={1.9}
          className="animate-spin motion-reduce:animate-none"
        />
      ) : (
        <>
          <Globe2
            aria-hidden="true"
            size={variant === "icon" ? 22 : 20}
            strokeWidth={1.9}
            className="shrink-0"
          />

          {showCode ? (
            variant === "icon" ? (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute -right-1 -bottom-1",
                  "flex h-5 min-w-5 items-center justify-center",
                  "rounded-full border-2 px-1",
                  "border-[#fdfefe] bg-[#4ead35]",
                  "text-[9px] leading-none font-bold text-white",
                  "shadow-[0_4px_10px_rgba(78,173,53,0.28)]",
                  "dark:border-[#0c0f0c]",
                  "dark:bg-[#57af33]",
                  "dark:text-[#0c0f0c]",
                )}
              >
                {currentCode}
              </span>
            ) : (
              <span aria-hidden="true" className="leading-none">
                {currentCode}
              </span>
            )
          ) : null}
        </>
      )}
    </button>
  );
}