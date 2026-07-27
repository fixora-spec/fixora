"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  PRELOADER_CONFIG,
} from "@/config/preloader.config";

import {
  clampPreloaderProgress,
  clearPreloaderStorage,
  getPreloaderPhase,
  getPreloaderProgress,
  markPreloaderCompleted,
  shouldShowPreloader,
} from "@/lib/preloader";

import type {
  PreloaderStatus,
  UseAppPreloaderOptions,
  UseAppPreloaderReturn,
} from "@/types/preloader";

type PreloaderRuntimeState = {
  status: PreloaderStatus;
  elapsedMs: number;
  progress: number;
};

const MINIMUM_DURATION_MS = 1;

/*
 * Esta variable vive únicamente durante la carga
 * actual del documento en el navegador.
 *
 * - Se reinicia automáticamente con F5 o al pulsar
 *   el botón Recargar del navegador.
 * - Se conserva durante la navegación interna de
 *   Next.js, incluido el cambio de idioma.
 */
let hasStartedPreloaderInCurrentDocument =
  false;

function normalizeDuration(
  durationMs?: number,
): number {
  if (
    durationMs === undefined ||
    !Number.isFinite(durationMs) ||
    durationMs <= 0
  ) {
    return (
      PRELOADER_CONFIG.animation
        .totalDurationMs
    );
  }

  return Math.max(
    MINIMUM_DURATION_MS,
    durationMs,
  );
}

function getElapsedFromProgress(
  progress: number,
  durationMs: number,
): number {
  const minimum =
    PRELOADER_CONFIG.progress.minimum;

  const maximum =
    PRELOADER_CONFIG.progress.maximum;

  const range =
    maximum - minimum;

  if (range <= 0) {
    return 0;
  }

  const normalizedProgress =
    clampPreloaderProgress(
      progress,
    );

  const progressRatio =
    (
      normalizedProgress -
      minimum
    ) / range;

  return Math.min(
    durationMs,
    Math.max(
      0,
      progressRatio *
        durationMs,
    ),
  );
}

function createInitialState(
  enabled: boolean,
  durationMs: number,
  initialProgress: number,
): PreloaderRuntimeState {
  const normalizedProgress =
    clampPreloaderProgress(
      initialProgress,
    );

  const elapsedMs =
    getElapsedFromProgress(
      normalizedProgress,
      durationMs,
    );

  const maximum =
    PRELOADER_CONFIG.progress.maximum;

  const hasAlreadyStartedInBrowser =
    typeof window !== "undefined" &&
    hasStartedPreloaderInCurrentDocument;

  if (
    !enabled ||
    hasAlreadyStartedInBrowser ||
    normalizedProgress >= maximum ||
    !shouldShowPreloader(
      PRELOADER_CONFIG.storage
        .strategy,
    )
  ) {
    return {
      status: "completed",
      elapsedMs: durationMs,
      progress: maximum,
    };
  }

  return {
    status: "loading",
    elapsedMs,
    progress: normalizedProgress,
  };
}

function cancelFrame(
  frameId: number | null,
): void {
  if (
    frameId === null ||
    typeof window === "undefined"
  ) {
    return;
  }

  window.cancelAnimationFrame(
    frameId,
  );
}

