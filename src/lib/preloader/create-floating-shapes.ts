import {
  PRELOADER_CONFIG,
} from "@/config/preloader.config";

import type {
  PreloaderFloatingShape,
  PreloaderNumberRange,
  PreloaderShapeKind,
} from "@/types/preloader";

export type CreateFloatingShapesOptions = {
  readonly amount?: number;
  readonly seed?: string;

  readonly kinds?:
    readonly PreloaderShapeKind[];

  readonly size?:
    PreloaderNumberRange;

  readonly durationSeconds?:
    PreloaderNumberRange;

  readonly delaySeconds?:
    PreloaderNumberRange;

  readonly opacity?:
    PreloaderNumberRange;

  readonly blurPx?:
    PreloaderNumberRange;
};

const DEFAULT_SEED =
  "fixora-global-preloader-shapes";

const MINIMUM_SCREEN_POSITION = 3;
const MAXIMUM_SCREEN_POSITION = 97;

const CENTER_MIN_X = 24;
const CENTER_MAX_X = 76;

const CENTER_MIN_Y = 14;
const CENTER_MAX_Y = 84;

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

function randomInteger(
  random: () => number,
  minimum: number,
  maximum: number,
): number {
  const safeMinimum =
    Math.ceil(
      Math.min(
        minimum,
        maximum,
      ),
    );

  const safeMaximum =
    Math.floor(
      Math.max(
        minimum,
        maximum,
      ),
    );

  return Math.floor(
    random() *
      (
        safeMaximum -
        safeMinimum +
        1
      ),
  ) + safeMinimum;
}

function roundValue(
  value: number,
  decimals = 3,
): number {
  const multiplier =
    10 ** decimals;

  return (
    Math.round(
      value * multiplier,
    ) / multiplier
  );
}

function getRandomKind(
  random: () => number,
  kinds: readonly PreloaderShapeKind[],
): PreloaderShapeKind {
  if (kinds.length === 0) {
    return "dot";
  }

  const index = randomInteger(
    random,
    0,
    kinds.length - 1,
  );

  return kinds[index] ?? "dot";
}

function createPeripheralPosition(
  random: () => number,
): {
  x: number;
  y: number;
} {
  let x = randomBetween(
    random,
    {
      min: MINIMUM_SCREEN_POSITION,
      max: MAXIMUM_SCREEN_POSITION,
    },
  );

  let y = randomBetween(
    random,
    {
      min: MINIMUM_SCREEN_POSITION,
      max: MAXIMUM_SCREEN_POSITION,
    },
  );

  const isInsideCentralArea =
    x >= CENTER_MIN_X &&
    x <= CENTER_MAX_X &&
    y >= CENTER_MIN_Y &&
    y <= CENTER_MAX_Y;

  if (!isInsideCentralArea) {
    return {
      x: roundValue(x),
      y: roundValue(y),
    };
  }

  /*
   * Mantiene despejada la zona central
   * donde aparecerán el logo, el anillo
   * y el porcentaje de carga.
   */
  const selectedSide =
    randomInteger(
      random,
      0,
      3,
    );

  switch (selectedSide) {
    case 0:
      x = randomBetween(
        random,
        {
          min:
            MINIMUM_SCREEN_POSITION,
          max: CENTER_MIN_X - 3,
        },
      );
      break;

    case 1:
      x = randomBetween(
        random,
        {
          min: CENTER_MAX_X + 3,
          max:
            MAXIMUM_SCREEN_POSITION,
        },
      );
      break;

    case 2:
      y = randomBetween(
        random,
        {
          min:
            MINIMUM_SCREEN_POSITION,
          max: CENTER_MIN_Y - 2,
        },
      );
      break;

    default:
      y = randomBetween(
        random,
        {
          min: CENTER_MAX_Y + 2,
          max:
            MAXIMUM_SCREEN_POSITION,
        },
      );
      break;
  }

  return {
    x: roundValue(x),
    y: roundValue(y),
  };
}

function createMovementDirection(
  random: () => number,
): number {
  const direction =
    randomBetween(
      random,
      {
        min: -1,
        max: 1,
      },
    );

  /*
   * Evita movimientos prácticamente
   * imperceptibles.
   */
  if (
    Math.abs(direction) <
    0.2
  ) {
    return direction < 0
      ? -0.2
      : 0.2;
  }

  return roundValue(direction);
}

function normalizeAmount(
  amount: number,
): number {
  if (!Number.isFinite(amount)) {
    return (
      PRELOADER_CONFIG
        .floatingShapes.amount
    );
  }

  return Math.min(
    60,
    Math.max(
      0,
      Math.floor(amount),
    ),
  );
}

export function createFloatingShapes(
  options: CreateFloatingShapesOptions = {},
): readonly PreloaderFloatingShape[] {
  const config =
    PRELOADER_CONFIG
      .floatingShapes;

  const amount =
    normalizeAmount(
      options.amount ??
        config.amount,
    );

  if (
    !config.enabled ||
    amount === 0
  ) {
    return [];
  }

  const seed =
    options.seed?.trim() ||
    DEFAULT_SEED;

  const random =
    createSeededRandom(
      createSeedHash(seed),
    );

  const kinds =
    options.kinds ??
    config.kinds;

  const size =
    options.size ??
    config.size;

  const durationSeconds =
    options.durationSeconds ??
    config.durationSeconds;

  const delaySeconds =
    options.delaySeconds ??
    config.delaySeconds;

  const opacity =
    options.opacity ??
    config.opacity;

  const blurPx =
    options.blurPx ??
    config.blurPx;

  return Array.from(
    {
      length: amount,
    },
    (
      _unusedValue,
      index,
    ): PreloaderFloatingShape => {
      const position =
        createPeripheralPosition(
          random,
        );

      return {
        id:
          `preloader-shape-${index + 1}`,

        kind:
          getRandomKind(
            random,
            kinds,
          ),

        x: position.x,
        y: position.y,

        sizePx:
          roundValue(
            randomBetween(
              random,
              size,
            ),
          ),

        rotationDeg:
          roundValue(
            randomBetween(
              random,
              {
                min: 0,
                max: 360,
              },
            ),
          ),

        durationSeconds:
          roundValue(
            randomBetween(
              random,
              durationSeconds,
            ),
          ),

        delaySeconds:
          roundValue(
            randomBetween(
              random,
              delaySeconds,
            ),
          ),

        opacity:
          roundValue(
            randomBetween(
              random,
              opacity,
            ),
          ),

        blurPx:
          roundValue(
            randomBetween(
              random,
              blurPx,
            ),
          ),

        directionX:
          createMovementDirection(
            random,
          ),

        directionY:
          createMovementDirection(
            random,
          ),
      };
    },
  );
}