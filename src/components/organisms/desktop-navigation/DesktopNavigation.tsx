"use client";

import { useTranslations } from "next-intl";

import { ExpandingNavItem } from "@/components/molecules/expanding-nav-item";
import { NAVIGATION_ITEMS } from "@/config/navigation.config";
import { usePathname } from "@/i18n/navigation";
import { cn } from "@/utils/cn";

import type { DesktopNavigationProps } from "./DesktopNavigation.types";

export function DesktopNavigation({
  className,
  "aria-label": ariaLabel,
  ...navigationProps
}: DesktopNavigationProps) {
  const pathname = usePathname();
  const t = useTranslations("navigation");

  return (
    <nav
      {...navigationProps}
      aria-label={ariaLabel ?? t("mainLabel")}
      className={cn(
        "hidden min-w-0 overflow-visible xl:block",
        className,
      )}
    >
      <ul
        className={cn(
          "flex h-16 items-center gap-1.5",
          "overflow-visible rounded-full p-1.5",

          "border border-[#393939]/10",
          "bg-white/78",

          "shadow-[0_14px_40px_rgba(57,57,57,0.10)]",
          "backdrop-blur-xl",

          "supports-[backdrop-filter]:bg-white/68",

          "dark:border-white/10",
          "dark:bg-[#151815]/82",

          "dark:shadow-[0_16px_44px_rgba(0,0,0,0.38)]",
          "dark:supports-[backdrop-filter]:bg-[#151815]/72",
        )}
      >
        {NAVIGATION_ITEMS.map((item) => {
          const isActive = pathname === item.href;

          return (
            <ExpandingNavItem
              key={item.id}
              item={item}
              label={t(item.labelKey)}
              isActive={isActive}
            />
          );
        })}
      </ul>
    </nav>
  );
}