export function useAppPreloader({
  enabled = true,
  durationMs,
  initialProgress = 0,
}: UseAppPreloaderOptions = {}):
  UseAppPreloaderReturn {
  const effectiveDurationMs =
    useMemo(
      () =>
        normalizeDuration(
          durationMs,
        ),
      [durationMs],
    );

  const normalizedInitialProgress =
    useMemo(
      () =>
        clampPreloaderProgress(
          initialProgress,
        ),
      [initialProgress],
    );

  const [
    runtimeState,
    setRuntimeState,
  ] = useState<PreloaderRuntimeState>(
    () =>
      createInitialState(
        enabled,
        effectiveDurationMs,
        normalizedInitialProgress,
      ),
  );

  const animationFrameRef =
    useRef<number | null>(null);

  /*
   * Se usa number porque el temporizador
   * pertenece al navegador mediante
   * window.setTimeout.
   */
  const finishTimerRef =
    useRef<number | null>(null);

  const elapsedMsRef =
    useRef(runtimeState.elapsedMs);

  const mountedRef =
    useRef(true);

  const shouldMarkDocumentRef =
    useRef(
      enabled &&
        runtimeState.status !==
          "completed",
    );

  const clearAnimationFrame =
    useCallback((): void => {
      cancelFrame(
        animationFrameRef.current,
      );

      animationFrameRef.current =
        null;
    }, []);

  const clearFinishTimer =
    useCallback((): void => {
      if (
        finishTimerRef.current ===
          null ||
        typeof window ===
          "undefined"
      ) {
        return;
      }

      window.clearTimeout(
        finishTimerRef.current,
      );

      finishTimerRef.current =
        null;
    }, []);

  useEffect(() => {
    mountedRef.current = true;

    /*
     * Se marca después del primer montaje real.
     * De este modo, React Strict Mode puede ejecutar
     * sus comprobaciones de desarrollo sin impedir
     * que el preloader aparezca al cargar la página.
     */
    if (shouldMarkDocumentRef.current) {
      hasStartedPreloaderInCurrentDocument =
        true;
    }

    return () => {
      mountedRef.current = false;

      cancelFrame(
        animationFrameRef.current,
      );

      animationFrameRef.current =
        null;

      if (
        finishTimerRef.current !==
          null
      ) {
        window.clearTimeout(
          finishTimerRef.current,
        );

        finishTimerRef.current =
          null;
      }
    };
  }, []);

  useEffect(() => {
    if (
      runtimeState.status !==
      "loading"
    ) {
      return;
    }

    clearAnimationFrame();

    const startingElapsedMs =
      elapsedMsRef.current;

    const startedAt =
      performance.now();

    const renderFrame = (
      timestamp: number,
    ): void => {
      if (!mountedRef.current) {
        return;
      }

      const elapsedSinceStart =
        Math.max(
          0,
          timestamp - startedAt,
        );

      const nextElapsedMs =
        Math.min(
          effectiveDurationMs,
          startingElapsedMs +
            elapsedSinceStart,
        );

      const nextProgress =
        getPreloaderProgress(
          nextElapsedMs,
          effectiveDurationMs,
        );

      elapsedMsRef.current =
        nextElapsedMs;

      const hasFinished =
        nextElapsedMs >=
        effectiveDurationMs;

      setRuntimeState(
        (currentState) => {
          if (
            currentState.status !==
            "loading"
          ) {
            return currentState;
          }

          return {
            status: hasFinished
              ? "finishing"
              : "loading",

            elapsedMs:
              nextElapsedMs,

            progress:
              nextProgress,
          };
        },
      );

      if (hasFinished) {
        animationFrameRef.current =
          null;

        return;
      }

      animationFrameRef.current =
        window.requestAnimationFrame(
          renderFrame,
        );
    };

    animationFrameRef.current =
      window.requestAnimationFrame(
        renderFrame,
      );

    return () => {
      clearAnimationFrame();
    };
  }, [
    clearAnimationFrame,
    effectiveDurationMs,
    runtimeState.status,
  ]);

  useEffect(() => {
    if (
      runtimeState.status !==
      "finishing"
    ) {
      return;
    }

    clearFinishTimer();

    finishTimerRef.current =
      window.setTimeout(
        () => {
          if (!mountedRef.current) {
            return;
          }

          markPreloaderCompleted(
            PRELOADER_CONFIG.storage
              .strategy,
          );

          elapsedMsRef.current =
            effectiveDurationMs;

          setRuntimeState({
            status: "completed",

            elapsedMs:
              effectiveDurationMs,

            progress:
              PRELOADER_CONFIG.progress
                .maximum,
          });

          finishTimerRef.current =
            null;
        },
        PRELOADER_CONFIG.animation
          .fadeOutDurationMs,
      );

    return () => {
      clearFinishTimer();
    };
  }, [
    clearFinishTimer,
    effectiveDurationMs,
    runtimeState.status,
  ]);

  useEffect(() => {
    if (enabled) {
      return;
    }

    const disableTimer =
      window.setTimeout(
        () => {
          clearAnimationFrame();
          clearFinishTimer();

          elapsedMsRef.current =
            effectiveDurationMs;

          setRuntimeState({
            status: "completed",

            elapsedMs:
              effectiveDurationMs,

            progress:
              PRELOADER_CONFIG.progress
                .maximum,
          });
        },
        0,
      );

    return () => {
      window.clearTimeout(
        disableTimer,
      );
    };
  }, [
    clearAnimationFrame,
    clearFinishTimer,
    effectiveDurationMs,
    enabled,
  ]);

  const startPreloader =
    useCallback((): void => {
      if (!enabled) {
        return;
      }

      clearAnimationFrame();
      clearFinishTimer();

      const startingElapsedMs =
        getElapsedFromProgress(
          normalizedInitialProgress,
          effectiveDurationMs,
        );

      elapsedMsRef.current =
        startingElapsedMs;

      setRuntimeState({
        status: "loading",

        elapsedMs:
          startingElapsedMs,

        progress:
          normalizedInitialProgress,
      });
    }, [
      clearAnimationFrame,
      clearFinishTimer,
      effectiveDurationMs,
      enabled,
      normalizedInitialProgress,
    ]);

  const finishPreloader =
    useCallback((): void => {
      clearAnimationFrame();
      clearFinishTimer();

      elapsedMsRef.current =
        effectiveDurationMs;

      setRuntimeState({
        status: "finishing",

        elapsedMs:
          effectiveDurationMs,

        progress:
          PRELOADER_CONFIG.progress
            .maximum,
      });
    }, [
      clearAnimationFrame,
      clearFinishTimer,
      effectiveDurationMs,
    ]);

  const restartPreloader =
    useCallback((): void => {
      if (!enabled) {
        return;
      }

      clearAnimationFrame();
      clearFinishTimer();

      clearPreloaderStorage(
        PRELOADER_CONFIG.storage
          .strategy,
      );

      elapsedMsRef.current = 0;

      setRuntimeState({
        status: "loading",

        elapsedMs: 0,

        progress:
          PRELOADER_CONFIG.progress
            .minimum,
      });
    }, [
      clearAnimationFrame,
      clearFinishTimer,
      enabled,
    ]);

  /*
   * Las fases están configuradas para
   * una duración base de 6000 ms.
   *
   * Si se proporciona otra duración,
   * se escala el tiempo para conservar:
   *
   * oscuro → claro → oscuro.
   */
  const timelineElapsedMs =
    effectiveDurationMs > 0
      ? (
          runtimeState.elapsedMs /
          effectiveDurationMs
        ) *
        PRELOADER_CONFIG.animation
          .totalDurationMs
      : 0;

  const currentPhase =
    getPreloaderPhase(
      timelineElapsedMs,
    );

  const isLoading =
    runtimeState.status ===
    "loading";

  const isFinishing =
    runtimeState.status ===
    "finishing";

  const isCompleted =
    runtimeState.status ===
    "completed";

  const isVisible =
    isLoading ||
    isFinishing;

  return {
    status:
      runtimeState.status,

    progress:
      runtimeState.progress,

    elapsedMs:
      runtimeState.elapsedMs,

    currentMode:
      currentPhase.mode,

    currentPhase,

    isVisible,
    isLoading,
    isFinishing,
    isCompleted,

    startPreloader,
    finishPreloader,
    restartPreloader,
  };
}