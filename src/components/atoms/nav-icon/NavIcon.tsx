import { cva } from "class-variance-authority";

import { cn } from "@/utils/cn";

import type {
  NavIconProps,
  NavIconSize,
} from "./NavIcon.types";

const navIconVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center",
    "transition-[color,transform] duration-300 ease-out",
    "motion-reduce:transition-none",
  ],
  {
    variants: {
      size: {
        sm: "size-8",
        md: "size-9",
        lg: "size-10",
      },
      active: {
        true: "text-[#0c0f0c]",
        false: [
          "text-[#505650]",
          "group-hover:text-[#3f9d2b]",
          "group-focus-visible:text-[#3f9d2b]",
          "dark:text-[#dce1dc]",
          "dark:group-hover:text-[#6ac447]",
          "dark:group-focus-visible:text-[#6ac447]",
        ],
      },
    },
    defaultVariants: {
      size: "md",
      active: false,
    },
  },
);

const DEFAULT_ICON_SIZE: Record<NavIconSize, number> = {
  sm: 18,
  md: 20,
  lg: 22,
};

export function NavIcon({
  icon: Icon,
  size = "md",
  isActive = false,
  iconSize,
  strokeWidth = 1.9,
  className,
  iconClassName,
  ...spanProps
}: NavIconProps) {
  const resolvedIconSize =
    iconSize ?? DEFAULT_ICON_SIZE[size];

  return (
    <span
      {...spanProps}
      aria-hidden="true"
      data-active={isActive ? "true" : "false"}
      className={cn(
        navIconVariants({
          size,
          active: isActive,
        }),
        className,
      )}
    >
      <Icon
        size={resolvedIconSize}
        strokeWidth={strokeWidth}
        className={cn(
          "shrink-0",
          iconClassName,
        )}
      />
    </span>
  );
}