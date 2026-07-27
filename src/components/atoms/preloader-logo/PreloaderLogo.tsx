"use client";

import type {
  CSSProperties,
} from "react";

import Image from "next/image";

import {
  motion,
  useReducedMotion,
} from "motion/react";

import {
  PRELOADER_CONFIG,
} from "@/config/preloader.config";

import { cn } from "@/utils/cn";

import type {
  PreloaderLogoProps,
} from "./PreloaderLogo.types";

const MINIMUM_TRANSITION_DURATION_MS =
  0;

function normalizeTransitionDuration(
  durationMs: number,
): number {
  if (!Number.isFinite(durationMs)) {
    return (
      PRELOADER_CONFIG.animation
        .themeTransitionDurationMs
    );
  }

  return Math.max(
    MINIMUM_TRANSITION_DURATION_MS,
    durationMs,
  );
}

function normalizeSource(
  source: string | undefined,
  fallback: string,
): string {
  const normalizedSource =
    source?.trim();

  return normalizedSource ||
    fallback;
}

export function PreloaderLogo({
  mode,
  locale = "es",
  lightModeSrc,
  darkModeSrc,
  alt,
  decorative = false,
  priority,
  sizes,
  imageClassName,
  transitionDurationMs =
    PRELOADER_CONFIG.animation
      .themeTransitionDurationMs,
  className,
  style,
  ...divProps
}: PreloaderLogoProps) {
  const prefersReducedMotion =
    useReducedMotion();

  const logoConfig =
    PRELOADER_CONFIG.logo;

  const resolvedLightModeSrc =
    normalizeSource(
      lightModeSrc,
      logoConfig.lightModeSrc,
    );

  const resolvedDarkModeSrc =
    normalizeSource(
      darkModeSrc,
      logoConfig.darkModeSrc,
    );

  const resolvedAlt =
    decorative
      ? ""
      : alt?.trim() ||
        logoConfig.alt[locale];

  const resolvedPriority =
    priority ??
    logoConfig.priority;

  const resolvedSizes =
    sizes ??
    [
      `(max-width: 639px) ${logoConfig.width.mobile}px`,
      `(max-width: 1023px) ${logoConfig.width.tablet}px`,
      `${logoConfig.width.desktop}px`,
    ].join(", ");

  const normalizedTransitionMs =
    normalizeTransitionDuration(
      transitionDurationMs,
    );

  const transitionDurationSeconds =
    prefersReducedMotion
      ? 0
      : normalizedTransitionMs /
        1000;

  const aspectRatio =
    logoConfig.width.desktop /
    logoConfig.height;

  const responsiveWidth =
    [
      `clamp(`,
      `${logoConfig.width.mobile}px,`,
      `22vw,`,
      `${logoConfig.width.desktop}px`,
      `)`,
    ].join(" ");

  const containerStyle: CSSProperties = {
    width: responsiveWidth,
    aspectRatio,
    ...style,
  };

  const lightLogoIsActive =
    mode === "light";

  const darkLogoIsActive =
    mode === "dark";

  return (
    <div
      {...divProps}
      aria-hidden={
        decorative
          ? true
          : undefined
      }
      data-preloader-logo=""
      data-mode={mode}
      className={cn(
        "relative shrink-0",
        "select-none",
        "overflow-visible",

        className,
      )}
      style={containerStyle}
    >
      <motion.div
        aria-hidden={
          !lightLogoIsActive
        }
        className="absolute inset-0"
        initial={false}
        animate={{
          opacity:
            lightLogoIsActive
              ? 1
              : 0,

          scale:
            lightLogoIsActive
              ? 1
              : 0.975,

          filter:
            lightLogoIsActive
              ? "blur(0px)"
              : "blur(2px)",
        }}
        transition={{
          duration:
            transitionDurationSeconds,

          ease: [
            0.22,
            1,
            0.36,
            1,
          ],
        }}
      >
        <Image
          src={
            resolvedLightModeSrc
          }
          alt={
            lightLogoIsActive
              ? resolvedAlt
              : ""
          }
          fill
          priority={
            resolvedPriority
          }
          sizes={resolvedSizes}
          draggable={false}
          className={cn(
            "object-contain",
            "object-center",

            "drop-shadow-[0_12px_28px_rgba(12,15,12,0.12)]",

            "transition-[filter]",
            "duration-500",

            imageClassName,
          )}
        />
      </motion.div>

      <motion.div
        aria-hidden={
          !darkLogoIsActive
        }
        className="absolute inset-0"
        initial={false}
        animate={{
          opacity:
            darkLogoIsActive
              ? 1
              : 0,

          scale:
            darkLogoIsActive
              ? 1
              : 0.975,

          filter:
            darkLogoIsActive
              ? "blur(0px)"
              : "blur(2px)",
        }}
        transition={{
          duration:
            transitionDurationSeconds,

          ease: [
            0.22,
            1,
            0.36,
            1,
          ],
        }}
      >
        <Image
          src={
            resolvedDarkModeSrc
          }
          alt={
            darkLogoIsActive
              ? resolvedAlt
              : ""
          }
          fill
          priority={
            resolvedPriority
          }
          sizes={resolvedSizes}
          draggable={false}
          className={cn(
            "object-contain",
            "object-center",

            "drop-shadow-[0_14px_34px_rgba(99,189,61,0.18)]",

            "transition-[filter]",
            "duration-500",

            imageClassName,
          )}
        />
      </motion.div>
    </div>
  );
}