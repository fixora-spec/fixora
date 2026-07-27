export {
  createFloatingShapes,
} from "./create-floating-shapes";

export type {
  CreateFloatingShapesOptions,
} from "./create-floating-shapes";

export {
  createRingParticles,
} from "./create-ring-particles";

export type {
  CreateRingParticlesOptions,
} from "./create-ring-particles";

export {
  drawParticleRing,
  resizePreloaderCanvas,
} from "./draw-particle-ring";

export type {
  DrawParticleRingOptions,
  ResizePreloaderCanvasOptions,
} from "./draw-particle-ring";

export {
  getPreloaderPhase,
  getPreloaderPhaseProgress,
  getPreloaderThemeMode,
  isPreloaderPhaseActive,
} from "./get-preloader-phase";

export {
  clampPreloaderProgress,
  getPreloaderProgress,
  getPreloaderProgressRatio,
  isPreloaderComplete,
} from "./get-preloader-progress";

export {
  clearPreloaderStorage,
  getPreloaderCompletedAt,
  hasCompletedPreloader,
  markPreloaderCompleted,
  readPreloaderStorageState,
  shouldShowPreloader,
} from "./preloader-storage";