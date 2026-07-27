"use client";

import type {
  CSSProperties,
} from "react";

import {
  useMemo,
} from "react";

import {
  useReducedMotion,
} from "motion/react";

import {
  PreloaderFloatingShape,
} from "@/components/atoms/preloader-floating-shape";

import {
  PRELOADER_CONFIG,
} from "@/config/preloader.config";

import {
  createFloatingShapes,
} from "@/lib/preloader";

import { cn } from "@/utils/cn";

import type {
  PreloaderBackgroundProps,
} from "./PreloaderBackground.types";

const DEFAULT_SEED =
  "fixora-global-preloader-background";

const DEFAULT_ANIMATION_DISTANCE_PX =
  22;

const DEFAULT_SPEED_MULTIPLIER =
  1;

const DEFAULT_BORDER_WIDTH_PX =
  1;

function normalizeAmount(
  amount: number,
): number {
  if (!Number.isFinite(amount)) {
    return (
      PRELOADER_CONFIG
        .floatingShapes
        .amount
    );
  }

  return Math.min(
    60,
    Math.max(
      0,
      Math.floor(amount),
    ),
  );
}

function normalizeAnimationDistance(
  distancePx: number,
): number {
  if (!Number.isFinite(distancePx)) {
    return (
      DEFAULT_ANIMATION_DISTANCE_PX
    );
  }

  return Math.max(
    0,
    distancePx,
  );
}

function normalizeSpeedMultiplier(
  multiplier: number,
): number {
  if (!Number.isFinite(multiplier)) {
    return (
      DEFAULT_SPEED_MULTIPLIER
    );
  }

  return Math.max(
    0.1,
    multiplier,
  );
}

function normalizeBorderWidth(
  widthPx: number,
): number {
  if (!Number.isFinite(widthPx)) {
    return (
      DEFAULT_BORDER_WIDTH_PX
    );
  }

  return Math.min(
    4,
    Math.max(
      0.5,
      widthPx,
    ),
  );
}

