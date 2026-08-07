"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  ChangeEvent,
  CSSProperties,
} from "react";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "motion/react";

import {
  BrandLogo,
} from "@/components/atoms/brand-logo";

import {
  cn,
} from "@/utils/cn";

import type {
  VerificationCodeFieldProps,
  VerificationCodeFieldStatus,
} from "./VerificationCodeField.types";

const DEFAULT_CODE_LENGTH = 6;

const ALPHANUMERIC_PATTERN =
  /^[A-Z0-9]*$/u;

const ROW_POINTS = [
  10,
  26,
  42,
  58,
  74,
  90,
] as const;

// Regular hexagon on a fixed circular orbit. Keeping a single geometry
// prevents the six OTP nodes from stretching or collapsing while rotating.
const NETWORK_POINTS = [
  { x: 32, y: 19 },
  { x: 68, y: 19 },
  { x: 14, y: 50 },
  { x: 86, y: 50 },
  { x: 32, y: 81 },
  { x: 68, y: 81 },
] as const;

const NETWORK_LOOP_DURATION_SECONDS = 3.05;

const NETWORK_EDGES = [
  [0, 1],
  [0, 2],
  [2, 4],
  [4, 5],
  [5, 3],
  [3, 1],
] as const;

const NETWORK_CENTER_EDGES = [
  0,
  1,
  2,
  3,
  4,
  5,
] as const;

function normalizeGeneratedId(
  value: string,
): string {
  return value.replace(
    /[^A-Za-z0-9_-]/gu,
    "",
  );
}

function normalizeCode(
  value: string,
  codeLength: number,
): string {
  return value
    .toUpperCase()
    .replace(
      /[^A-Z0-9]/gu,
      "",
    )
    .slice(
      0,
      codeLength,
    );
}

function getCodeStatus(
  originalCode: string,
  normalizedCode: string,
  codeLength: number,
): VerificationCodeFieldStatus {
  const uppercaseOriginalCode =
    originalCode.toUpperCase();

  if (
    !ALPHANUMERIC_PATTERN.test(
      uppercaseOriginalCode,
    )
    || Array.from(
      uppercaseOriginalCode,
    ).length > codeLength
  ) {
    return "INVALID";
  }

  if (
    normalizedCode.length === 0
  ) {
    return "EMPTY";
  }

  if (
    normalizedCode.length
    === codeLength
  ) {
    return "COMPLETE";
  }

  return "INCOMPLETE";
}

