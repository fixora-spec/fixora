"use client";

import {
  useEffect,
  useRef,
} from "react";

import {
  PreloaderShell,
} from "@/components/templates/preloader-shell";

import {
  PRELOADER_CONFIG,
} from "@/config/preloader.config";

import {
  useAppPreloader,
} from "@/hooks/use-app-preloader";

import { cn } from "@/utils/cn";

import type {
  PreloaderStatus,
} from "@/types/preloader";

import type {
  AppPreloaderProps,
} from "./AppPreloader.types";

const DEFAULT_PRELOADER_Z_INDEX =
  9999;

const MINIMUM_Z_INDEX = 1;
const MAXIMUM_Z_INDEX = 2147483647;

function normalizeZIndex(
  zIndex: number,
): number {
  if (!Number.isFinite(zIndex)) {
    return DEFAULT_PRELOADER_Z_INDEX;
  }

  return Math.min(
    MAXIMUM_Z_INDEX,
    Math.max(
      MINIMUM_Z_INDEX,
      Math.round(zIndex),
    ),
  );
}

function normalizeDuration(
  durationMs: number,
): number {
  if (
    !Number.isFinite(durationMs) ||
    durationMs <= 0
  ) {
    return (
      PRELOADER_CONFIG.animation
        .totalDurationMs
    );
  }

  return Math.max(
    1,
    durationMs,
  );
}

function normalizeInitialProgress(
  progress: number,
): number {
  if (!Number.isFinite(progress)) {
    return (
      PRELOADER_CONFIG.progress
        .minimum
    );
  }

  return Math.min(
    PRELOADER_CONFIG.progress
      .maximum,

    Math.max(
      PRELOADER_CONFIG.progress
        .minimum,

      progress,
    ),
  );
}