export function PreloaderBackground({
  mode,
  shapes,
  amount =
    PRELOADER_CONFIG
      .floatingShapes
      .amount,
  seed =
    DEFAULT_SEED,
  reducedMotion,
  animationDistancePx =
    DEFAULT_ANIMATION_DISTANCE_PX,
  speedMultiplier =
    DEFAULT_SPEED_MULTIPLIER,
  showShapeGlow = true,
  shapeColor,
  shapeBorderWidthPx =
    DEFAULT_BORDER_WIDTH_PX,
  showAmbientGlows = true,
  showGrid = true,
  showNoiseDots = true,
  decorative = true,
  shapeClassName,
  className,
  style,
  ...divProps
}: PreloaderBackgroundProps) {
  const prefersReducedMotion =
    useReducedMotion();

  const shouldReduceMotion =
    reducedMotion ??
    prefersReducedMotion ??
    false;

  const palette =
    PRELOADER_CONFIG
      .palettes[mode];

  const normalizedAmount =
    normalizeAmount(amount);

  const normalizedDistance =
    normalizeAnimationDistance(
      animationDistancePx,
    );

  const normalizedSpeed =
    normalizeSpeedMultiplier(
      speedMultiplier,
    );

  const normalizedBorderWidth =
    normalizeBorderWidth(
      shapeBorderWidthPx,
    );

  /*
   * Las formas se generan con una semilla
   * estable para evitar diferencias entre
   * servidor y navegador.
   */
  const resolvedShapes =
    useMemo(
      () =>
        shapes ??
        createFloatingShapes({
          amount:
            normalizedAmount,

          seed,
        }),
      [
        normalizedAmount,
        seed,
        shapes,
      ],
    );

  const backgroundStyle:
    CSSProperties = {
    backgroundColor:
      palette.background,

    backgroundImage: [
      `linear-gradient(145deg, ${palette.background} 0%, ${palette.backgroundSecondary} 52%, ${palette.background} 100%)`,
    ].join(", "),

    transitionDuration:
      `${PRELOADER_CONFIG.animation.themeTransitionDurationMs}ms`,

    ...style,
  };

  const primaryGlowStyle:
    CSSProperties = {
    background:
      `radial-gradient(circle, ${palette.glow} 0%, transparent 68%)`,
  };

  const secondaryGlowStyle:
    CSSProperties = {
    background:
      `radial-gradient(circle, ${palette.particleSecondary}24 0%, transparent 68%)`,
  };

  const gridStyle:
    CSSProperties = {
    backgroundImage: [
      `linear-gradient(${palette.border} 1px, transparent 1px)`,
      `linear-gradient(90deg, ${palette.border} 1px, transparent 1px)`,
    ].join(", "),

    backgroundSize:
      "72px 72px",

    maskImage:
      "radial-gradient(circle at center, black 0%, transparent 78%)",

    WebkitMaskImage:
      "radial-gradient(circle at center, black 0%, transparent 78%)",
  };

  const noiseDotsStyle:
    CSSProperties = {
    backgroundImage:
      `radial-gradient(circle, ${palette.floatingShape} 1px, transparent 1.4px)`,

    backgroundSize:
      "28px 28px",

    maskImage:
      "linear-gradient(to bottom, transparent, black 18%, black 82%, transparent)",

    WebkitMaskImage:
      "linear-gradient(to bottom, transparent, black 18%, black 82%, transparent)",
  };

  return (
    <div
      {...divProps}
      aria-hidden={
        decorative
          ? true
          : undefined
      }
      data-preloader-background=""
      data-mode={mode}
      className={cn(
        "pointer-events-none",
        "absolute inset-0",
        "overflow-hidden",
        "select-none",

        "transition-[background-color,background-image]",
        "ease-out",

        className,
      )}
      style={backgroundStyle}
    >
      {showAmbientGlows ? (
        <>
          <div
            aria-hidden="true"
            className={cn(
              "absolute",
              "-top-[22%]",
              "-left-[12%]",

              "size-[min(42rem,75vw)]",
              "rounded-full",

              "opacity-45",
              "blur-3xl",

              "transition-[background,opacity]",
              "duration-700",
            )}
            style={
              primaryGlowStyle
            }
          />

          <div
            aria-hidden="true"
            className={cn(
              "absolute",
              "-right-[18%]",
              "-bottom-[28%]",

              "size-[min(44rem,82vw)]",
              "rounded-full",

              "opacity-[0.16]",
              "blur-3xl",

              "transition-[background,opacity]",
              "duration-700",
            )}
            style={
              secondaryGlowStyle
            }
          />

          <div
            aria-hidden="true"
            className={cn(
              "absolute top-[34%]",
              "left-[58%]",

              "size-[min(20rem,42vw)]",
              "rounded-full",

              "opacity-[0.12]",
              "blur-[80px]",

              "transition-[background,opacity]",
              "duration-700",
            )}
            style={
              primaryGlowStyle
            }
          />
        </>
      ) : null}

      {showGrid ? (
        <div
          aria-hidden="true"
          className={cn(
            "absolute inset-0",

            "opacity-[0.16]",

            "transition-opacity",
            "duration-700",
          )}
          style={gridStyle}
        />
      ) : null}

      {showNoiseDots ? (
        <div
          aria-hidden="true"
          className={cn(
            "absolute inset-0",

            "opacity-[0.28]",

            "transition-opacity",
            "duration-700",
          )}
          style={
            noiseDotsStyle
          }
        />
      ) : null}

      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-0",
          "overflow-hidden",
        )}
      >
        {resolvedShapes.map(
          (shape) => (
            <PreloaderFloatingShape
              key={shape.id}
              shape={shape}
              mode={mode}
              reducedMotion={
                shouldReduceMotion
              }
              animationDistancePx={
                normalizedDistance
              }
              speedMultiplier={
                normalizedSpeed
              }
              borderWidthPx={
                normalizedBorderWidth
              }
              showGlow={
                showShapeGlow
              }
              shapeColor={
                shapeColor
              }
              className={
                shapeClassName
              }
            />
          ),
        )}
      </div>

      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-0",

          "bg-[radial-gradient(circle_at_center,transparent_25%,rgba(0,0,0,0.08)_100%)]",

          mode === "light" &&
            "opacity-30",

          mode === "dark" &&
            "opacity-70",

          "transition-opacity",
          "duration-700",
        )}
      />

      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-x-0 top-0",
          "h-px",

          "opacity-50",
        )}
        style={{
          background:
            `linear-gradient(90deg, transparent, ${palette.accent}, transparent)`,
        }}
      />

      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-x-0 bottom-0",
          "h-px",

          "opacity-30",
        )}
        style={{
          background:
            `linear-gradient(90deg, transparent, ${palette.particleSecondary}, transparent)`,
        }}
      />
    </div>
  );
}