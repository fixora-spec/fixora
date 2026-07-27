"use client";

import type {
  CSSProperties,
} from "react";

import {
  motion,
  useReducedMotion,
} from "motion/react";

import {
  PRELOADER_CONFIG,
} from "@/config/preloader.config";

import { cn } from "@/utils/cn";

import type {
  PreloaderProgressProps,
} from "./PreloaderProgress.types";

const DEFAULT_TRANSITION_DURATION_MS =
  90;

const MINIMUM_BAR_WIDTH_PX =
  80;

const MAXIMUM_BAR_WIDTH_PX =
  800;

const MINIMUM_BAR_HEIGHT_PX =
  1;

const MAXIMUM_BAR_HEIGHT_PX =
  20;

function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }

  return Math.min(
    maximum,
    Math.max(minimum, value),
  );
}

function normalizeRange(
  minimum: number,
  maximum: number,
): {
  minimum: number;
  maximum: number;
} {
  const safeMinimum =
    Number.isFinite(minimum)
      ? minimum
      : PRELOADER_CONFIG.progress.minimum;

  const safeMaximum =
    Number.isFinite(maximum)
      ? maximum
      : PRELOADER_CONFIG.progress.maximum;

  if (safeMinimum === safeMaximum) {
    return {
      minimum: safeMinimum,
      maximum: safeMinimum + 1,
    };
  }

  return {
    minimum: Math.min(
      safeMinimum,
      safeMaximum,
    ),

    maximum: Math.max(
      safeMinimum,
      safeMaximum,
    ),
  };
}

function normalizeTransitionDuration(
  durationMs: number,
): number {
  if (!Number.isFinite(durationMs)) {
    return (
      DEFAULT_TRANSITION_DURATION_MS
    );
  }

  return Math.max(
    0,
    durationMs,
  );
}

function normalizeBarWidth(
  widthPx: number,
): number {
  return clamp(
    widthPx,
    MINIMUM_BAR_WIDTH_PX,
    MAXIMUM_BAR_WIDTH_PX,
  );
}

function normalizeBarHeight(
  heightPx: number,
): number {
  return clamp(
    heightPx,
    MINIMUM_BAR_HEIGHT_PX,
    MAXIMUM_BAR_HEIGHT_PX,
  );
}

function getResponsiveBarWidth():
  string {
  const widthConfig =
    PRELOADER_CONFIG
      .progress
      .barWidth;

  return [
    "clamp(",
    `${widthConfig.mobile}px,`,
    "34vw,",
    `${widthConfig.desktop}px`,
    ")",
  ].join(" ");
}

