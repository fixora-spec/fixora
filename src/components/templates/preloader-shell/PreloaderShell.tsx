"use client";

import {
  motion,
  useReducedMotion,
} from "motion/react";

import {
  PreloaderLogo,
} from "@/components/atoms/preloader-logo";

import {
  PreloaderBackground,
} from "@/components/molecules/preloader-background";

import {
  PreloaderParticleRing,
} from "@/components/molecules/preloader-particle-ring";

import {
  PreloaderProgress,
} from "@/components/molecules/preloader-progress";

import {
  PRELOADER_CONFIG,
} from "@/config/preloader.config";

import { cn } from "@/utils/cn";

import type {
  PreloaderShellProps,
} from "./PreloaderShell.types";

function normalizeProgress(
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
    Math.max(
      minimum,
      progress,
    ),
  );
}

export function PreloaderShell({
  locale = "es",
  mode,
  status,
  currentPhase,
  elapsedMs,
  progress,
  reducedMotion,
  isFinishing,
  showBackground = true,
  showFloatingShapes = true,
  showParticleRing = true,
  showProgress = true,
  showLogo = true,
  lightModeLogoSrc,
  darkModeLogoSrc,
  logoAlt,
  loadingLabel,
  accessibilityLabel,
  decorative = true,
  backgroundClassName,
  contentClassName,
  logoClassName,
  particleRingClassName,
  progressClassName,
  floatingShapeClassName,
  className,
  style,
  ...motionDivProps
}: PreloaderShellProps) {
  const prefersReducedMotion =
    useReducedMotion();

  const shouldReduceMotion =
    reducedMotion ??
    prefersReducedMotion ??
    false;

  const palette =
    PRELOADER_CONFIG.palettes[mode];

  const normalizedProgress =
    normalizeProgress(progress);

  const displayedPercentage =
    Math.round(normalizedProgress);

  const resolvedLoadingLabel =
    loadingLabel?.trim() ||
    PRELOADER_CONFIG
      .progress
      .label[locale];

  const resolvedAccessibilityLabel =
    accessibilityLabel?.trim() ||
    [
      PRELOADER_CONFIG
        .accessibility
        .loadingAnnouncement[locale],

      `${displayedPercentage}%`,
    ].join(" ");

  const resolvedIsFinishing =
    isFinishing ??
    status === "finishing";

  const activePhaseIndex =
    Math.max(
      0,
      PRELOADER_CONFIG
        .animation
        .phases
        .findIndex(
          (phase) =>
            phase.id ===
            currentPhase.id,
        ),
    );

  const transitionDurationSeconds =
    shouldReduceMotion
      ? 0
      : PRELOADER_CONFIG
          .animation
          .themeTransitionDurationMs /
        1000;

  const fadeInDurationSeconds =
    shouldReduceMotion
      ? 0
      : PRELOADER_CONFIG
          .animation
          .fadeInDurationMs /
        1000;

  const fadeOutDurationSeconds =
    shouldReduceMotion
      ? 0
      : PRELOADER_CONFIG
          .animation
          .fadeOutDurationMs /
        1000;

  return (
    <motion.div
      {...motionDivProps}
      role={
        decorative
          ? undefined
          : "status"
      }
      aria-hidden={
        decorative
          ? true
          : undefined
      }
      aria-live={
        decorative
          ? undefined
          : "polite"
      }
      aria-atomic={
        decorative
          ? undefined
          : true
      }
      aria-busy={
        decorative
          ? undefined
          : status !== "completed"
      }
      aria-label={
        decorative
          ? undefined
          : resolvedAccessibilityLabel
      }
      data-preloader-shell=""
      data-mode={mode}
      data-status={status}
      data-phase={currentPhase.id}
      data-progress={
        displayedPercentage
      }
      className={cn(
        "relative",

        "flex size-full",
        "min-h-[100dvh]",
        "min-w-0",

        "items-center",
        "justify-center",

        "overflow-hidden",
        "isolate",

        "select-none",

        "transition-[background-color,color]",
        "ease-out",

        className,
      )}
      style={{
        backgroundColor:
          palette.background,

        color:
          palette.foreground,

        transitionDuration:
          `${PRELOADER_CONFIG.animation.themeTransitionDurationMs}ms`,

        ...style,
      }}
      initial={
        shouldReduceMotion
          ? false
          : {
              opacity: 0,
            }
      }
      animate={{
        opacity:
          resolvedIsFinishing
            ? 0
            : 1,
      }}
      exit={{
        opacity: 0,
      }}
      transition={{
        duration:
          resolvedIsFinishing
            ? fadeOutDurationSeconds
            : fadeInDurationSeconds,

        ease:
          resolvedIsFinishing
            ? "easeIn"
            : [
                0.22,
                1,
                0.36,
                1,
              ],
      }}
    >
      {showBackground ? (
        <PreloaderBackground
          mode={mode}
          amount={
            showFloatingShapes
              ? PRELOADER_CONFIG
                  .floatingShapes
                  .amount
              : 0
          }
          reducedMotion={
            shouldReduceMotion
          }
          showAmbientGlows
          showGrid
          showNoiseDots
          decorative
          shapeClassName={
            floatingShapeClassName
          }
          className={
            backgroundClassName
          }
        />
      ) : null}

      <motion.div
        key={`preloader-theme-${mode}`}
        aria-hidden="true"
        className={cn(
          "pointer-events-none",
          "absolute inset-0",
          "z-[1]",
        )}
        initial={
          shouldReduceMotion
            ? false
            : {
                opacity: 0,
              }
        }
        animate={{
          opacity: [
            0,
            mode === "dark"
              ? 0.24
              : 0.16,
            0,
          ],
        }}
        transition={{
          duration:
            shouldReduceMotion
              ? 0
              : transitionDurationSeconds,

          ease: "easeOut",
        }}
        style={{
          background:
            mode === "dark"
              ? [
                  "radial-gradient(",
                  "circle at center,",
                  `${palette.glow} 0%,`,
                  "transparent 58%",
                  ")",
                ].join(" ")
              : [
                  "radial-gradient(",
                  "circle at center,",
                  `${palette.accent}20 0%,`,
                  "transparent 58%",
                  ")",
                ].join(" "),
        }}
      />

      <motion.div
        className={cn(
          "relative z-10",

          "flex w-full",
          "max-w-[44rem]",
          "flex-col",

          "items-center",
          "justify-center",

          "px-5 py-10",

          "sm:px-8",
          "lg:px-10",

          contentClassName,
        )}
        initial={
          shouldReduceMotion
            ? false
            : {
                opacity: 0,
                y: 20,
                scale: 0.975,
                filter:
                  "blur(6px)",
              }
        }
        animate={{
          opacity:
            resolvedIsFinishing
              ? 0
              : 1,

          y:
            resolvedIsFinishing
              ? -10
              : 0,

          scale:
            resolvedIsFinishing
              ? 0.985
              : 1,

          filter:
            resolvedIsFinishing
              ? "blur(5px)"
              : "blur(0px)",
        }}
        transition={{
          duration:
            resolvedIsFinishing
              ? fadeOutDurationSeconds
              : shouldReduceMotion
                ? 0
                : 0.72,

          ease:
            resolvedIsFinishing
              ? "easeIn"
              : [
                  0.22,
                  1,
                  0.36,
                  1,
                ],
        }}
      >
        {showLogo ? (
          <PreloaderLogo
            mode={mode}
            locale={locale}
            lightModeSrc={
              lightModeLogoSrc
            }
            darkModeSrc={
              darkModeLogoSrc
            }
            alt={logoAlt}
            decorative={
              decorative
            }
            className={cn(
              "relative z-10",

              logoClassName,
            )}
          />
        ) : null}

        {showParticleRing ? (
          <div
            className={cn(
              "relative",

              showLogo
                ? [
                    "mt-5",
                    "sm:mt-6",
                  ]
                : null,
            )}
          >
            <div
              aria-hidden="true"
              className={cn(
                "pointer-events-none",

                "absolute top-1/2",
                "left-1/2",

                "size-[62%]",

                "-translate-x-1/2",
                "-translate-y-1/2",

                "rounded-full",
                "blur-3xl",

                "opacity-45",

                "transition-[background-color,opacity]",
                "duration-700",
              )}
              style={{
                backgroundColor:
                  palette.glow,
              }}
            />

            <PreloaderParticleRing
              mode={mode}
              elapsedMs={elapsedMs}
              progress={
                normalizedProgress
              }
              reducedMotion={
                shouldReduceMotion
              }
              decorative={
                decorative
              }
              label={
                resolvedAccessibilityLabel
              }
              className={cn(
                "relative z-10",

                particleRingClassName,
              )}
            />
          </div>
        ) : null}

        {showProgress ? (
          <PreloaderProgress
            progress={
              normalizedProgress
            }
            mode={mode}
            locale={locale}
            label={
              resolvedLoadingLabel
            }
            reducedMotion={
              shouldReduceMotion
            }
            accessibilityLabel={
              resolvedAccessibilityLabel
            }
            className={cn(
              showParticleRing
                ? [
                    "mt-5",
                    "sm:mt-6",
                  ]
                : showLogo
                  ? [
                      "mt-7",
                      "sm:mt-8",
                    ]
                  : null,

              progressClassName,
            )}
          />
        ) : null}

        <div
          aria-hidden="true"
          className={cn(
            "mt-5 flex",
            "items-center gap-2",
          )}
        >
          {PRELOADER_CONFIG
            .animation
            .phases
            .map(
              (
                phase,
                phaseIndex,
              ) => {
                const isActive =
                  phaseIndex ===
                  activePhaseIndex;

                const isCompleted =
                  phaseIndex <
                  activePhaseIndex;

                return (
                  <span
                    key={phase.id}
                    data-active={
                      isActive
                        ? "true"
                        : "false"
                    }
                    className={cn(
                      "block h-1.5",

                      "rounded-full",

                      "transition-[width,background-color,opacity,box-shadow]",
                      "duration-500",

                      isActive
                        ? "w-7"
                        : "w-1.5",

                      isActive ||
                        isCompleted
                        ? "opacity-100"
                        : "opacity-35",
                    )}
                    style={{
                      backgroundColor:
                        isActive ||
                        isCompleted
                          ? palette.accent
                          : palette
                              .mutedForeground,

                      boxShadow:
                        isActive
                          ? `0 0 12px ${palette.glow}`
                          : undefined,
                    }}
                  />
                );
              },
            )}
        </div>
      </motion.div>

      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none",

          "absolute inset-x-0",
          "bottom-0 z-[2]",

          "h-[18vh]",
        )}
        style={{
          background:
            [
              "linear-gradient(",
              "to top,",
              `${palette.background} 0%,`,
              "transparent 100%",
              ")",
            ].join(" "),
        }}
      />

      <div
        aria-hidden="true"
        className="sr-only"
      >
        {resolvedAccessibilityLabel}
      </div>
    </motion.div>
  );
}