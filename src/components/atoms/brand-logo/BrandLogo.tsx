"use client";

import Image from "next/image";

import { useTheme } from "@/providers/theme-provider";
import { cn } from "@/utils/cn";

import type {
  BrandLogoProps,
  BrandLogoSize,
} from "./BrandLogo.types";

const LOGO_SIZE_CLASSES: Record<BrandLogoSize, string> = {
  sm: "w-20",
  md: "w-28",
  lg: "w-36",
  xl: "w-44",
};

const LOGO_SIZES: Record<BrandLogoSize, string> = {
  sm: "80px",
  md: "112px",
  lg: "144px",
  xl: "176px",
};

const LOGOS = {
  light: {
    src: "/images/brand/Sin título-10.png",
    width: 2048,
    height: 1447,
  },
  dark: {
    src: "/images/brand/modooscuro.png",
    width: 1536,
    height: 1024,
  },
} as const;

export function BrandLogo({
  variant = "auto",
  size = "lg",
  alt = "Fixora",
  loading = "eager",
  className,
  imageClassName,
}: BrandLogoProps) {
  const { resolvedTheme } = useTheme();

  const resolvedVariant =
    variant === "auto"
      ? resolvedTheme
      : variant;

  const logo = LOGOS[resolvedVariant];

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        LOGO_SIZE_CLASSES[size],
        className,
      )}
    >
      <Image
        key={logo.src}
        src={logo.src}
        width={logo.width}
        height={logo.height}
        sizes={LOGO_SIZES[size]}
        alt={alt}
        loading={loading}
        draggable={false}
        className={cn(
          "h-auto w-full select-none object-contain",
          imageClassName,
        )}
      />
    </span>
  );
}