export function PreloaderProgress({
  progress,
  mode,
  locale = "es",
  label,
  minimum =
    PRELOADER_CONFIG.progress.minimum,
  maximum =
    PRELOADER_CONFIG.progress.maximum,
  showPercentage =
    PRELOADER_CONFIG.progress
      .showPercentage,
  barWidthPx,
  barHeightPx =
    PRELOADER_CONFIG.progress
      .barHeightPx,
  transitionDurationMs =
    DEFAULT_TRANSITION_DURATION_MS,
  reducedMotion,
  accessibilityLabel,
  labelClassName,
  percentageClassName,
  trackClassName,
  fillClassName,
  className,
  style,
  ...divProps
}: PreloaderProgressProps) {
  const prefersReducedMotion =
    useReducedMotion();

  const shouldReduceMotion =
    reducedMotion ??
    prefersReducedMotion ??
    false;

  const palette =
    PRELOADER_CONFIG
      .palettes[mode];

  const normalizedRange =
    normalizeRange(
      minimum,
      maximum,
    );

  const normalizedProgress =
    clamp(
      progress,
      normalizedRange.minimum,
      normalizedRange.maximum,
    );

  const progressRatio =
    (
      normalizedProgress -
      normalizedRange.minimum
    ) /
    (
      normalizedRange.maximum -
      normalizedRange.minimum
    );

  const displayedPercentage =
    Math.round(
      progressRatio * 100,
    );

  const resolvedLabel =
    label?.trim() ||
    PRELOADER_CONFIG
      .progress
      .label[locale];

  const resolvedAccessibilityLabel =
    accessibilityLabel?.trim() ||
    `${resolvedLabel}: ${displayedPercentage}%`;

  const normalizedHeight =
    normalizeBarHeight(
      barHeightPx,
    );

  const normalizedTransitionMs =
    normalizeTransitionDuration(
      transitionDurationMs,
    );

  const resolvedWidth =
    barWidthPx === undefined
      ? getResponsiveBarWidth()
      : `${normalizeBarWidth(
          barWidthPx,
        )}px`;

  const containerStyle:
    CSSProperties = {
    width: resolvedWidth,
    maxWidth: "100%",
    ...style,
  };

  const fillBackground =
    [
      "linear-gradient(",
      "90deg,",
      `${palette.particleSecondary} 0%,`,
      `${palette.progressFill} 55%,`,
      `${palette.accent} 100%`,
      ")",
    ].join(" ");

  return (
    <div
      {...divProps}
      role="progressbar"
      aria-label={
        resolvedAccessibilityLabel
      }
      aria-valuemin={
        normalizedRange.minimum
      }
      aria-valuemax={
        normalizedRange.maximum
      }
      aria-valuenow={
        normalizedProgress
      }
      aria-valuetext={
        `${displayedPercentage}%`
      }
      data-preloader-progress=""
      data-mode={mode}
      data-progress={
        displayedPercentage
      }
      className={cn(
        "flex shrink-0",
        "flex-col items-center",

        "select-none",

        className,
      )}
      style={containerStyle}
    >
      <div
        aria-hidden="true"
        className={cn(
          "relative w-full",
          "overflow-hidden",
          "rounded-full",

          "transition-[background-color,box-shadow]",
          "duration-500",

          trackClassName,
        )}
        style={{
          height:
            normalizedHeight,

          backgroundColor:
            palette.progressTrack,

          boxShadow:
            `inset 0 0 0 1px ${palette.border}`,
        }}
      >
        <motion.div
          className={cn(
            "absolute inset-y-0 left-0",
            "rounded-full",

            "will-change-[width]",

            fillClassName,
          )}
          initial={false}
          animate={{
            width:
              `${displayedPercentage}%`,
          }}
          transition={{
            duration:
              shouldReduceMotion
                ? 0
                : normalizedTransitionMs /
                  1000,

            ease: "linear",
          }}
          style={{
            background:
              fillBackground,

            boxShadow:
              [
                "0 0",
                `${Math.max(
                  8,
                  normalizedHeight * 4,
                )}px`,
                palette.glow,
              ].join(" "),
          }}
        >
          <span
            aria-hidden="true"
            className={cn(
              "absolute top-1/2 right-0",

              "size-2.5",
              "-translate-y-1/2",
              "translate-x-1/2",

              "rounded-full",

              "opacity-90",
              "blur-[1px]",
            )}
            style={{
              backgroundColor:
                palette.foreground,

              boxShadow:
                [
                  "0 0 14px",
                  palette.glow,
                ].join(" "),
            }}
          />
        </motion.div>
      </div>

      <div
        className={cn(
          "mt-3 flex",
          "flex-col items-center",
          "gap-1.5",
        )}
      >
        <span
          className={cn(
            "text-center",

            "text-[11px]",
            "leading-none",
            "font-semibold",

            "tracking-[0.34em]",
            "uppercase",

            "transition-colors",
            "duration-500",

            labelClassName,
          )}
          style={{
            color:
              palette.foreground,
          }}
        >
          {resolvedLabel}
        </span>

        {showPercentage ? (
          <span
            aria-hidden="true"
            className={cn(
              "text-center",

              "text-sm",
              "leading-none",
              "font-semibold",

              "tabular-nums",
              "tracking-[0.18em]",

              "transition-colors",
              "duration-500",

              percentageClassName,
            )}
            style={{
              color:
                palette.accent,
            }}
          >
            {displayedPercentage}%
          </span>
        ) : null}
      </div>
    </div>
  );
}