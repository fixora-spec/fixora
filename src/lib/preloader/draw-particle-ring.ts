import {
  PRELOADER_CONFIG,
} from "@/config/preloader.config";

import type {
  PreloaderPalette,
  PreloaderRingParticle,
  PreloaderThemeMode,
} from "@/types/preloader";

export type ResizePreloaderCanvasOptions = {
  readonly canvas:
    HTMLCanvasElement;

  readonly width: number;
  readonly height: number;

  readonly devicePixelRatio?: number;
};

export type DrawParticleRingOptions = {
  readonly context:
    CanvasRenderingContext2D;

  readonly canvasWidth: number;
  readonly canvasHeight: number;

  readonly ringSizePx: number;

  readonly elapsedMs: number;
  readonly progress: number;

  readonly mode:
    PreloaderThemeMode;

  readonly particles:
    readonly PreloaderRingParticle[];

  readonly reducedMotion?: boolean;
};

const FULL_CIRCLE_RADIANS =
  Math.PI * 2;

const HEAD_START_ANGLE =
  -Math.PI / 2;

const MINIMUM_CANVAS_SIZE = 1;
const MAXIMUM_DEVICE_PIXEL_RATIO = 3;

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

function normalizeCanvasSize(
  value: number,
): number {
  if (!Number.isFinite(value)) {
    return MINIMUM_CANVAS_SIZE;
  }

  return Math.max(
    MINIMUM_CANVAS_SIZE,
    Math.round(value),
  );
}

function normalizeDevicePixelRatio(
  value?: number,
): number {
  const browserRatio =
    typeof window !== "undefined"
      ? window.devicePixelRatio
      : 1;

  const ratio =
    value ?? browserRatio;

  if (!Number.isFinite(ratio)) {
    return 1;
  }

  return clamp(
    ratio,
    1,
    MAXIMUM_DEVICE_PIXEL_RATIO,
  );
}

function normalizeElapsedTime(
  elapsedMs: number,
): number {
  if (!Number.isFinite(elapsedMs)) {
    return 0;
  }

  return Math.max(
    0,
    elapsedMs,
  );
}

function normalizeProgress(
  progress: number,
): number {
  return clamp(
    progress,
    0,
    100,
  );
}

function normalizeRingSize(
  ringSizePx: number,
  canvasWidth: number,
  canvasHeight: number,
): number {
  const maximumSize =
    Math.max(
      1,
      Math.min(
        canvasWidth,
        canvasHeight,
      ),
    );

  if (!Number.isFinite(ringSizePx)) {
    return maximumSize;
  }

  return clamp(
    ringSizePx,
    1,
    maximumSize,
  );
}

function drawHexagon(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  rotationRadians: number,
): void {
  const sideCount = 6;

  context.beginPath();

  for (
    let sideIndex = 0;
    sideIndex < sideCount;
    sideIndex += 1
  ) {
    const angle =
      rotationRadians +
      (
        FULL_CIRCLE_RADIANS *
        sideIndex
      ) /
        sideCount;

    const pointX =
      centerX +
      Math.cos(angle) *
        radius;

    const pointY =
      centerY +
      Math.sin(angle) *
        radius;

    if (sideIndex === 0) {
      context.moveTo(
        pointX,
        pointY,
      );
    } else {
      context.lineTo(
        pointX,
        pointY,
      );
    }
  }

  context.closePath();
}

function drawBaseTrack(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  palette: PreloaderPalette,
): void {
  context.save();

  context.globalAlpha = 0.16;

  context.strokeStyle =
    palette.border;

  context.lineWidth = 1;

  context.setLineDash([
    1.5,
    7,
  ]);

  context.beginPath();

  context.arc(
    centerX,
    centerY,
    radius,
    0,
    FULL_CIRCLE_RADIANS,
  );

  context.stroke();

  context.restore();
}

function drawMainArc(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  headAngle: number,
  palette: PreloaderPalette,
  progress: number,
): void {
  const arcLength =
    Math.PI * 0.68;

  const arcStart =
    headAngle -
    arcLength;

  const glowMultiplier =
    0.72 +
    normalizeProgress(progress) /
      100 *
      0.28;

  const gradient =
    context.createLinearGradient(
      centerX - radius,
      centerY - radius,
      centerX + radius,
      centerY + radius,
    );

  gradient.addColorStop(
    0,
    palette.particleSecondary,
  );

  gradient.addColorStop(
    0.58,
    palette.particle,
  );

  gradient.addColorStop(
    1,
    palette.accent,
  );

  context.save();

  context.globalAlpha = 0.94;

  context.strokeStyle =
    gradient;

  context.lineWidth =
    PRELOADER_CONFIG
      .particleRing
      .lineWidthPx;

  context.lineCap = "round";

  context.shadowColor =
    palette.glow;

  context.shadowBlur =
    PRELOADER_CONFIG
      .particleRing
      .glowBlurPx *
    glowMultiplier;

  context.beginPath();

  context.arc(
    centerX,
    centerY,
    radius,
    arcStart,
    headAngle,
  );

  context.stroke();

  context.restore();
}

