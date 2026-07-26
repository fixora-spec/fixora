"use client";

import { cva } from "class-variance-authority";

import { cn } from "@/utils/cn";

import type {
  MenuTriggerProps,
  MenuTriggerSize,
} from "./MenuTrigger.types";

const menuTriggerVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center",
    "rounded-full border",

    "transition-[background-color,color,border-color,box-shadow,transform]",
    "duration-300 ease-out",

    "hover:scale-[1.04]",
    "active:scale-[0.96]",

    "focus-visible:outline-none",
    "focus-visible:ring-2",
    "focus-visible:ring-[#4ead35]",
    "focus-visible:ring-offset-2",
    "focus-visible:ring-offset-[#fdfefe]",

    "dark:focus-visible:ring-[#57af33]",
    "dark:focus-visible:ring-offset-[#0c0f0c]",

    "disabled:pointer-events-none",
    "disabled:cursor-not-allowed",
    "disabled:opacity-50",

    "motion-reduce:transform-none",
    "motion-reduce:transition-none",
  ],
  {
    variants: {
      variant: {
        navigation: [
          "border-[#393939]/15",
          "bg-white",
          "text-[#393939]",
          "shadow-[0_8px_24px_rgba(57,57,57,0.10)]",

          "hover:border-[#4ead35]/50",
          "hover:bg-[#f7faf6]",
          "hover:shadow-[0_10px_28px_rgba(78,173,53,0.16)]",

          "data-[state=open]:border-[#4ead35]",
          "data-[state=open]:bg-[#4ead35]",
          "data-[state=open]:text-[#0c0f0c]",
          "data-[state=open]:shadow-[0_0_0_4px_rgba(78,173,53,0.12),0_10px_28px_rgba(78,173,53,0.24)]",

          "dark:border-white/12",
          "dark:bg-[#191c19]",
          "dark:text-[#f1f3f1]",
          "dark:shadow-[0_8px_28px_rgba(0,0,0,0.34)]",

          "dark:hover:border-[#57af33]/60",
          "dark:hover:bg-[#222622]",
          "dark:hover:shadow-[0_10px_30px_rgba(87,175,51,0.16)]",

          "dark:data-[state=open]:border-[#57af33]",
          "dark:data-[state=open]:bg-[#57af33]",
          "dark:data-[state=open]:text-[#0c0f0c]",
          "dark:data-[state=open]:shadow-[0_0_0_4px_rgba(87,175,51,0.14),0_10px_30px_rgba(87,175,51,0.26)]",
        ],

        "quick-actions": [
          // Modo claro: igual al botón hamburguesa.
          "border-[#393939]/15",
          "bg-white",
          "text-[#393939]",
          "shadow-[0_10px_30px_rgba(57,57,57,0.14)]",

          "hover:border-[#4ead35]/55",
          "hover:bg-[#f7faf6]",
          "hover:text-[#318b22]",
          "hover:shadow-[0_12px_34px_rgba(78,173,53,0.18)]",

          // Abierto: verde Fixora.
          "data-[state=open]:border-[#4ead35]",
          "data-[state=open]:bg-[#4ead35]",
          "data-[state=open]:text-[#0c0f0c]",
          "data-[state=open]:shadow-[0_0_0_5px_rgba(78,173,53,0.13),0_12px_32px_rgba(78,173,53,0.28)]",

          // Modo oscuro: fondo oscuro e ícono claro.
          "dark:border-white/12",
          "dark:bg-[#191c19]",
          "dark:text-[#f1f3f1]",
          "dark:shadow-[0_10px_32px_rgba(0,0,0,0.42)]",

          "dark:hover:border-[#57af33]/65",
          "dark:hover:bg-[#222622]",
          "dark:hover:text-[#6ac447]",
          "dark:hover:shadow-[0_12px_36px_rgba(87,175,51,0.18)]",

          // Abierto en modo oscuro: verde Fixora.
          "dark:data-[state=open]:border-[#57af33]",
          "dark:data-[state=open]:bg-[#57af33]",
          "dark:data-[state=open]:text-[#0c0f0c]",
          "dark:data-[state=open]:shadow-[0_0_0_5px_rgba(87,175,51,0.14),0_12px_34px_rgba(87,175,51,0.30)]",
        ],
      },

      size: {
        md: "size-12",
        lg: "size-[58px]",
      },
    },

    defaultVariants: {
      variant: "navigation",
      size: "md",
    },
  },
);

const DEFAULT_ICON_SIZE: Record<MenuTriggerSize, number> = {
  md: 22,
  lg: 24,
};

export function MenuTrigger({
  ref,
  isOpen,
  openLabel,
  closeLabel,
  controlsId,
  openIcon: OpenIcon,
  closeIcon: CloseIcon,
  variant = "navigation",
  size = "md",
  iconSize,
  iconStrokeWidth = 1.9,
  className,
  type = "button",
  disabled,
  title,
  ...buttonProps
}: MenuTriggerProps) {
  const currentLabel = isOpen ? closeLabel : openLabel;
  const resolvedIconSize = iconSize ?? DEFAULT_ICON_SIZE[size];

  return (
    <button
      {...buttonProps}
      ref={ref}
      type={type}
      aria-label={currentLabel}
      aria-expanded={isOpen}
      aria-controls={controlsId}
      data-state={isOpen ? "open" : "closed"}
      disabled={disabled}
      title={title ?? currentLabel}
      className={cn(
        menuTriggerVariants({
          variant,
          size,
        }),
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="relative flex size-6 items-center justify-center"
      >
        <OpenIcon
          size={resolvedIconSize}
          strokeWidth={iconStrokeWidth}
          className={cn(
            "absolute",
            "transition-[opacity,transform]",
            "duration-300 ease-out",

            isOpen
              ? "scale-75 rotate-90 opacity-0"
              : "scale-100 rotate-0 opacity-100",

            "motion-reduce:transition-none",
          )}
        />

        <CloseIcon
          size={resolvedIconSize}
          strokeWidth={iconStrokeWidth}
          className={cn(
            "absolute",
            "transition-[opacity,transform]",
            "duration-300 ease-out",

            isOpen
              ? "scale-100 rotate-0 opacity-100"
              : "scale-75 -rotate-90 opacity-0",

            "motion-reduce:transition-none",
          )}
        />
      </span>
    </button>
  );
}