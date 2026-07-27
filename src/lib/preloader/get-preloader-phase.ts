import {
  PRELOADER_CONFIG,
} from "@/config/preloader.config";

import type {
  PreloaderPhase,
  PreloaderThemeMode,
} from "@/types/preloader";

function normalizeElapsedTime(
  elapsedMs: number,
): number {
  if (!Number.isFinite(elapsedMs)) {
    return 0;
  }

  return Math.max(0, elapsedMs);
}

function validatePhases(
  phases: readonly PreloaderPhase[],
): void {
  if (phases.length === 0) {
    throw new Error(
      "El preloader debe contener al menos una fase.",
    );
  }
}

export function getPreloaderPhase(
  elapsedMs: number,
  phases: readonly PreloaderPhase[] =
    PRELOADER_CONFIG.animation.phases,
): PreloaderPhase {
  validatePhases(phases);

  const normalizedElapsedMs =
    normalizeElapsedTime(elapsedMs);

  const matchingPhase = phases.find(
    (phase) =>
      normalizedElapsedMs >=
        phase.startMs &&
      normalizedElapsedMs <
        phase.endMs,
  );

  if (matchingPhase) {
    return matchingPhase;
  }

  /*
   * Cuando el tiempo alcanza o supera
   * los 6000 ms, conservamos la última
   * fase hasta que termine la animación
   * de salida del preloader.
   */
  const lastPhase =
    phases[phases.length - 1];

  if (!lastPhase) {
    throw new Error(
      "No se encontró una fase válida para el preloader.",
    );
  }

  return lastPhase;
}

export function getPreloaderThemeMode(
  elapsedMs: number,
  phases: readonly PreloaderPhase[] =
    PRELOADER_CONFIG.animation.phases,
): PreloaderThemeMode {
  return getPreloaderPhase(
    elapsedMs,
    phases,
  ).mode;
}

export function isPreloaderPhaseActive(
  phase: PreloaderPhase,
  elapsedMs: number,
): boolean {
  const normalizedElapsedMs =
    normalizeElapsedTime(elapsedMs);

  return (
    normalizedElapsedMs >=
      phase.startMs &&
    normalizedElapsedMs <
      phase.endMs
  );
}

export function getPreloaderPhaseProgress(
  elapsedMs: number,
  phase: PreloaderPhase,
): number {
  const phaseDurationMs =
    phase.endMs -
    phase.startMs;

  if (phaseDurationMs <= 0) {
    return 1;
  }

  const normalizedElapsedMs =
    normalizeElapsedTime(elapsedMs);

  const elapsedInsidePhase =
    normalizedElapsedMs -
    phase.startMs;

  const progress =
    elapsedInsidePhase /
    phaseDurationMs;

  return Math.min(
    1,
    Math.max(0, progress),
  );
}