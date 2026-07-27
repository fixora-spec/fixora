import type {
  PreloaderConfig,
  PreloaderPhase,
} from "@/types/preloader";

export const PRELOADER_TOTAL_DURATION_MS =
  6000;

export const PRELOADER_MODE_INTERVAL_MS =
  2000;

const PRELOADER_PHASES:
  readonly PreloaderPhase[] = [
  {
    id: "dark-opening",
    mode: "dark",
    startMs: 0,
    endMs: 2000,
  },

  {
    id: "light-middle",
    mode: "light",
    startMs: 2000,
    endMs: 4000,
  },

  {
    id: "dark-finishing",
    mode: "dark",
    startMs: 4000,
    endMs: 6000,
  },
];

export const PRELOADER_CONFIG = {
  animation: {
    totalDurationMs:
      PRELOADER_TOTAL_DURATION_MS,

    modeIntervalMs:
      PRELOADER_MODE_INTERVAL_MS,

    fadeInDurationMs: 350,
    fadeOutDurationMs: 700,

    themeTransitionDurationMs: 650,

    /*
     * Aproximadamente 60 fotogramas
     * por segundo.
     */
    frameIntervalMs: 16,

    phases: PRELOADER_PHASES,
  },

  palettes: {
    dark: {
      background: "#050705",
      backgroundSecondary:
        "#0C0F0C",

      foreground: "#F4F7F4",
      mutedForeground: "#929A92",

      accent: "#63BD3D",
      accentSecondary: "#71E5E9",

      progressTrack:
        "rgba(255, 255, 255, 0.12)",

      progressFill: "#63BD3D",

      particle: "#63BD3D",
      particleSecondary: "#71E5E9",

      floatingShape:
        "rgba(99, 189, 61, 0.22)",

      border:
        "rgba(255, 255, 255, 0.10)",

      glow:
        "rgba(99, 189, 61, 0.48)",
    },

    light: {
      background: "#F8FAF8",
      backgroundSecondary:
        "#EEF2EE",

      foreground: "#252A25",
      mutedForeground: "#6D756D",

      accent: "#4EAD35",
      accentSecondary: "#4285D4",

      progressTrack:
        "rgba(37, 42, 37, 0.12)",

      progressFill: "#4EAD35",

      particle: "#4EAD35",
      particleSecondary: "#4285D4",

      floatingShape:
        "rgba(78, 173, 53, 0.18)",

      border:
        "rgba(37, 42, 37, 0.10)",

      glow:
        "rgba(78, 173, 53, 0.34)",
    },
  },

  logo: {
    /*
     * Logo oscuro para utilizarlo
     * sobre el fondo claro.
     */
    lightModeSrc:
      "/images/preloader/Sin título-10.png",

    /*
     * Logo blanco o plateado para
     * utilizarlo sobre el fondo oscuro.
     */
    darkModeSrc:
      "/images/preloader/modooscuro.png",

    alt: {
      es: "Logo de Fixora",
      en: "Fixora logo",
    },

    width: {
      mobile: 180,
      tablet: 215,
      desktop: 240,
    },

    /*
     * La altura real se adaptará
     * proporcionalmente a la imagen.
     */
    height: 120,

    priority: true,
  },

  progress: {
    minimum: 0,
    maximum: 100,

    label: {
      es: "Cargando",
      en: "Loading",
    },

    showPercentage: true,

    barWidth: {
      mobile: 220,
      tablet: 280,
      desktop: 320,
    },

    barHeightPx: 3,
  },

  particleRing: {
    size: {
      mobile: 138,
      tablet: 158,
      desktop: 176,
    },

    /*
     * Cantidad moderada para conservar
     * fluidez en computadoras y móviles.
     */
    particleCount: 64,

    trailLength: 42,

    rotationSpeed: 0.00165,

    lineWidthPx: 2.4,

    particleSize: {
      min: 1.2,
      max: 5.8,
    },

    radialOffset: {
      min: -5,
      max: 7,
    },

    glowBlurPx: 18,

    particleKinds: [
      "dot",
      "hexagon",
    ],
  },

  floatingShapes: {
    enabled: true,

    amount: 20,

    kinds: [
      "square",
      "diamond",
      "hexagon",
      "line",
      "dot",
    ],

    size: {
      min: 5,
      max: 74,
    },

    durationSeconds: {
      min: 8,
      max: 18,
    },

    delaySeconds: {
      min: -10,
      max: 0,
    },

    opacity: {
      min: 0.08,
      max: 0.32,
    },

    blurPx: {
      min: 0,
      max: 2.5,
    },
  },

  storage: {
    /*
     * El preloader se habilita en cada
     * carga completa del navegador.
     *
     * El hook evitará que vuelva a mostrarse
     * durante cambios de idioma o navegación
     * interna dentro del mismo documento.
     */
    strategy: "always",

    storageKey:
      "fixora-app-preloader",

    version: 1,
  },

  accessibility: {
    loadingAnnouncement: {
      es:
        "Fixora está preparando la experiencia.",
      en:
        "Fixora is preparing the experience.",
    },

    completedAnnouncement: {
      es:
        "Fixora está listo.",
      en:
        "Fixora is ready.",
    },

    respectReducedMotion: true,
  },
} satisfies PreloaderConfig;

export {
  PRELOADER_PHASES,
};