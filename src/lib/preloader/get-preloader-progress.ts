import {
  PRELOADER_CONFIG,
} from "@/config/preloader.config";

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

  return durationMs;
}

function normalizeElapsedTime(
  elapsedMs: number,
  durationMs: number,
): number {
  if (!Number.isFinite(elapsedMs)) {
    return 0;
  }

  return Math.min(
    durationMs,
    Math.max(0, elapsedMs),
  );
}

export function getPreloaderProgress(
  elapsedMs: number,
  durationMs: number =
    PRELOADER_CONFIG.animation
      .totalDurationMs,
): number {
  const normalizedDurationMs =
    normalizeDuration(durationMs);

  const normalizedElapsedMs =
    normalizeElapsedTime(
      elapsedMs,
      normalizedDurationMs,
    );

  const minimum =
    PRELOADER_CONFIG.progress.minimum;

  const maximum =
    PRELOADER_CONFIG.progress.maximum;

  if (
    normalizedElapsedMs >=
    normalizedDurationMs
  ) {
    return maximum;
  }

  const progressRatio =
    normalizedElapsedMs /
    normalizedDurationMs;

  const progressRange =
    maximum - minimum;

  /*
   * Math.floor permite mostrar:
   *
   * 0 ms    → 0 %
   * 2000 ms → 33 %
   * 4000 ms → 66 %
   * 6000 ms → 100 %
   */
  return Math.floor(
    minimum +
      progressRatio *
        progressRange,
  );
}

export function getPreloaderProgressRatio(
  elapsedMs: number,
  durationMs: number =
    PRELOADER_CONFIG.animation
      .totalDurationMs,
): number {
  const normalizedDurationMs =
    normalizeDuration(durationMs);

  const normalizedElapsedMs =
    normalizeElapsedTime(
      elapsedMs,
      normalizedDurationMs,
    );

  return (
    normalizedElapsedMs /
    normalizedDurationMs
  );
}

export function isPreloaderComplete(
  elapsedMs: number,
  durationMs: number =
    PRELOADER_CONFIG.animation
      .totalDurationMs,
): boolean {
  const normalizedDurationMs =
    normalizeDuration(durationMs);

  if (!Number.isFinite(elapsedMs)) {
    return false;
  }

  return (
    elapsedMs >=
    normalizedDurationMs
  );
}

export function clampPreloaderProgress(
  progress: number,
): number {
  const minimum =
    PRELOADER_CONFIG.progress.minimum;

  const maximum =
    PRELOADER_CONFIG.progress.maximum;

  if (!Number.isFinite(progress)) {
    return minimum;
  }

  return Math.min(
    maximum,
    Math.max(minimum, progress),
  );
}