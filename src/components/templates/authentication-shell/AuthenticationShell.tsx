"use client";

import {
  X,
} from "lucide-react";

import {
  motion,
  useReducedMotion,
} from "motion/react";

import {
  cn,
} from "@/utils/cn";

import type {
  AuthenticationShellProps,
} from "./AuthenticationShell.types";

export function AuthenticationShell({
  view,
  locale,
  children,
  panelTitle,
  panelDescription,
  panelActionLabel,
  panelActionAriaLabel,
  closeLabel,
  onClose,
  onPanelAction,
  panelActionDisabled = false,
  className,
  ...containerProps
}: AuthenticationShellProps) {
  const prefersReducedMotion =
    useReducedMotion();

  const registrationActive =
    view === "USER_REGISTRATION";

  const normalizedPanelActionLabel =
    panelActionLabel?.trim() ?? "";

  const normalizedPanelActionAriaLabel =
    panelActionAriaLabel?.trim()
    || normalizedPanelActionLabel;

  const showPanelAction =
    normalizedPanelActionLabel.length > 0
    && typeof onPanelAction === "function";

  const handlePanelAction = (): void => {
    if (
      panelActionDisabled
      || !onPanelAction
    ) {
      return;
    }

    onPanelAction();
  };

  return (
    <div
      {...containerProps}
      data-authentication-shell=""
      data-authentication-view={
        view
      }
      data-authentication-locale={
        locale
      }
      className={cn(
        "relative flex min-h-dvh w-full",
        "items-center justify-center",
        "overflow-hidden",
        "bg-[var(--fixora-background)]",
        "px-3 py-3",
        "sm:px-5 sm:py-5",
        "lg:px-8 lg:py-6",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0",

          "bg-[radial-gradient(circle_at_50%_42%,rgba(78,173,53,0.05),transparent_54%)]",

          "dark:bg-[radial-gradient(circle_at_50%_42%,rgba(87,175,51,0.06),transparent_56%)]",
        )}
      />

      <motion.div
        initial={
          prefersReducedMotion
            ? false
            : {
                opacity: 0,
                y: 14,
                scale: 0.99,
              }
        }
        animate={{
          opacity: 1,
          y: 0,
          scale: 1,
        }}
        transition={{
          duration:
            prefersReducedMotion
              ? 0
              : 0.4,

          ease: [
            0.22,
            1,
            0.36,
            1,
          ],
        }}
        className={cn(
          "relative z-10 w-full",
          "max-w-[62rem]",
          "overflow-hidden",

          "rounded-[1.6rem]",
          "border border-black/10",

          "bg-[var(--fixora-surface)]",

          "shadow-[0_12px_32px_rgba(28,34,28,0.16)]",

          "dark:border-white/10",

          "dark:shadow-[0_14px_38px_rgba(0,0,0,0.48)]",

          "sm:rounded-[2rem]",

          "lg:h-[min(36rem,calc(100dvh-3rem))]",
          "lg:min-h-[32rem]",
        )}
      >
        <button
          type="button"
          onClick={
            onClose
          }
          aria-label={
            closeLabel
          }
          title={
            closeLabel
          }
          className={cn(
            "absolute top-3 right-3 z-50",

            "inline-flex size-10",
            "items-center justify-center",

            "rounded-full",
            "border border-black/10",

            "bg-[var(--fixora-surface)]",
            "text-[var(--fixora-foreground)]",

            "shadow-[inset_3px_3px_7px_rgba(40,46,40,0.12),inset_-3px_-3px_7px_rgba(255,255,255,0.78)]",

            "transition-[transform,border-color,color,background-color]",
            "duration-200",

            "hover:scale-105",
            "hover:border-[#4ead35]/65",
            "hover:text-[#318b22]",

            "focus-visible:outline-none",
            "focus-visible:ring-2",
            "focus-visible:ring-[#4ead35]",
            "focus-visible:ring-offset-2",
            "focus-visible:ring-offset-[var(--fixora-surface)]",

            "active:scale-95",

            "dark:border-white/10",

            "dark:shadow-[inset_4px_4px_9px_rgba(0,0,0,0.58),inset_-3px_-3px_8px_rgba(255,255,255,0.025)]",

            "dark:hover:border-[#57af33]/70",
            "dark:hover:text-[#6ac447]",

            "motion-reduce:transform-none",
            "motion-reduce:transition-none",
          )}
        >
          <X
            aria-hidden="true"
            className="size-[18px]"
            strokeWidth={1.8}
          />
        </button>

        {/* MODELO EXCLUSIVO PARA CELULARES Y TABLETAS */}
        <div
          className={cn(
            "relative flex max-h-[calc(100dvh-1.5rem)]",
            "flex-col overflow-hidden",
            "lg:hidden",
          )}
        >
          <section
            aria-label={
              panelTitle
            }
            className={cn(
              "relative flex min-h-[9.25rem]",
              "shrink-0 items-center justify-center",
              "overflow-hidden",

              "border-b border-black/10",

              "bg-[linear-gradient(145deg,var(--fixora-surface),var(--fixora-surface-muted))]",

              "px-12 py-5",
              "text-center",

              "shadow-[inset_0_-10px_22px_rgba(42,49,42,0.07),inset_0_1px_0_rgba(255,255,255,0.82)]",

              "dark:border-white/10",

              "dark:shadow-[inset_0_-12px_24px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.025)]",
            )}
          >
            <div
              aria-hidden="true"
              className={cn(
                "absolute -top-24 -right-10",
                "size-40 rounded-full",

                "border border-black/10",

                "bg-[var(--fixora-surface)]",

                "shadow-[inset_15px_16px_30px_rgba(42,49,42,0.18),inset_-12px_-12px_26px_rgba(255,255,255,0.88)]",

                "dark:border-white/10",

                "dark:shadow-[inset_17px_18px_34px_rgba(0,0,0,0.65),inset_-9px_-9px_22px_rgba(255,255,255,0.025)]",
              )}
            />

            <div
              aria-hidden="true"
              className={cn(
                "absolute -bottom-24 -left-14",
                "size-40 rounded-full",

                "border border-black/10",

                "bg-[var(--fixora-surface-muted)]",

                "shadow-[inset_16px_18px_32px_rgba(42,49,42,0.2),inset_-12px_-12px_27px_rgba(255,255,255,0.82)]",

                "dark:border-white/10",

                "dark:shadow-[inset_18px_20px_36px_rgba(0,0,0,0.68),inset_-9px_-9px_22px_rgba(255,255,255,0.02)]",
              )}
            />

            <div className="relative z-10 w-full max-w-sm">
              <h2
                className={cn(
                  "text-xl font-bold",
                  "tracking-[-0.035em]",
                  "text-[var(--fixora-foreground)]",
                  "min-[380px]:text-2xl",
                )}
              >
                {panelTitle}
              </h2>

              <p
                className={cn(
                  "mx-auto mt-1.5",
                  "line-clamp-2 max-w-[17rem]",
                  "text-[0.7rem] leading-4",
                  "text-[var(--fixora-foreground-muted)]",
                  "min-[380px]:text-xs",
                )}
              >
                {panelDescription}
              </p>

              {showPanelAction ? (
                <button
                  type="button"
                  onClick={
                    handlePanelAction
                  }
                  disabled={
                    panelActionDisabled
                  }
                  aria-label={
                    normalizedPanelActionAriaLabel
                  }
                  aria-disabled={
                    panelActionDisabled
                  }
                  className={cn(
                    "mt-3 inline-flex min-h-9",
                    "min-w-36 items-center justify-center",

                    "rounded-full",
                    "border border-[#4ead35]/65",

                    "bg-[var(--fixora-surface)]",

                    "px-5",

                    "text-[0.65rem] font-bold",
                    "tracking-[0.16em]",
                    "text-[var(--fixora-foreground)]",
                    "uppercase",

                    "shadow-[inset_4px_4px_9px_rgba(42,49,42,0.12),inset_-4px_-4px_9px_rgba(255,255,255,0.76)]",

                    "transition-[transform,border-color,background-color,color]",
                    "duration-200",

                    "hover:border-[#4ead35]",
                    "hover:bg-[#4ead35]",
                    "hover:text-white",

                    "focus-visible:outline-none",
                    "focus-visible:ring-2",
                    "focus-visible:ring-[#4ead35]",

                    "active:scale-[0.98]",

                    "disabled:cursor-not-allowed",
                    "disabled:opacity-50",

                    "dark:shadow-[inset_5px_5px_11px_rgba(0,0,0,0.54),inset_-3px_-3px_8px_rgba(255,255,255,0.025)]",

                    "dark:hover:border-[#57af33]",
                    "dark:hover:bg-[#57af33]",
                    "dark:hover:text-[#0c0f0c]",
                  )}
                >
                  {normalizedPanelActionLabel}
                </button>
              ) : null}
            </div>
          </section>

          <motion.section
            key={
              `mobile-${view}`
            }
            initial={
              prefersReducedMotion
                ? false
                : {
                    opacity: 0,
                    y: 10,
                  }
            }
            animate={{
              opacity: 1,
              y: 0,
            }}
            transition={{
              duration:
                prefersReducedMotion
                  ? 0
                  : 0.28,

              ease:
                "easeOut",
            }}
            className={cn(
              "min-h-0 flex-1",
              "overflow-y-auto overscroll-contain",

              "px-4 pt-7 pb-5",
              "min-[380px]:px-5",

              "[scrollbar-width:thin]",
              "[scrollbar-color:var(--fixora-foreground-muted)_transparent]",
            )}
          >
            <div
              data-authentication-shell-form=""
              className="mx-auto w-full max-w-[26rem]"
            >
              {children}
            </div>
          </motion.section>
        </div>

        {/* MODELO EXCLUSIVO PARA ESCRITORIO */}
        <div
          className={cn(
            "relative hidden h-full",
            "grid-cols-2",
            "lg:grid",
          )}
        >
          <motion.section
            key={
              `desktop-form-${view}`
            }
            initial={
              prefersReducedMotion
                ? false
                : {
                    opacity: 0,

                    x:
                      registrationActive
                        ? 12
                        : -12,
                  }
            }
            animate={{
              opacity: 1,
              x: 0,
            }}
            transition={{
              duration:
                prefersReducedMotion
                  ? 0
                  : 0.28,

              ease:
                "easeOut",
            }}
            className={cn(
              "relative flex h-full min-h-0",
              "items-center justify-center",

              "overflow-y-auto overscroll-contain",

              registrationActive
                ? "col-start-2 px-8 py-5"
                : "col-start-1 px-10 py-8",

              "[scrollbar-width:thin]",
              "[scrollbar-color:var(--fixora-foreground-muted)_transparent]",
            )}
          >
            <div
              data-authentication-shell-form=""
              className={cn(
                "my-auto w-full",

                registrationActive
                  ? "max-w-[28rem]"
                  : "max-w-[24.5rem]",
              )}
            >
              {children}
            </div>
          </motion.section>

          <motion.aside
            aria-label={
              panelTitle
            }
            initial={false}
            animate={{
              x:
                registrationActive
                  ? "0%"
                  : "100%",
            }}
            transition={{
              duration:
                prefersReducedMotion
                  ? 0
                  : 0.58,

              ease: [
                0.22,
                1,
                0.36,
                1,
              ],
            }}
            className={cn(
              "absolute inset-y-0 left-0 z-20",
              "flex h-full w-1/2",

              "items-center justify-center",
              "overflow-hidden",

              "bg-[linear-gradient(145deg,var(--fixora-surface),var(--fixora-surface-muted))]",

              "shadow-[inset_10px_0_24px_rgba(42,49,42,0.06),inset_-10px_0_24px_rgba(255,255,255,0.18)]",

              "dark:shadow-[inset_12px_0_26px_rgba(0,0,0,0.26),inset_-8px_0_20px_rgba(255,255,255,0.015)]",
            )}
          >
            <div
              aria-hidden="true"
              className={cn(
                "absolute -top-44",
                "size-[21rem]",
                "rounded-full",

                registrationActive
                  ? "-right-20"
                  : "-left-20",

                "border border-black/10",

                "bg-[var(--fixora-surface)]",

                "shadow-[inset_24px_26px_48px_rgba(42,49,42,0.2),inset_-16px_-16px_38px_rgba(255,255,255,0.9)]",

                "dark:border-white/10",

                "dark:shadow-[inset_27px_29px_54px_rgba(0,0,0,0.72),inset_-11px_-11px_30px_rgba(255,255,255,0.022)]",
              )}
            />

            <div
              aria-hidden="true"
              className={cn(
                "absolute -bottom-56",
                "size-[29rem]",
                "rounded-full",

                registrationActive
                  ? "-left-40"
                  : "-right-40",

                "border border-black/10",

                "bg-[var(--fixora-surface-muted)]",

                "shadow-[inset_30px_32px_60px_rgba(42,49,42,0.23),inset_-18px_-18px_42px_rgba(255,255,255,0.86)]",

                "dark:border-white/10",

                "dark:shadow-[inset_32px_35px_66px_rgba(0,0,0,0.76),inset_-12px_-12px_34px_rgba(255,255,255,0.018)]",
              )}
            />

            <div
              aria-hidden="true"
              className={cn(
                "absolute inset-y-0 w-px",

                registrationActive
                  ? "right-0"
                  : "left-0",

                "bg-black/12",

                "dark:bg-white/10",
              )}
            />

            <motion.div
              key={
                `desktop-panel-${view}`
              }
              initial={
                prefersReducedMotion
                  ? false
                  : {
                      opacity: 0,
                      y: 10,
                    }
              }
              animate={{
                opacity: 1,
                y: 0,
              }}
              transition={{
                delay:
                  prefersReducedMotion
                    ? 0
                    : 0.14,

                duration:
                  prefersReducedMotion
                    ? 0
                    : 0.32,
              }}
              className={cn(
                "relative z-10",
                "max-w-md",
                "px-10 text-center",
              )}
            >
              <h2
                className={cn(
                  "text-3xl font-bold",
                  "tracking-[-0.045em]",
                  "text-[var(--fixora-foreground)]",
                  "xl:text-[2.25rem]",
                )}
              >
                {panelTitle}
              </h2>

              <p
                className={cn(
                  "mx-auto mt-4",
                  "max-w-sm",
                  "text-sm leading-6",
                  "text-[var(--fixora-foreground-muted)]",
                )}
              >
                {panelDescription}
              </p>

              {showPanelAction ? (
                <button
                  type="button"
                  onClick={
                    handlePanelAction
                  }
                  disabled={
                    panelActionDisabled
                  }
                  aria-label={
                    normalizedPanelActionAriaLabel
                  }
                  aria-disabled={
                    panelActionDisabled
                  }
                  className={cn(
                    "mt-7 inline-flex",
                    "min-h-11 min-w-44",
                    "items-center justify-center",

                    "rounded-full",
                    "border border-[#4ead35]/65",

                    "bg-[var(--fixora-surface)]",

                    "px-7",

                    "text-xs font-bold",
                    "tracking-[0.18em]",
                    "text-[var(--fixora-foreground)]",
                    "uppercase",

                    "shadow-[inset_5px_5px_11px_rgba(42,49,42,0.14),inset_-5px_-5px_11px_rgba(255,255,255,0.82)]",

                    "transition-[transform,border-color,background-color,color]",
                    "duration-200",

                    "hover:-translate-y-0.5",
                    "hover:border-[#4ead35]",
                    "hover:bg-[#4ead35]",
                    "hover:text-white",

                    "focus-visible:outline-none",
                    "focus-visible:ring-2",
                    "focus-visible:ring-[#4ead35]",
                    "focus-visible:ring-offset-2",
                    "focus-visible:ring-offset-[var(--fixora-surface)]",

                    "active:translate-y-0",
                    "active:scale-[0.98]",

                    "disabled:cursor-not-allowed",
                    "disabled:opacity-50",

                    "dark:shadow-[inset_6px_6px_13px_rgba(0,0,0,0.58),inset_-4px_-4px_10px_rgba(255,255,255,0.022)]",

                    "dark:hover:border-[#57af33]",
                    "dark:hover:bg-[#57af33]",
                    "dark:hover:text-[#0c0f0c]",

                    "motion-reduce:transform-none",
                    "motion-reduce:transition-none",
                  )}
                >
                  {normalizedPanelActionLabel}
                </button>
              ) : null}
            </motion.div>
          </motion.aside>
        </div>
      </motion.div>
    </div>
  );
}