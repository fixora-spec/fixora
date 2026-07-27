"use client";

import type {
  CSSProperties,
} from "react";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";

import {
  useReducedMotion,
} from "motion/react";

import {
  PRELOADER_CONFIG,
} from "@/config/preloader.config";

import {
  createRingParticles,
  drawParticleRing,
  resizePreloaderCanvas,
} from "@/lib/preloader";

import { cn } from "@/utils/cn";

import type {
  PreloaderParticleRingProps,
} from "./PreloaderParticleRing.types";

const MINIMUM_RING_SIZE_PX = 1;
const MAXIMUM_RING_SIZE_PX = 500;

function normalizeRingSize(
  sizePx: number,
): number {
  if (!Number.isFinite(sizePx)) {
    return (
      PRELOADER_CONFIG
        .particleRing
        .size.desktop
    );
  }

  return Math.min(
    MAXIMUM_RING_SIZE_PX,
    Math.max(
      MINIMUM_RING_SIZE_PX,
      sizePx,
    ),
  );
}

function normalizeDimension(
  dimension: number,
): number {
  if (!Number.isFinite(dimension)) {
    return 1;
  }

  return Math.max(
    1,
    Math.round(dimension),
  );
}

function getResponsiveSize(): string {
  const sizeConfig =
    PRELOADER_CONFIG
      .particleRing
      .size;

  return [
    "clamp(",
    `${sizeConfig.mobile}px,`,
    "18vw,",
    `${sizeConfig.desktop}px`,
    ")",
  ].join(" ");
}

export function PreloaderParticleRing({
  mode,
  elapsedMs,
  progress,
  particles,
  particleCount,
  trailLength,
  seed =
    "fixora-preloader-particle-ring",
  sizePx,
  reducedMotion,
  decorative = true,
  label = "Progreso de carga de Fixora",
  canvasClassName,
  className,
  style,
  ...divProps
}: PreloaderParticleRingProps) {
  const prefersReducedMotion =
    useReducedMotion();

  const shouldReduceMotion =
    reducedMotion ??
    prefersReducedMotion ??
    false;

  const containerRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const canvasRef =
    useRef<HTMLCanvasElement | null>(
      null,
    );

  /*
   * Mantiene disponible la función de
   * dibujo más reciente para utilizarla
   * desde ResizeObserver sin reinstalar
   * el observador en cada fotograma.
   */
  const drawFrameRef =
    useRef<() => void>(
      () => undefined,
    );

  const resolvedParticles =
    useMemo(
      () =>
        particles ??
        createRingParticles({
          particleCount,
          trailLength,
          seed,
        }),
      [
        particleCount,
        particles,
        seed,
        trailLength,
      ],
    );

  const resolvedSize =
    sizePx === undefined
      ? undefined
      : normalizeRingSize(
          sizePx,
        );

  const containerStyle:
    CSSProperties = {
    width:
      resolvedSize === undefined
        ? getResponsiveSize()
        : `${resolvedSize}px`,

    aspectRatio: "1 / 1",
    maxWidth: "100%",

    ...style,
  };

  const drawCurrentFrame =
    useCallback((): void => {
      const container =
        containerRef.current;

      const canvas =
        canvasRef.current;

      if (!container || !canvas) {
        return;
      }

      const bounds =
        container.getBoundingClientRect();

      const canvasWidth =
        normalizeDimension(
          bounds.width,
        );

      const canvasHeight =
        normalizeDimension(
          bounds.height,
        );

      const context =
        canvas.getContext("2d");

      if (!context) {
        return;
      }

      /*
       * Se utiliza el tamaño real visible
       * del contenedor para que el anillo
       * se adapte correctamente a móvil,
       * tablet y escritorio.
       */
      const visibleRingSize =
        resolvedSize ??
        Math.min(
          canvasWidth,
          canvasHeight,
        );

      drawParticleRing({
        context,
        canvasWidth,
        canvasHeight,

        ringSizePx:
          visibleRingSize,

        elapsedMs,
        progress,
        mode,

        particles:
          resolvedParticles,

        reducedMotion:
          shouldReduceMotion,
      });
    }, [
      elapsedMs,
      mode,
      progress,
      resolvedParticles,
      resolvedSize,
      shouldReduceMotion,
    ]);

  /*
   * Actualiza la referencia y dibuja
   * cada vez que cambian el progreso,
   * el modo o el tiempo transcurrido.
   */
  useEffect(() => {
    drawFrameRef.current =
      drawCurrentFrame;

    drawCurrentFrame();
  }, [
    drawCurrentFrame,
  ]);

  /*
   * Ajusta la resolución interna del
   * Canvas únicamente cuando cambia
   * el tamaño de su contenedor.
   */
  useEffect(() => {
    const container =
      containerRef.current;

    const canvas =
      canvasRef.current;

    if (!container || !canvas) {
      return;
    }

    const resizeCanvas =
      (): void => {
        const bounds =
          container.getBoundingClientRect();

        const width =
          normalizeDimension(
            bounds.width,
          );

        const height =
          normalizeDimension(
            bounds.height,
          );

        resizePreloaderCanvas({
          canvas,
          width,
          height,
        });

        drawFrameRef.current();
      };

    resizeCanvas();

    if (
      typeof ResizeObserver ===
      "undefined"
    ) {
      window.addEventListener(
        "resize",
        resizeCanvas,
      );

      return () => {
        window.removeEventListener(
          "resize",
          resizeCanvas,
        );
      };
    }

    const resizeObserver =
      new ResizeObserver(
        resizeCanvas,
      );

    resizeObserver.observe(
      container,
    );

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div
      {...divProps}
      ref={containerRef}
      role={
        decorative
          ? undefined
          : "img"
      }
      aria-hidden={
        decorative
          ? true
          : undefined
      }
      aria-label={
        decorative
          ? undefined
          : label
      }
      data-preloader-particle-ring=""
      data-mode={mode}
      data-progress={
        Math.round(progress)
      }
      className={cn(
        "relative shrink-0",
        "overflow-visible",
        "select-none",

        className,
      )}
      style={containerStyle}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={cn(
          "pointer-events-none",
          "absolute inset-0",
          "size-full",

          "select-none",

          canvasClassName,
        )}
      />

      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none",
          "absolute inset-[18%]",
          "rounded-full",

          "opacity-60",
          "blur-2xl",

          "transition-[background-color,opacity]",
          "duration-500",
        )}
        style={{
          background:
            PRELOADER_CONFIG
              .palettes[mode]
              .glow,
        }}
      />
    </div>
  );
}