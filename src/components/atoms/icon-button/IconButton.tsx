"use client";

import { cva } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";

import { cn } from "@/utils/cn";

import type {
  IconButtonProps,
  IconButtonSize,
} from "./IconButton.types";

const iconButtonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center rounded-full",
    "transition-[background-color,color,border-color,box-shadow,transform]",
    "duration-200 ease-out",
    "hover:scale-[1.04] active:scale-[0.96]",
    "focus-visible:outline-none",
    "focus-visible:ring-2 focus-visible:ring-[#4ead35]",
    "focus-visible:ring-offset-2",
    "focus-visible:ring-offset-[#fdfefe]",
    "dark:focus-visible:ring-offset-[#0c0f0c]",
    "disabled:pointer-events-none",
    "disabled:cursor-not-allowed",
    "disabled:opacity-45",
    "disabled:hover:scale-100",
    "motion-reduce:transform-none",
    "motion-reduce:transition-none",
  ],
  {
    variants: {
      variant: {
        default: [
          "border border-black/10",
          "bg-white text-[#393939]",
          "shadow-sm",
          "hover:bg-[#f4f6f3]",
          "dark:border-white/10",
          "dark:bg-[#1a1d1a]",
          "dark:text-[#edf0ed]",
          "dark:hover:bg-[#242824]",
        ],
        brand: [
          "border border-[#4ead35]",
          "bg-[#4ead35] text-white",
          "shadow-[0_8px_24px_rgba(78,173,53,0.24)]",
          "hover:bg-[#449c2f]",
          "dark:border-[#57af33]",
          "dark:bg-[#57af33]",
          "dark:text-[#0c0f0c]",
          "dark:hover:bg-[#63bd3d]",
        ],
        ghost: [
          "border border-transparent",
          "bg-transparent text-[#393939]",
          "hover:bg-black/5",
          "dark:text-[#edf0ed]",
          "dark:hover:bg-white/10",
        ],
        outline: [
          "border border-[#393939]/20",
          "bg-transparent text-[#393939]",
          "hover:border-[#4ead35]",
          "hover:text-[#3f9d2b]",
          "dark:border-white/20",
          "dark:text-[#edf0ed]",
          "dark:hover:border-[#57af33]",
          "dark:hover:text-[#6ac447]",
        ],
      },
      size: {
        sm: "size-9",
        md: "size-11",
        lg: "size-12",
      },
      active: {
        true: [
          "ring-2 ring-[#4ead35]/70",
          "shadow-[0_0_0_4px_rgba(78,173,53,0.12)]",
        ],
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
      active: false,
    },
  },
);

const DEFAULT_ICON_SIZE: Record<IconButtonSize, number> = {
  sm: 18,
  md: 20,
  lg: 22,
};

export function IconButton({
  ref,
  icon: Icon,
  label,
  variant = "default",
  size = "md",
  isActive = false,
  isLoading = false,
  iconSize,
  iconStrokeWidth = 1.9,
  className,
  disabled,
  title,
  type = "button",
  ...buttonProps
}: IconButtonProps) {
  const resolvedIconSize =
    iconSize ?? DEFAULT_ICON_SIZE[size];

  return (
    <button
      {...buttonProps}
      ref={ref}
      type={type}
      aria-label={label}
      aria-busy={isLoading || undefined}
      data-active={isActive ? "true" : "false"}
      disabled={disabled || isLoading}
      title={title ?? label}
      className={cn(
        iconButtonVariants({
          variant,
          size,
          active: isActive,
        }),
        className,
      )}
    >
      {isLoading ? (
        <LoaderCircle
          aria-hidden="true"
          size={resolvedIconSize}
          strokeWidth={iconStrokeWidth}
          className="animate-spin motion-reduce:animate-none"
        />
      ) : (
        <Icon
          aria-hidden="true"
          size={resolvedIconSize}
          strokeWidth={iconStrokeWidth}
        />
      )}
    </button>
  );
}