function drawParticle(
  context: CanvasRenderingContext2D,
  particle: PreloaderRingParticle,
  centerX: number,
  centerY: number,
  radius: number,
  headAngle: number,
  elapsedMs: number,
  palette: PreloaderPalette,
  reducedMotion: boolean,
): void {
  const organicMovement =
    reducedMotion
      ? 0
      : Math.sin(
          elapsedMs * 0.0022 +
            particle.phaseOffset,
        ) *
        1.15;

  const angle =
    headAngle +
    particle.angleOffset;

  const particleRadius =
    radius +
    particle.radialOffset +
    organicMovement;

  const particleX =
    centerX +
    Math.cos(angle) *
      particleRadius;

  const particleY =
    centerY +
    Math.sin(angle) *
      particleRadius;

  const isNearHead =
    Math.abs(
      particle.angleOffset,
    ) < 0.38;

  const particleColor =
    isNearHead
      ? palette.accent
      : palette.particleSecondary;

  context.save();

  context.globalAlpha =
    clamp(
      particle.opacity,
      0,
      1,
    );

  context.strokeStyle =
    particleColor;

  context.fillStyle =
    particleColor;

  context.lineWidth =
    Math.max(
      0.75,
      particle.sizePx * 0.24,
    );

  if (isNearHead) {
    context.shadowColor =
      palette.glow;

    context.shadowBlur =
      PRELOADER_CONFIG
        .particleRing
        .glowBlurPx *
      0.72;
  }

  if (
    particle.kind ===
    "hexagon"
  ) {
    drawHexagon(
      context,
      particleX,
      particleY,
      Math.max(
        1.2,
        particle.sizePx,
      ),
      angle +
        elapsedMs * 0.00035,
    );

    context.stroke();
  } else {
    context.beginPath();

    context.arc(
      particleX,
      particleY,
      Math.max(
        0.65,
        particle.sizePx * 0.48,
      ),
      0,
      FULL_CIRCLE_RADIANS,
    );

    context.fill();
  }

  context.restore();
}

function drawGlowingHead(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  headAngle: number,
  elapsedMs: number,
  palette: PreloaderPalette,
  reducedMotion: boolean,
): void {
  const pulse =
    reducedMotion
      ? 1
      : 1 +
        Math.sin(
          elapsedMs * 0.006,
        ) *
          0.14;

  const headX =
    centerX +
    Math.cos(headAngle) *
      radius;

  const headY =
    centerY +
    Math.sin(headAngle) *
      radius;

  const outerRadius =
    5.5 * pulse;

  const radialGradient =
    context.createRadialGradient(
      headX,
      headY,
      0,
      headX,
      headY,
      outerRadius * 2.6,
    );

  radialGradient.addColorStop(
    0,
    palette.foreground,
  );

  radialGradient.addColorStop(
    0.22,
    palette.accent,
  );

  radialGradient.addColorStop(
    0.58,
    palette.glow,
  );

  radialGradient.addColorStop(
    1,
    "rgba(0, 0, 0, 0)",
  );

  context.save();

  context.fillStyle =
    radialGradient;

  context.shadowColor =
    palette.glow;

  context.shadowBlur =
    PRELOADER_CONFIG
      .particleRing
      .glowBlurPx;

  context.beginPath();

  context.arc(
    headX,
    headY,
    outerRadius * 2.6,
    0,
    FULL_CIRCLE_RADIANS,
  );

  context.fill();

  context.restore();
}

export function resizePreloaderCanvas({
  canvas,
  width,
  height,
  devicePixelRatio,
}: ResizePreloaderCanvasOptions):
  CanvasRenderingContext2D | null {
  const normalizedWidth =
    normalizeCanvasSize(width);

  const normalizedHeight =
    normalizeCanvasSize(height);

  const normalizedRatio =
    normalizeDevicePixelRatio(
      devicePixelRatio,
    );

  canvas.width =
    Math.round(
      normalizedWidth *
        normalizedRatio,
    );

  canvas.height =
    Math.round(
      normalizedHeight *
        normalizedRatio,
    );

  canvas.style.width =
    `${normalizedWidth}px`;

  canvas.style.height =
    `${normalizedHeight}px`;

  const context =
    canvas.getContext("2d");

  if (!context) {
    return null;
  }

  context.setTransform(
    normalizedRatio,
    0,
    0,
    normalizedRatio,
    0,
    0,
  );

  return context;
}

export function drawParticleRing({
  context,
  canvasWidth,
  canvasHeight,
  ringSizePx,
  elapsedMs,
  progress,
  mode,
  particles,
  reducedMotion = false,
}: DrawParticleRingOptions): void {
  const normalizedWidth =
    normalizeCanvasSize(
      canvasWidth,
    );

  const normalizedHeight =
    normalizeCanvasSize(
      canvasHeight,
    );

  const normalizedElapsedMs =
    normalizeElapsedTime(
      elapsedMs,
    );

  const normalizedRingSize =
    normalizeRingSize(
      ringSizePx,
      normalizedWidth,
      normalizedHeight,
    );

  const palette =
    PRELOADER_CONFIG
      .palettes[mode];

  const centerX =
    normalizedWidth / 2;

  const centerY =
    normalizedHeight / 2;

  const radius =
    Math.max(
      1,
      normalizedRingSize /
        2 -
        12,
    );

  const headAngle =
    HEAD_START_ANGLE +
    (
      reducedMotion
        ? 0
        : normalizedElapsedMs *
          PRELOADER_CONFIG
            .particleRing
            .rotationSpeed
    );

  context.clearRect(
    0,
    0,
    normalizedWidth,
    normalizedHeight,
  );

  drawBaseTrack(
    context,
    centerX,
    centerY,
    radius,
    palette,
  );

  drawMainArc(
    context,
    centerX,
    centerY,
    radius,
    headAngle,
    palette,
    progress,
  );

  particles.forEach(
    (particle) => {
      drawParticle(
        context,
        particle,
        centerX,
        centerY,
        radius,
        headAngle,
        normalizedElapsedMs,
        palette,
        reducedMotion,
      );
    },
  );

  drawGlowingHead(
    context,
    centerX,
    centerY,
    radius,
    headAngle,
    normalizedElapsedMs,
    palette,
    reducedMotion,
  );
}