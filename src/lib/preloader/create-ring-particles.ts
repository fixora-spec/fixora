import {
  PRELOADER_CONFIG,
} from "@/config/preloader.config";

import type {
  PreloaderNumberRange,
  PreloaderParticleKind,
  PreloaderRingParticle,
} from "@/types/preloader";

export type CreateRingParticlesOptions = {
  readonly particleCount?: number;
  readonly trailLength?: number;
  readonly seed?: string;

  readonly particleKinds?:
    readonly PreloaderParticleKind[];

  readonly particleSize?:
    PreloaderNumberRange;

  readonly radialOffset?:
    PreloaderNumberRange;
};

const DEFAULT_SEED =
  "fixora-global-preloader-ring";

const FULL_CIRCLE_RADIANS =
  Math.PI * 2;

function createSeedHash(
  value: string,
): number {
  let hash = 2166136261;

  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    hash ^= value.charCodeAt(index);

    hash = Math.imul(
      hash,
      16777619,
    );
  }

  return hash >>> 0;
}

function createSeededRandom(
  initialSeed: number,
): () => number {
  let seed =
    initialSeed >>> 0;

  return (): number => {
    seed += 0x6d2b79f5;

    let value = seed;

    value = Math.imul(
      value ^ (value >>> 15),
      value | 1,
    );

    value ^= value +
      Math.imul(
        value ^ (value >>> 7),
        value | 61,
      );

    return (
      (
        value ^
        (value >>> 14)
      ) >>>
      0
    ) / 4294967296;
  };
}

function normalizeRange(
  range: PreloaderNumberRange,
): PreloaderNumberRange {
  const safeMin =
    Number.isFinite(range.min)
      ? range.min
      : 0;

  const safeMax =
    Number.isFinite(range.max)
      ? range.max
      : safeMin;

  return {
    min: Math.min(
      safeMin,
      safeMax,
    ),

    max: Math.max(
      safeMin,
      safeMax,
    ),
  };
}

function randomBetween(
  random: () => number,
  range: PreloaderNumberRange,
): number {
  const normalizedRange =
    normalizeRange(range);

  return (
    normalizedRange.min +
    random() *
      (
        normalizedRange.max -
        normalizedRange.min
      )
  );
}

function roundValue(
  value: number,
  decimals = 4,
): number {
  const multiplier =
    10 ** decimals;

  return (
    Math.round(
      value * multiplier,
    ) / multiplier
  );
}

function normalizeParticleCount(
  particleCount: number,
): number {
  if (
    !Number.isFinite(
      particleCount,
    )
  ) {
    return (
      PRELOADER_CONFIG
        .particleRing
        .particleCount
    );
  }

  return Math.min(
    160,
    Math.max(
      1,
      Math.floor(
        particleCount,
      ),
    ),
  );
}

function normalizeTrailLength(
  trailLength: number,
  particleCount: number,
): number {
  if (
    !Number.isFinite(
      trailLength,
    )
  ) {
    return Math.min(
      particleCount,
      PRELOADER_CONFIG
        .particleRing
        .trailLength,
    );
  }

  return Math.min(
    particleCount,
    Math.max(
      1,
      Math.floor(
        trailLength,
      ),
    ),
  );
}

function getParticleKind(
  random: () => number,
  kinds:
    readonly PreloaderParticleKind[],
  normalizedIndex: number,
): PreloaderParticleKind {
  if (kinds.length === 0) {
    return "dot";
  }

  /*
   * La cabeza luminosa utiliza más
   * puntos pequeños. Hacia la cola
   * aparecen más hexágonos.
   */
  if (
    kinds.includes("dot") &&
    kinds.includes("hexagon")
  ) {
    const hexagonProbability =
      0.12 +
      normalizedIndex * 0.68;

    return random() <
      hexagonProbability
      ? "hexagon"
      : "dot";
  }

  const index = Math.floor(
    random() * kinds.length,
  );

  return kinds[index] ?? "dot";
}

function getParticleOpacity(
  normalizedIndex: number,
): number {
  /*
   * 1 en la cabeza del anillo y una
   * desaparición progresiva hacia
   * el final de la cola.
   */
  const fadingValue =
    (
      1 - normalizedIndex
    ) ** 1.55;

  return Math.max(
    0.025,
    fadingValue,
  );
}

function getParticleSize(
  random: () => number,
  normalizedIndex: number,
  range: PreloaderNumberRange,
): number {
  const normalizedRange =
    normalizeRange(range);

  const descendingSize =
    normalizedRange.max -
    normalizedIndex *
      (
        normalizedRange.max -
        normalizedRange.min
      );

  const variation =
    randomBetween(
      random,
      {
        min: -0.45,
        max: 0.45,
      },
    );

  return Math.min(
    normalizedRange.max,
    Math.max(
      normalizedRange.min,
      descendingSize +
        variation,
    ),
  );
}

export function createRingParticles(
  options: CreateRingParticlesOptions = {},
): readonly PreloaderRingParticle[] {
  const config =
    PRELOADER_CONFIG
      .particleRing;

  const particleCount =
    normalizeParticleCount(
      options.particleCount ??
        config.particleCount,
    );

  const trailLength =
    normalizeTrailLength(
      options.trailLength ??
        config.trailLength,
      particleCount,
    );

  const seed =
    options.seed?.trim() ||
    DEFAULT_SEED;

  const random =
    createSeededRandom(
      createSeedHash(seed),
    );

  const particleKinds =
    options.particleKinds ??
    config.particleKinds;

  const particleSize =
    options.particleSize ??
    config.particleSize;

  const radialOffset =
    options.radialOffset ??
    config.radialOffset;

  /*
   * trailLength define qué proporción
   * de la circunferencia ocupará la cola.
   *
   * 42 partículas de un total de 64
   * producen un arco de aproximadamente
   * 236 grados, dejando el círculo abierto.
   */
  const trailRatio =
    trailLength /
    particleCount;

  const trailArcRadians =
    FULL_CIRCLE_RADIANS *
    trailRatio;

  const lastParticleIndex =
    Math.max(
      1,
      particleCount - 1,
    );

  return Array.from(
    {
      length: particleCount,
    },
    (
      _unusedValue,
      index,
    ): PreloaderRingParticle => {
      const normalizedIndex =
        index /
        lastParticleIndex;

      const angleOffset =
        -trailArcRadians *
        normalizedIndex;

      const radialVariation =
        randomBetween(
          random,
          radialOffset,
        );

      return {
        id:
          `preloader-ring-particle-${index + 1}`,

        kind:
          getParticleKind(
            random,
            particleKinds,
            normalizedIndex,
          ),

        /*
         * Ángulo almacenado en radianes.
         * La cabeza empieza en 0 y la
         * cola continúa en sentido inverso.
         */
        angleOffset:
          roundValue(
            angleOffset,
          ),

        radialOffset:
          roundValue(
            radialVariation,
          ),

        sizePx:
          roundValue(
            getParticleSize(
              random,
              normalizedIndex,
              particleSize,
            ),
          ),

        opacity:
          roundValue(
            getParticleOpacity(
              normalizedIndex,
            ),
          ),

        /*
         * Desfase individual utilizado
         * posteriormente para generar
         * vibración y movimiento orgánico.
         */
        phaseOffset:
          roundValue(
            random() *
              FULL_CIRCLE_RADIANS,
          ),
      };
    },
  );
}