"use client";

import type {
  CSSProperties,
} from "react";

import {
  motion,
  useReducedMotion,
} from "motion/react";

import type {
  HTMLMotionProps,
} from "motion/react";

import {
  PRELOADER_CONFIG,
} from "@/config/preloader.config";

import { cn } from "@/utils/cn";

import type {
  PreloaderShapeKind,
} from "@/types/preloader";

import type {
  PreloaderFloatingShapeProps,
} from "./PreloaderFloatingShape.types";

const DEFAULT_ANIMATION_DISTANCE_PX =
  22;

const DEFAULT_BORDER_WIDTH_PX =
  1;

const DEFAULT_SPEED_MULTIPLIER =
  1;

const MINIMUM_SPEED_MULTIPLIER =
  0.1;

const MINIMUM_DURATION_SECONDS =
  1;

const MINIMUM_BORDER_WIDTH_PX =
  0.5;

const MAXIMUM_BORDER_WIDTH_PX =
  4;

const MINIMUM_SHAPE_SIZE_PX =
  1;

const MINIMUM_DOT_SIZE_PX =
  3;

const MAXIMUM_DOT_SIZE_PX =
  9;

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

function normalizeBorderWidth(
  borderWidthPx: number,
): number {
  if (!Number.isFinite(borderWidthPx)) {
    return (
      DEFAULT_BORDER_WIDTH_PX
    );
  }

  return clamp(
    borderWidthPx,
    MINIMUM_BORDER_WIDTH_PX,
    MAXIMUM_BORDER_WIDTH_PX,
  );
}

function normalizeSpeedMultiplier(
  speedMultiplier: number,
): number {
  if (!Number.isFinite(speedMultiplier)) {
    return (
      DEFAULT_SPEED_MULTIPLIER
    );
  }

  return Math.max(
    MINIMUM_SPEED_MULTIPLIER,
    speedMultiplier,
  );
}

function normalizeDuration(
  durationSeconds: number,
  speedMultiplier: number,
): number {
  if (!Number.isFinite(durationSeconds)) {
    return (
      MINIMUM_DURATION_SECONDS
    );
  }

  return Math.max(
    MINIMUM_DURATION_SECONDS,
    durationSeconds /
      speedMultiplier,
  );
}

function normalizeDelay(
  delaySeconds: number,
  speedMultiplier: number,
): number {
  if (!Number.isFinite(delaySeconds)) {
    return 0;
  }

  return (
    delaySeconds /
    speedMultiplier
  );
}

function normalizeOpacity(
  opacity: number,
): number {
  return clamp(
    opacity,
    0,
    1,
  );
}

function normalizeBlur(
  blurPx: number,
): number {
  if (!Number.isFinite(blurPx)) {
    return 0;
  }

  return Math.max(
    0,
    blurPx,
  );
}

function getVisualSize(
  kind: PreloaderShapeKind,
  originalSizePx: number,
): number {
  const normalizedSize =
    Math.max(
      MINIMUM_SHAPE_SIZE_PX,
      Number.isFinite(originalSizePx)
        ? originalSizePx
        : MINIMUM_SHAPE_SIZE_PX,
    );

  if (kind === "dot") {
    return clamp(
      normalizedSize * 0.14,
      MINIMUM_DOT_SIZE_PX,
      MAXIMUM_DOT_SIZE_PX,
    );
  }

  return normalizedSize;
}

function getBaseRotation(
  kind: PreloaderShapeKind,
  rotationDeg: number,
): number {
  const normalizedRotation =
    Number.isFinite(rotationDeg)
      ? rotationDeg
      : 0;

  if (kind === "diamond") {
    return (
      normalizedRotation +
      45
    );
  }

  return normalizedRotation;
}

function getRotationDistance(
  kind: PreloaderShapeKind,
): number {
  switch (kind) {
    case "line":
      return 12;

    case "dot":
      return 0;

    case "hexagon":
      return 28;

    case "diamond":
      return 20;

    case "square":
    default:
      return 18;
  }
}

function getShapeStyle({
  kind,
  sizePx,
  borderWidthPx,
  color,
  blurPx,
  showGlow,
}: {
  kind: PreloaderShapeKind;
  sizePx: number;
  borderWidthPx: number;
  color: string;
  blurPx: number;
  showGlow: boolean;
}): CSSProperties {
  const commonStyle:
    CSSProperties = {
    width: sizePx,
    height: sizePx,
    color,

    filter:
      blurPx > 0
        ? `blur(${blurPx}px)`
        : undefined,

    boxShadow:
      showGlow
        ? [
            "0 0",
            `${Math.max(
              5,
              sizePx * 0.22,
            )}px`,
            "currentColor",
          ].join(" ")
        : undefined,
  };

  switch (kind) {
    case "dot":
      return {
        ...commonStyle,

        borderRadius:
          "9999px",

        backgroundColor:
          color,
      };

    case "line":
      return {
        ...commonStyle,

        height:
          borderWidthPx,

        borderRadius:
          "9999px",

        backgroundColor:
          color,

        transformOrigin:
          "center center",
      };

    case "hexagon":
      return {
        ...commonStyle,

        backgroundColor:
          color,

        clipPath:
          [
            "polygon(",
            "25% 6.7%,",
            "75% 6.7%,",
            "100% 50%,",
            "75% 93.3%,",
            "25% 93.3%,",
            "0% 50%",
            ")",
          ].join(" "),
      };

    case "diamond":
    case "square":
    default:
      return {
        ...commonStyle,

        borderWidth:
          borderWidthPx,

        borderStyle:
          "solid",

        borderColor:
          color,

        backgroundColor:
          "transparent",
      };
  }
}