export function VerificationCodeField({
  fieldId,
  name = "verificationCode",
  label,
  description,
  errorMessage,
  code,
  codeLength = DEFAULT_CODE_LENGTH,
  visualState = "IDLE",
  onCodeChange,
  onCodeComplete,
  onStatusChange,
  disabled,
  required = true,
  className,
  "aria-describedby":
    providedAriaDescribedBy,
  "aria-invalid":
    providedAriaInvalid,
  onFocus,
  onBlur,
  ...inputProperties
}: VerificationCodeFieldProps) {
  const generatedId =
    useId();

  const prefersReducedMotion =
    useReducedMotion();

  const inputReference =
    useRef<HTMLInputElement | null>(
      null,
    );

  const lastCompletedCodeReference =
    useRef<string | null>(
      null,
    );

  const onCodeChangeReference =
    useRef(onCodeChange);

  const [
    focused,
    setFocused,
  ] = useState(false);

  const resolvedFieldId =
    fieldId
    ?? `verification-code-field-${normalizeGeneratedId(
      generatedId,
    )}`;

  const safeResolvedFieldId =
    normalizeGeneratedId(
      resolvedFieldId,
    );

  const labelId =
    `${resolvedFieldId}-label`;

  const descriptionId =
    description
      ? `${resolvedFieldId}-description`
      : undefined;

  const errorId =
    errorMessage
      ? `${resolvedFieldId}-error`
      : undefined;

  const describedBy =
    [
      providedAriaDescribedBy,
      descriptionId,
      errorId,
    ]
      .filter(Boolean)
      .join(" ")
    || undefined;

  const normalizedCode =
    useMemo(
      () =>
        normalizeCode(
          code,
          codeLength,
        ),
      [
        code,
        codeLength,
      ],
    );

  const status =
    useMemo(
      () =>
        getCodeStatus(
          code,
          normalizedCode,
          codeLength,
        ),
      [
        code,
        normalizedCode,
        codeLength,
      ],
    );

  useEffect(
    () => {
      onStatusChange?.(
        status,
      );
    },
    [
      onStatusChange,
      status,
    ],
  );

  useEffect(
    () => {
      onCodeChangeReference.current =
        onCodeChange;
    },
    [onCodeChange],
  );

  useEffect(
    () => {
      if (
        visualState !== "ERROR"
      ) {
        return undefined;
      }

      const resetTimeoutIdentifier =
        window.setTimeout(
          () => {
            onCodeChangeReference.current(
              "",
            );

            window.setTimeout(
              () => {
                inputReference.current?.focus();
              },
              80,
            );
          },
          1350,
        );

      return () => {
        window.clearTimeout(
          resetTimeoutIdentifier,
        );
      };
    },
    [visualState],
  );

  useEffect(
    () => {
      if (
        status !== "COMPLETE"
      ) {
        lastCompletedCodeReference.current =
          null;

        return;
      }

      if (
        lastCompletedCodeReference.current
        === normalizedCode
      ) {
        return;
      }

      lastCompletedCodeReference.current =
        normalizedCode;

      onCodeComplete?.(
        normalizedCode,
      );
    },
    [
      normalizedCode,
      onCodeComplete,
      status,
    ],
  );

  const handleChange =
    (
      event:
        ChangeEvent<HTMLInputElement>,
    ): void => {
      onCodeChange(
        normalizeCode(
          event.target.value,
          codeLength,
        ),
      );
    };

  const characters =
    Array.from({
      length:
        codeLength,
    }, (_, index) =>
      normalizedCode[
        index
      ] ?? "",
    );

  const activeIndex =
    Math.min(
      normalizedCode.length,
      codeLength - 1,
    );

  const invalid =
    visualState === "ERROR"
    || status === "INVALID"
    || Boolean(
      errorMessage,
    )
    || providedAriaInvalid === true
    || providedAriaInvalid === "true";

  const interactionDisabled =
    disabled
    || visualState === "VERIFYING"
    || visualState === "SUCCESS";

  const focusInput =
    (): void => {
      if (
        interactionDisabled
      ) {
        return;
      }

      inputReference.current?.focus();
    };

  const inputStyle = {
    caretColor:
      "transparent",
  } satisfies CSSProperties;

  return (
    <div
      data-verification-code-field=""
      data-verification-code-status={
        status.toLowerCase()
      }
      data-verification-code-complete={
        status === "COMPLETE"
          ? "true"
          : "false"
      }
      data-verification-code-visual-state={
        visualState.toLowerCase()
      }
      className={cn(
        "relative w-full",
        className,
      )}
    >
      <span
        id={labelId}
        className="sr-only"
      >
        {label}
      </span>

      {description ? (
        <p
          id={descriptionId}
          className="sr-only"
        >
          {description}
        </p>
      ) : null}

      {errorMessage ? (
        <p
          id={errorId}
          className="sr-only"
        >
          {errorMessage}
        </p>
      ) : null}

      <AnimatePresence
        mode="wait"
        initial={false}
      >
        {visualState === "VERIFYING" ? (
          <motion.div
            key="verification-network"
            initial={
              prefersReducedMotion
                ? false
                : {
                    opacity: 0,
                    scale: 0.9,
                  }
            }
            animate={{
              opacity: 1,
              scale: 1,
            }}
            exit={{
              opacity: 0,
              scale:
                prefersReducedMotion
                  ? 1
                  : 0.18,
              filter:
                prefersReducedMotion
                  ? "blur(0px)"
                  : "blur(4px)",
            }}
            transition={{
              duration:
                prefersReducedMotion
                  ? 0
                  : 0.34,
              ease: [0.22, 1, 0.36, 1],
            }}
            className={cn(
              "relative mx-auto aspect-square",
              "w-[clamp(13.5rem,66vw,17rem)] max-w-full",
            )}
            aria-hidden="true"
          >
            <motion.div
              className="pointer-events-none absolute inset-[13%] z-[2] rounded-full"
              animate={
                prefersReducedMotion
                  ? { opacity: 0.32 }
                  : {
                      opacity: [0.18, 0.42, 0.2, 0.48, 0.18],
                      scale: [0.9, 1.04, 0.95, 1.07, 0.9],
                    }
              }
              transition={
                prefersReducedMotion
                  ? { duration: 0 }
                  : {
                      duration: NETWORK_LOOP_DURATION_SECONDS,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }
              }
              style={{
                background:
                  "radial-gradient(circle, var(--fixora-otp-center-glow) 0%, transparent 68%)",
                filter:
                  "blur(10px)",
              }}
            />

            <motion.svg
              viewBox="0 0 100 100"
              preserveAspectRatio="xMidYMid meet"
              className="pointer-events-none absolute inset-[27%] z-[12] size-[46%] overflow-visible"
              animate={
                prefersReducedMotion
                  ? { rotate: 0, opacity: 0.44 }
                  : {
                      rotate: [0, -360],
                      opacity: [0.24, 0.62, 0.3, 0.58, 0.24],
                    }
              }
              transition={
                prefersReducedMotion
                  ? { duration: 0 }
                  : {
                      rotate: {
                        duration: NETWORK_LOOP_DURATION_SECONDS * 1.5,
                        repeat: Infinity,
                        ease: "linear",
                      },
                      opacity: {
                        duration: NETWORK_LOOP_DURATION_SECONDS,
                        repeat: Infinity,
                        ease: "easeInOut",
                      },
                    }
              }
            >
              <circle
                cx="50"
                cy="50"
                r="43"
                fill="none"
                stroke="var(--fixora-otp-line)"
                strokeWidth="1.2"
                strokeDasharray="5 12"
                opacity="0.55"
              />
            </motion.svg>

            <motion.div
              className="absolute inset-0 z-10"
              animate={
                prefersReducedMotion
                  ? { rotate: 0 }
                  : { rotate: [0, 360] }
              }
              transition={
                prefersReducedMotion
                  ? { duration: 0 }
                  : {
                      duration: NETWORK_LOOP_DURATION_SECONDS,
                      delay: 0.46,
                      repeat: Infinity,
                      ease: "linear",
                    }
              }
            >
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="xMidYMid meet"
                className="pointer-events-none absolute inset-0 size-full overflow-visible"
              >
                <defs>
                  <filter
                    id={`${safeResolvedFieldId}-network-glow`}
                    x="-55%"
                    y="-55%"
                    width="210%"
                    height="210%"
                  >
                    <feGaussianBlur
                      stdDeviation="1.3"
                      result="blur"
                    />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {NETWORK_EDGES.map(
                  ([fromIndex, toIndex], edgeIndex) => {
                    const fromPoint = NETWORK_POINTS[fromIndex];
                    const toPoint = NETWORK_POINTS[toIndex];

                    return (
                      <motion.line
                        key={`outer-${fromIndex}-${toIndex}`}
                        x1={fromPoint.x}
                        y1={fromPoint.y}
                        x2={toPoint.x}
                        y2={toPoint.y}
                        vectorEffect="non-scaling-stroke"
                        stroke="var(--fixora-otp-line)"
                        strokeWidth="1.15"
                        strokeLinecap="round"
                        filter={`url(#${safeResolvedFieldId}-network-glow)`}
                        initial={
                          prefersReducedMotion
                            ? false
                            : {
                                pathLength: 0,
                                opacity: 0,
                              }
                        }
                        animate={
                          prefersReducedMotion
                            ? {
                                pathLength: 1,
                                opacity: 0.94,
                              }
                            : {
                                pathLength: [0, 1, 1, 0.84, 1],
                                opacity: [0.2, 1, 0.72, 0.9, 1],
                              }
                        }
                        transition={
                          prefersReducedMotion
                            ? { duration: 0 }
                            : {
                                duration: NETWORK_LOOP_DURATION_SECONDS,
                                delay: 0.2 + edgeIndex * 0.035,
                                times: [0, 0.2, 0.52, 0.78, 1],
                                ease: "easeInOut",
                                repeat: Infinity,
                              }
                        }
                      />
                    );
                  },
                )}

                {NETWORK_CENTER_EDGES.map((nodeIndex, edgeIndex) => {
                  const point = NETWORK_POINTS[nodeIndex];

                  return (
                    <motion.line
                      key={`center-${nodeIndex}`}
                      x1={point.x}
                      y1={point.y}
                      x2="50"
                      y2="50"
                      vectorEffect="non-scaling-stroke"
                      stroke="var(--fixora-otp-line)"
                      strokeWidth="0.82"
                      strokeLinecap="round"
                      filter={`url(#${safeResolvedFieldId}-network-glow)`}
                      initial={
                        prefersReducedMotion
                          ? false
                          : {
                              pathLength: 0,
                              opacity: 0,
                            }
                      }
                      animate={
                        prefersReducedMotion
                          ? {
                              pathLength: 1,
                              opacity: 0.42,
                            }
                          : {
                              pathLength: [0, 1, 0.72, 1],
                              opacity: [0.08, 0.52, 0.28, 0.5],
                            }
                      }
                      transition={
                        prefersReducedMotion
                          ? { duration: 0 }
                          : {
                              duration: NETWORK_LOOP_DURATION_SECONDS,
                              delay: 0.26 + edgeIndex * 0.03,
                              times: [0, 0.28, 0.66, 1],
                              ease: "easeInOut",
                              repeat: Infinity,
                            }
                      }
                    />
                  );
                })}
              </svg>

              {characters.map((character, index) => {
                const point = NETWORK_POINTS[index];
                const initialX = ROW_POINTS[index];

                return (
                  <motion.div
                    key={`${index}-${character}`}
                    className={cn(
                      "absolute z-10",
                      "flex size-[clamp(2.5rem,10vw,3.25rem)]",
                      "-translate-x-1/2 -translate-y-1/2",
                      "items-center justify-center",
                      "rounded-[clamp(0.68rem,2.2vw,0.9rem)]",
                      "border border-[var(--fixora-otp-active-border)]",
                      "bg-[var(--fixora-otp-box)]",
                      "text-[clamp(0.95rem,3.7vw,1.22rem)] font-bold",
                      "text-[var(--fixora-foreground)]",
                      "shadow-[var(--fixora-otp-node-shadow)]",
                    )}
                    initial={
                      prefersReducedMotion
                        ? false
                        : {
                            left: `${initialX}%`,
                            top: "50%",
                            scale: 0.88,
                            opacity: 0.5,
                          }
                    }
                    animate={
                      prefersReducedMotion
                        ? {
                            left: `${point.x}%`,
                            top: `${point.y}%`,
                            scale: 1,
                            opacity: 1,
                          }
                        : {
                            left: `${point.x}%`,
                            top: `${point.y}%`,
                            scale: [0.98, 1.035, 0.99, 1.025, 0.98],
                            opacity: [0.88, 1, 0.94, 1, 0.88],
                          }
                    }
                    transition={
                      prefersReducedMotion
                        ? { duration: 0 }
                        : {
                            left: {
                              duration: 0.42,
                              ease: [0.22, 1, 0.36, 1],
                            },
                            top: {
                              duration: 0.42,
                              ease: [0.22, 1, 0.36, 1],
                            },
                            scale: {
                              duration: NETWORK_LOOP_DURATION_SECONDS,
                              times: [0, 0.25, 0.5, 0.75, 1],
                              ease: "easeInOut",
                              repeat: Infinity,
                            },
                            opacity: {
                              duration: NETWORK_LOOP_DURATION_SECONDS,
                              times: [0, 0.25, 0.5, 0.75, 1],
                              ease: "easeInOut",
                              repeat: Infinity,
                            },
                          }
                    }
                  >
                    <motion.span
                      className="flex size-full items-center justify-center"
                      animate={
                        prefersReducedMotion
                          ? { rotate: 0 }
                          : { rotate: [0, -360] }
                      }
                      transition={
                        prefersReducedMotion
                          ? { duration: 0 }
                          : {
                              duration: NETWORK_LOOP_DURATION_SECONDS,
                              delay: 0.46,
                              repeat: Infinity,
                              ease: "linear",
                            }
                      }
                    >
                      {character}
                    </motion.span>
                  </motion.div>
                );
              })}
            </motion.div>

            <motion.div
              className={cn(
                "absolute top-1/2 left-1/2 z-30",
                "flex size-[clamp(4.6rem,18vw,5.8rem)]",
                "-translate-x-1/2 -translate-y-1/2",
                "items-center justify-center rounded-full",
              )}
              animate={
                prefersReducedMotion
                  ? { opacity: 0.9, scale: 1 }
                  : {
                      opacity: [0.72, 1, 0.82, 1, 0.72],
                      scale: [0.94, 1.04, 0.98, 1.06, 0.94],
                    }
              }
              transition={
                prefersReducedMotion
                  ? { duration: 0 }
                  : {
                      duration: NETWORK_LOOP_DURATION_SECONDS,
                      times: [0, 0.22, 0.5, 0.78, 1],
                      ease: "easeInOut",
                      repeat: Infinity,
                    }
              }
              style={{
                background:
                  "radial-gradient(circle, var(--fixora-otp-center-glow) 0%, transparent 72%)",
                filter:
                  "drop-shadow(0 0 11px var(--fixora-otp-glow))",
              }}
            >
              <BrandLogo
                variant="auto"
                size="sm"
                alt=""
                loading="eager"
                className="!w-[clamp(4.35rem,17vw,5.45rem)]"
                imageClassName="pointer-events-none select-none"
              />
            </motion.div>
          </motion.div>
        ) : visualState === "SUCCESS" ? (
          <motion.div
            key="verification-success"
            initial={
              prefersReducedMotion
                ? false
                : {
                    opacity: 0,
                    scale: 0.82,
                  }
            }
            animate={{
              opacity: 1,
              scale: 1,
            }}
            transition={{
              duration:
                prefersReducedMotion
                  ? 0
                  : 0.3,
              ease: [
                0.22,
                1,
                0.36,
                1,
              ],
            }}
            className={cn(
              "mx-auto flex",
              "h-[clamp(8rem,34vw,10.5rem)]",
              "items-center justify-center",
            )}
            aria-hidden="true"
          >
            <motion.svg
              viewBox="0 0 72 72"
              className="size-[clamp(4.6rem,18vw,5.8rem)] overflow-visible"
            >
              <motion.rect
                x="8"
                y="8"
                width="56"
                height="56"
                rx="15"
                fill="var(--fixora-otp-box)"
                stroke="var(--fixora-otp-active-border)"
                strokeWidth="2"
                initial={
                  prefersReducedMotion
                    ? false
                    : {
                        pathLength: 0,
                        opacity: 0,
                      }
                }
                animate={{
                  pathLength: 1,
                  opacity: 1,
                }}
                transition={{
                  duration:
                    prefersReducedMotion
                      ? 0
                      : 0.55,
                  ease:
                    "easeOut",
                }}
                style={{
                  filter:
                    "drop-shadow(0 0 10px var(--fixora-otp-glow))",
                }}
              />

              <motion.path
                d="M24.5 36.5 32.5 44.5 49 27.5"
                fill="none"
                stroke="var(--fixora-otp-active-border)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={
                  prefersReducedMotion
                    ? false
                    : {
                        pathLength: 0,
                        opacity: 0,
                      }
                }
                animate={{
                  pathLength: 1,
                  opacity: 1,
                }}
                transition={{
                  duration:
                    prefersReducedMotion
                      ? 0
                      : 0.42,
                  delay:
                    prefersReducedMotion
                      ? 0
                      : 0.22,
                  ease:
                    "easeOut",
                }}
                style={{
                  filter:
                    "drop-shadow(0 0 8px var(--fixora-otp-glow))",
                }}
              />
            </motion.svg>
          </motion.div>
        ) : visualState === "ERROR" ? (
          <motion.div
            key="verification-error"
            initial={
              prefersReducedMotion
                ? false
                : {
                    opacity: 0,
                    scale: 0.82,
                  }
            }
            animate={{
              opacity: 1,
              scale: 1,
            }}
            exit={{
              opacity: 0,
              scale:
                prefersReducedMotion
                  ? 1
                  : 0.9,
            }}
            transition={{
              duration:
                prefersReducedMotion
                  ? 0
                  : 0.28,
              ease: [0.22, 1, 0.36, 1],
            }}
            className={cn(
              "mx-auto flex",
              "h-[clamp(8rem,34vw,10.5rem)]",
              "items-center justify-center",
            )}
            aria-hidden="true"
          >
            <motion.svg
              viewBox="0 0 72 72"
              className="size-[clamp(4.6rem,18vw,5.8rem)] overflow-visible"
            >
              <motion.rect
                x="8"
                y="8"
                width="56"
                height="56"
                rx="15"
                fill="var(--fixora-otp-box)"
                stroke="var(--fixora-otp-error-border)"
                strokeWidth="2"
                initial={
                  prefersReducedMotion
                    ? false
                    : { pathLength: 0, opacity: 0 }
                }
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{
                  duration: prefersReducedMotion ? 0 : 0.48,
                  ease: "easeOut",
                }}
                style={{
                  filter: "drop-shadow(0 0 10px var(--fixora-otp-error-glow))",
                }}
              />

              <motion.path
                d="M26 26 46 46 M46 26 26 46"
                fill="none"
                stroke="var(--fixora-otp-error-border)"
                strokeWidth="4"
                strokeLinecap="round"
                initial={
                  prefersReducedMotion
                    ? false
                    : { pathLength: 0, opacity: 0 }
                }
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{
                  duration: prefersReducedMotion ? 0 : 0.42,
                  delay: prefersReducedMotion ? 0 : 0.18,
                  ease: "easeOut",
                }}
                style={{
                  filter: "drop-shadow(0 0 8px var(--fixora-otp-error-glow))",
                }}
              />
            </motion.svg>
          </motion.div>
        ) : (
          <motion.div
            key="verification-inputs"
            initial={false}
            animate={{
              opacity: 1,
            }}
            exit={{
              opacity: 0,
              scale:
                prefersReducedMotion
                  ? 1
                  : 0.985,
            }}
            transition={{
              duration:
                prefersReducedMotion
                  ? 0
                  : 0.14,
            }}
            className="relative mx-auto w-full max-w-[21rem]"
          >
            <div
              role="presentation"
              onMouseDown={(
                event,
              ) => {
                event.preventDefault();
                focusInput();
              }}
              className={cn(
                "grid w-full grid-cols-6",
                "gap-[clamp(0.3rem,1.6vw,0.52rem)]",
              )}
            >
              {characters.map(
                (
                  character,
                  index,
                ) => {
                  const hasValue =
                    character.length > 0;

                  const active =
                    focused
                    && index === activeIndex
                    && !interactionDisabled;

                  const animatedStroke =
                    invalid
                      ? "var(--fixora-otp-error-border)"
                      : "var(--fixora-otp-active-border)";

                  return (
                    <motion.div
                      key={index}
                      layout
                      data-otp-node=""
                      data-has-value={
                        hasValue
                          ? "true"
                          : "false"
                      }
                      className={cn(
                        "relative min-w-0 aspect-[0.9]",
                        "overflow-visible",
                        "rounded-[clamp(0.62rem,2vw,0.82rem)]",
                        "border",
                        hasValue
                          ? "border-transparent"
                          : invalid
                            ? "border-[var(--fixora-otp-error-border)]"
                            : active
                              ? "border-[var(--fixora-otp-active-border)]"
                              : "border-[var(--fixora-otp-border)]",
                        "bg-[var(--fixora-otp-box)]",
                        "shadow-[var(--fixora-otp-box-shadow)]",
                        "transition-[border-color,box-shadow,transform,background-color]",
                        "duration-200",
                        active
                          ? "scale-[1.018] shadow-[var(--fixora-otp-active-shadow)]"
                          : "scale-100",
                        invalid
                          && !hasValue
                          && "shadow-[var(--fixora-otp-error-button-shadow)]",
                      )}
                    >
                      {hasValue ? (
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 100 112"
                          preserveAspectRatio="none"
                          className="pointer-events-none absolute inset-0 size-full overflow-visible"
                        >
                          <motion.rect
                            x="1.6"
                            y="1.6"
                            width="96.8"
                            height="108.8"
                            rx="18"
                            fill="none"
                            stroke={
                              animatedStroke
                            }
                            strokeWidth="1.7"
                            vectorEffect="non-scaling-stroke"
                            initial={
                              prefersReducedMotion
                                ? false
                                : {
                                    pathLength: 0,
                                    opacity: 0.35,
                                  }
                            }
                            animate={{
                              pathLength: 1,
                              opacity: 1,
                            }}
                            transition={{
                              duration:
                                prefersReducedMotion
                                  ? 0
                                  : 0.68,
                              ease: [
                                0.22,
                                1,
                                0.36,
                                1,
                              ],
                            }}
                            style={{
                              filter:
                                invalid
                                  ? "drop-shadow(0 0 4px var(--fixora-otp-error-glow))"
                                  : "drop-shadow(0 0 4px var(--fixora-otp-glow))",
                            }}
                          />
                        </svg>
                      ) : null}

                      <span
                        className={cn(
                          "absolute inset-0",
                          "flex items-center justify-center",
                          "text-[clamp(1.05rem,5vw,1.48rem)]",
                          "font-semibold tracking-[-0.03em]",
                          "text-[var(--fixora-foreground)]",
                        )}
                      >
                        {character}

                        {!hasValue
                        && active ? (
                          <motion.span
                            aria-hidden="true"
                            className={cn(
                              "h-[40%] w-px",
                              "bg-[var(--fixora-otp-active-border)]",
                            )}
                            animate={
                              prefersReducedMotion
                                ? {
                                    opacity: 1,
                                  }
                                : {
                                    opacity: [
                                      1,
                                      0.2,
                                      1,
                                    ],
                                  }
                            }
                            transition={
                              prefersReducedMotion
                                ? {
                                    duration: 0,
                                  }
                                : {
                                    duration: 1.05,
                                    repeat:
                                      Infinity,
                                  }
                            }
                          />
                        ) : null}
                      </span>
                    </motion.div>
                  );
                },
              )}
            </div>

            <input
              {...inputProperties}
              ref={inputReference}
              id={resolvedFieldId}
              name={name}
              type="text"
              inputMode="text"
              autoComplete="one-time-code"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              value={normalizedCode}
              minLength={codeLength}
              maxLength={codeLength}
              pattern="[A-Z0-9]{6}"
              required={required}
              disabled={interactionDisabled}
              aria-labelledby={labelId}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={handleChange}
              onFocus={(
                event,
              ) => {
                setFocused(true);
                onFocus?.(event);
              }}
              onBlur={(
                event,
              ) => {
                setFocused(false);
                onBlur?.(event);
              }}
              className={cn(
                "absolute inset-0 z-20 size-full",
                "cursor-text opacity-0",
                "disabled:cursor-default",
              )}
              style={inputStyle}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}