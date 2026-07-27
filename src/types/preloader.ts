export type PreloaderLocale =
  | "es"
  | "en";

export type PreloaderThemeMode =
  | "light"
  | "dark";

export type PreloaderStatus =
  | "idle"
  | "loading"
  | "finishing"
  | "completed";

export type PreloaderVisibilityStrategy =
  | "always"
  | "session"
  | "first-visit";

export type PreloaderShapeKind =
  | "square"
  | "diamond"
  | "hexagon"
  | "line"
  | "dot";

export type PreloaderParticleKind =
  | "dot"
  | "hexagon";

export type PreloaderLocalizedText =
  Readonly<
    Record<
      PreloaderLocale,
      string
    >
  >;

export type PreloaderNumberRange = {
  readonly min: number;
  readonly max: number;
};

export type PreloaderResponsiveSize = {
  readonly mobile: number;
  readonly tablet: number;
  readonly desktop: number;
};

export type PreloaderPhase = {
  readonly id: string;
  readonly mode: PreloaderThemeMode;
  readonly startMs: number;
  readonly endMs: number;
};

export type PreloaderPalette = {
  readonly background: string;
  readonly backgroundSecondary: string;
  readonly foreground: string;
  readonly mutedForeground: string;

  readonly accent: string;
  readonly accentSecondary: string;

  readonly progressTrack: string;
  readonly progressFill: string;

  readonly particle: string;
  readonly particleSecondary: string;

  readonly floatingShape: string;
  readonly border: string;
  readonly glow: string;
};

export type PreloaderPaletteCollection =
  Readonly<
    Record<
      PreloaderThemeMode,
      PreloaderPalette
    >
  >;

export type PreloaderAnimationConfig = {
  readonly totalDurationMs: number;
  readonly modeIntervalMs: number;

  readonly fadeInDurationMs: number;
  readonly fadeOutDurationMs: number;
  readonly themeTransitionDurationMs: number;

  readonly frameIntervalMs: number;

  readonly phases:
    readonly PreloaderPhase[];
};

export type PreloaderLogoConfig = {
  readonly lightModeSrc: string;
  readonly darkModeSrc: string;

  readonly alt:
    PreloaderLocalizedText;

  readonly width:
    PreloaderResponsiveSize;

  readonly height: number;
  readonly priority: boolean;
};

export type PreloaderProgressConfig = {
  readonly minimum: number;
  readonly maximum: number;

  readonly label:
    PreloaderLocalizedText;

  readonly showPercentage: boolean;

  readonly barWidth:
    PreloaderResponsiveSize;

  readonly barHeightPx: number;
};

export type PreloaderParticleRingConfig = {
  readonly size:
    PreloaderResponsiveSize;

  readonly particleCount: number;
  readonly trailLength: number;

  readonly rotationSpeed: number;
  readonly lineWidthPx: number;

  readonly particleSize:
    PreloaderNumberRange;

  readonly radialOffset:
    PreloaderNumberRange;

  readonly glowBlurPx: number;

  readonly particleKinds:
    readonly PreloaderParticleKind[];
};

export type PreloaderFloatingShapesConfig = {
  readonly enabled: boolean;
  readonly amount: number;

  readonly kinds:
    readonly PreloaderShapeKind[];

  readonly size:
    PreloaderNumberRange;

  readonly durationSeconds:
    PreloaderNumberRange;

  readonly delaySeconds:
    PreloaderNumberRange;

  readonly opacity:
    PreloaderNumberRange;

  readonly blurPx:
    PreloaderNumberRange;
};

export type PreloaderStorageConfig = {
  readonly strategy:
    PreloaderVisibilityStrategy;

  readonly storageKey: string;
  readonly version: number;
};

export type PreloaderAccessibilityConfig = {
  readonly loadingAnnouncement:
    PreloaderLocalizedText;

  readonly completedAnnouncement:
    PreloaderLocalizedText;

  readonly respectReducedMotion: boolean;
};

export type PreloaderConfig = {
  readonly animation:
    PreloaderAnimationConfig;

  readonly palettes:
    PreloaderPaletteCollection;

  readonly logo:
    PreloaderLogoConfig;

  readonly progress:
    PreloaderProgressConfig;

  readonly particleRing:
    PreloaderParticleRingConfig;

  readonly floatingShapes:
    PreloaderFloatingShapesConfig;

  readonly storage:
    PreloaderStorageConfig;

  readonly accessibility:
    PreloaderAccessibilityConfig;
};

export type PreloaderFloatingShape = {
  readonly id: string;
  readonly kind:
    PreloaderShapeKind;

  /*
   * Posición expresada en porcentaje
   * dentro de la pantalla.
   */
  readonly x: number;
  readonly y: number;

  readonly sizePx: number;
  readonly rotationDeg: number;

  readonly durationSeconds: number;
  readonly delaySeconds: number;

  readonly opacity: number;
  readonly blurPx: number;

  readonly directionX: number;
  readonly directionY: number;
};

export type PreloaderRingParticle = {
  readonly id: string;
  readonly kind:
    PreloaderParticleKind;

  readonly angleOffset: number;
  readonly radialOffset: number;

  readonly sizePx: number;
  readonly opacity: number;

  readonly phaseOffset: number;
};

export type PreloaderStorageState = {
  readonly version: number;
  readonly completed: boolean;
  readonly completedAt: number;
};

export type UseAppPreloaderOptions = {
  readonly enabled?: boolean;
  readonly durationMs?: number;
  readonly initialProgress?: number;
};

export type UseAppPreloaderReturn = {
  readonly status:
    PreloaderStatus;

  readonly progress: number;
  readonly elapsedMs: number;

  readonly currentMode:
    PreloaderThemeMode;

  readonly currentPhase:
    PreloaderPhase;

  readonly isVisible: boolean;
  readonly isLoading: boolean;
  readonly isFinishing: boolean;
  readonly isCompleted: boolean;

  readonly startPreloader:
    () => void;

  readonly finishPreloader:
    () => void;

  readonly restartPreloader:
    () => void;
};