export function AppPreloader({
  enabled = true,

  durationMs =
    PRELOADER_CONFIG.animation
      .totalDurationMs,

  initialProgress =
    PRELOADER_CONFIG.progress
      .minimum,

  lockDocumentScroll = true,

  zIndex =
    DEFAULT_PRELOADER_Z_INDEX,

  testId =
    "fixora-app-preloader",

  onStart,
  onProgress,
  onStatusChange,
  onModeChange,
  onPhaseChange,
  onComplete,

  decorative = false,

  className,
  style,

  ...shellProps
}: AppPreloaderProps) {
  const normalizedDurationMs =
    normalizeDuration(
      durationMs,
    );

  const normalizedInitialProgress =
    normalizeInitialProgress(
      initialProgress,
    );

  const normalizedZIndex =
    normalizeZIndex(
      zIndex,
    );

  const {
    status,
    progress,
    elapsedMs,
    currentMode,
    currentPhase,
    isVisible,
    isFinishing,
  } = useAppPreloader({
    enabled,

    durationMs:
      normalizedDurationMs,

    initialProgress:
      normalizedInitialProgress,
  });

  /*
   * Permite detectar transiciones reales
   * de estado sin ejecutar nuevamente los
   * callbacks cuando cambia su referencia.
   */
  const previousStatusRef =
    useRef<PreloaderStatus>(
      "idle",
    );

  /*
   * Anuncia el progreso solamente cuando
   * cambia su valor entero.
   */
  const previousProgressRef =
    useRef<number | null>(
      null,
    );

  /*
   * Controla los callbacks de estado,
   * inicio y finalización.
   */
  useEffect(() => {
    const previousStatus =
      previousStatusRef.current;

    if (
      previousStatus === status
    ) {
      return;
    }

    onStatusChange?.(
      status,
    );

    if (
      status === "loading"
    ) {
      onStart?.();
    }

    /*
     * No se dispara onComplete cuando el
     * componente inicia directamente en
     * completed porque está desactivado
     * o porque la estrategia de almacenamiento
     * indica que ya fue mostrado.
     */
    if (
      status === "completed" &&
      previousStatus !== "idle"
    ) {
      onComplete?.();
    }

    previousStatusRef.current =
      status;
  }, [
    onComplete,
    onStart,
    onStatusChange,
    status,
  ]);

  useEffect(() => {
    const roundedProgress =
      Math.round(progress);

    if (
      previousProgressRef.current ===
      roundedProgress
    ) {
      return;
    }

    previousProgressRef.current =
      roundedProgress;

    onProgress?.(
      roundedProgress,
    );
  }, [
    onProgress,
    progress,
  ]);

  useEffect(() => {
    onModeChange?.(
      currentMode,
    );
  }, [
    currentMode,
    onModeChange,
  ]);

  useEffect(() => {
    onPhaseChange?.(
      currentPhase,
    );
  }, [
    currentPhase,
    onPhaseChange,
  ]);

  /*
   * Impide que el contenido del proyecto
   * se desplace detrás del preloader.
   *
   * Al desmontarse o terminar la carga,
   * todos los estilos originales se restauran.
   */
  useEffect(() => {
    if (
      !lockDocumentScroll ||
      !isVisible ||
      typeof document === "undefined" ||
      typeof window === "undefined"
    ) {
      return;
    }

    const documentElement =
      document.documentElement;

    const body =
      document.body;

    const previousHtmlOverflow =
      documentElement.style.overflow;

    const previousHtmlOverscroll =
      documentElement.style
        .overscrollBehavior;

    const previousHtmlTouchAction =
      documentElement.style.touchAction;

    const previousBodyOverflow =
      body.style.overflow;

    const previousBodyPaddingRight =
      body.style.paddingRight;

    const previousPreloaderAttribute =
      documentElement.getAttribute(
        "data-preloader-open",
      );

    const scrollbarWidth =
      Math.max(
        0,
        window.innerWidth -
          documentElement.clientWidth,
      );

    documentElement.setAttribute(
      "data-preloader-open",
      "true",
    );

    documentElement.style.overflow =
      "hidden";

    documentElement.style
      .overscrollBehavior =
      "none";

    documentElement.style.touchAction =
      "none";

    body.style.overflow =
      "hidden";

    /*
     * Compensa el ancho de la barra
     * de desplazamiento para evitar que
     * la página se mueva horizontalmente.
     */
    if (scrollbarWidth > 0) {
      const computedPaddingRight =
        Number.parseFloat(
          window
            .getComputedStyle(body)
            .paddingRight,
        ) || 0;

      body.style.paddingRight =
        `${
          computedPaddingRight +
          scrollbarWidth
        }px`;
    }

    return () => {
      documentElement.style.overflow =
        previousHtmlOverflow;

      documentElement.style
        .overscrollBehavior =
        previousHtmlOverscroll;

      documentElement.style.touchAction =
        previousHtmlTouchAction;

      body.style.overflow =
        previousBodyOverflow;

      body.style.paddingRight =
        previousBodyPaddingRight;

      if (
        previousPreloaderAttribute ===
        null
      ) {
        documentElement.removeAttribute(
          "data-preloader-open",
        );
      } else {
        documentElement.setAttribute(
          "data-preloader-open",
          previousPreloaderAttribute,
        );
      }
    };
  }, [
    isVisible,
    lockDocumentScroll,
  ]);

  /*
   * El organismo no renderiza nada después
   * de finalizar completamente la salida.
   */
  if (!isVisible) {
    return null;
  }

  return (
    <div
      data-app-preloader=""
      data-testid={testId}
      data-status={status}
      data-mode={currentMode}
      data-phase={
        currentPhase.id
      }
      data-progress={
        Math.round(progress)
      }
      className={cn(
        "fixed inset-0",

        "isolate",
        "overflow-hidden",

        "pointer-events-auto",

        className,
      )}
      style={{
        zIndex:
          normalizedZIndex,
      }}
    >
      <PreloaderShell
        {...shellProps}
        mode={currentMode}
        status={status}
        currentPhase={
          currentPhase
        }
        elapsedMs={elapsedMs}
        progress={progress}
        isFinishing={
          isFinishing
        }
        decorative={
          decorative
        }
        className="size-full"
        style={style}
      />
    </div>
  );
}