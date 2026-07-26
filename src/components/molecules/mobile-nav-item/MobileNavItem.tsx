"use client";

import { ChevronRight } from "lucide-react";

import { NavIcon } from "@/components/atoms/nav-icon";
import { Link } from "@/i18n/navigation";
import { cn } from "@/utils/cn";

import type { MobileNavItemProps } from "./MobileNavItem.types";

export function MobileNavItem({
  item,
  label,
  isActive,
  onNavigate,
  className,
  ...listItemProps
}: MobileNavItemProps) {
  return (
    <li
      {...listItemProps}
      data-active={isActive ? "true" : "false"}
      className={cn("w-full", className)}
    >
      <Link
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        onClick={onNavigate}
        className={cn(
          "group flex min-h-11 w-full items-center gap-2",
          "rounded-xl border px-2 py-1.5",

          "text-[10px] leading-tight font-semibold",
          "tracking-[-0.01em]",
          "sm:text-[11px]",

          "transition-[background-color,color,border-color,box-shadow,transform]",
          "duration-200 ease-out",

          "focus-visible:outline-none",
          "focus-visible:ring-2",
          "focus-visible:ring-[#4ead35]",
          "focus-visible:ring-offset-1",
          "focus-visible:ring-offset-[#fdfefe]",

          "active:scale-[0.98]",

          "dark:focus-visible:ring-[#57af33]",
          "dark:focus-visible:ring-offset-[#0c0f0c]",

          "motion-reduce:transform-none",
          "motion-reduce:transition-none",

          isActive
            ? [
                "border-[#4ead35]",
                "bg-[#4ead35]",
                "text-[#0c0f0c]",
                "shadow-[0_6px_18px_rgba(78,173,53,0.20)]",

                "hover:bg-[#57af33]",

                "dark:border-[#57af33]",
                "dark:bg-[#57af33]",
                "dark:text-[#0c0f0c]",
              ]
            : [
                "border-[#393939]/10",
                "bg-white/75",
                "text-[#393939]",
                "shadow-[0_4px_14px_rgba(57,57,57,0.05)]",

                "hover:border-[#4ead35]/45",
                "hover:bg-[#f6faf5]",
                "hover:text-[#3f9d2b]",

                "dark:border-white/10",
                "dark:bg-white/[0.04]",
                "dark:text-[#edf0ed]",

                "dark:hover:border-[#57af33]/55",
                "dark:hover:bg-white/[0.08]",
                "dark:hover:text-[#6ac447]",
              ],
        )}
      >
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center",
            "rounded-lg",

            isActive
              ? "bg-black/10"
              : [
                  "bg-[#393939]/[0.06]",
                  "group-hover:bg-[#4ead35]/10",
                  "dark:bg-white/[0.07]",
                  "dark:group-hover:bg-[#57af33]/10",
                ],
          )}
        >
          <NavIcon
            icon={item.icon}
            size="sm"
            isActive={isActive}
            iconSize={16}
            strokeWidth={1.8}
          />
        </span>

        <span className="min-w-0 flex-1 break-words">
          {label}
        </span>

        <ChevronRight
          aria-hidden="true"
          size={14}
          strokeWidth={1.8}
          className={cn(
            "shrink-0",
            "transition-transform duration-200 ease-out",
            "group-hover:translate-x-0.5",
            "motion-reduce:transition-none",

            isActive
              ? "text-[#0c0f0c]/70"
              : [
                  "text-[#393939]/45",
                  "group-hover:text-[#3f9d2b]",
                  "dark:text-white/40",
                  "dark:group-hover:text-[#6ac447]",
                ],
          )}
        />
      </Link>
    </li>
  );
}