export function PreloaderFloatingShape({
  shape,
  mode,
  reducedMotion,
  animationDistancePx =
    DEFAULT_ANIMATION_DISTANCE_PX,
  shapeColor,
  borderWidthPx =
    DEFAULT_BORDER_WIDTH_PX,
  showGlow = true,
  speedMultiplier =
    DEFAULT_SPEED_MULTIPLIER,
  className,
  style,
  ...motionSpanProps
}: PreloaderFloatingShapeProps) {
  const prefersReducedMotion =
    useReducedMotion();

  const shouldReduceMotion =
    reducedMotion ??
    prefersReducedMotion;

  const palette =
    PRELOADER_CONFIG
      .palettes[mode];

  const resolvedColor =
    shapeColor?.trim() ||
    palette.floatingShape;

  const normalizedDistance =
    normalizeAnimationDistance(
      animationDistancePx,
    );

  const normalizedBorderWidth =
    normalizeBorderWidth(
      borderWidthPx,
    );

  const normalizedSpeed =
    normalizeSpeedMultiplier(
      speedMultiplier,
    );

  const normalizedDuration =
    normalizeDuration(
      shape.durationSeconds,
      normalizedSpeed,
    );

  const normalizedDelay =
    normalizeDelay(
      shape.delaySeconds,
      normalizedSpeed,
    );

  const normalizedOpacity =
    normalizeOpacity(
      shape.opacity,
    );

  const normalizedBlur =
    normalizeBlur(
      shape.blurPx,
    );

  const visualSize =
    getVisualSize(
      shape.kind,
      shape.sizePx,
    );

  const baseRotation =
    getBaseRotation(
      shape.kind,
      shape.rotationDeg,
    );

  const rotationDistance =
    getRotationDistance(
      shape.kind,
    );

  const movementX =
    shape.directionX *
    normalizedDistance;

  const movementY =
    shape.directionY *
    normalizedDistance;

  /*
   * Se usan márgenes negativos para
   * centrar la figura porque Motion
   * controla las transformaciones.
   */
  const positioningStyle:
    CSSProperties = {
    left: `${shape.x}%`,
    top: `${shape.y}%`,

    marginLeft:
      -visualSize / 2,

    marginTop:
      shape.kind === "line"
        ? -normalizedBorderWidth / 2
        : -visualSize / 2,
  };

  const shapeStyle =
    getShapeStyle({
      kind:
        shape.kind,

      sizePx:
        visualSize,

      borderWidthPx:
        normalizedBorderWidth,

      color:
        resolvedColor,

      blurPx:
        normalizedBlur,

      showGlow,
    });

  /*
   * Se usa exactamente el tipo style
   * admitido por motion.span.
   */
  const combinedStyle:
    HTMLMotionProps<"span">["style"] = {
    ...positioningStyle,
    ...shapeStyle,

    opacity:
      shouldReduceMotion
        ? normalizedOpacity
        : undefined,

    rotate:
      shouldReduceMotion
        ? baseRotation
        : undefined,

    ...style,
  };

  return (
    <motion.span
      {...motionSpanProps}
      aria-hidden={true}
      data-preloader-shape=""
      data-shape-kind={
        shape.kind
      }
      data-mode={mode}
      className={cn(
        "pointer-events-none",
        "absolute block",
        "select-none",

        "will-change-transform",

        className,
      )}
      style={combinedStyle}
      initial={false}
      animate={
        shouldReduceMotion
          ? undefined
          : {
              x: [
                0,
                movementX,
                movementX * -0.4,
                0,
              ],

              y: [
                0,
                movementY,
                movementY * -0.4,
                0,
              ],

              rotate: [
                baseRotation,

                baseRotation +
                  rotationDistance,

                baseRotation -
                  rotationDistance *
                    0.35,

                baseRotation,
              ],

              scale: [
                1,
                1.045,
                0.98,
                1,
              ],

              opacity: [
                normalizedOpacity *
                  0.55,

                normalizedOpacity,

                normalizedOpacity *
                  0.72,

                normalizedOpacity *
                  0.55,
              ],
            }
      }
      transition={
        shouldReduceMotion
          ? undefined
          : {
              duration:
                normalizedDuration,

              delay:
                normalizedDelay,

              repeat:
                Infinity,

              repeatType:
                "loop",

              times: [
                0,
                0.34,
                0.7,
                1,
              ],

              ease:
                "easeInOut",
            }
      }
    >
      {shape.kind ===
      "hexagon" ? (
        <span
          aria-hidden={true}
          className={cn(
            "pointer-events-none",
            "absolute",
          )}
          style={{
            inset:
              normalizedBorderWidth,

            backgroundColor:
              palette.background,

            clipPath:
              [
                "polygon(",
                "25% 6.7%,",
                "75% 6.7%,",
                "100% 50%,",
                "75% 93.3%,",
                "25% 93.3%,",
                "0% 50%",
                ")",
              ].join(" "),
          }}
        />
      ) : null}
    </motion.span>
  );
}