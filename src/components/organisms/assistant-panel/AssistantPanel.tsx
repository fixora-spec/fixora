"use client";

import {
  useCallback,
  useEffect,
  useId,
  useState,
} from "react";

import {
  LoaderCircle,
  Trash2,
  X,
} from "lucide-react";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "motion/react";

import { AssistantAvatar } from "@/components/atoms/assistant-avatar";
import { AssistantStatus } from "@/components/atoms/assistant-status";

import {
  AssistantChatTemplate,
} from "@/components/templates/assistant-chat-template";

import {
  getAssistantCopy,
  getAssistantSuggestions,
} from "@/config/assistant.config";

import { useAssistant } from "@/hooks/use-assistant";
import { cn } from "@/utils/cn";

import type {
  AssistantSuggestion,
} from "@/types/assistant";

import type {
  AssistantPanelProps,
} from "./AssistantPanel.types";

export function AssistantPanel({
  locale,
  isOpen,
  onClose,
  showBackdrop = true,
  closeOnBackdrop = true,
  closeOnEscape = true,
  className,
  ...sectionProps
}: AssistantPanelProps) {
  const prefersReducedMotion =
    useReducedMotion();

  const titleId = useId();
  const descriptionId = useId();

  const [inputValue, setInputValue] =
    useState("");

  const [
    isPanelReady,
    setIsPanelReady,
  ] = useState(false);

  const {
    isLoading,
    messages,
    error,
    sendMessage,
    clearMessages,
    clearError,
  } = useAssistant();

  const copy = getAssistantCopy(locale);

  const suggestions =
    getAssistantSuggestions(locale);

  const handleClose = useCallback((): void => {
    setIsPanelReady(false);
    clearError();
    onClose();
  }, [
    clearError,
    onClose,
  ]);

  useEffect(() => {
    if (
      !isOpen ||
      !closeOnEscape
    ) {
      return;
    }

    const handleKeyDown = (
      event: KeyboardEvent,
    ): void => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      handleClose();
    };

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [
    closeOnEscape,
    handleClose,
    isOpen,
  ]);

  const handleSubmitMessage = async (
    message: string,
  ): Promise<void> => {
    const normalizedMessage =
      message.trim();

    if (!normalizedMessage) {
      return;
    }

    setInputValue("");

    await sendMessage({
      message: normalizedMessage,
      locale,
    });
  };

  const handleSuggestionSelect = async (
    suggestion: AssistantSuggestion,
  ): Promise<void> => {
    setInputValue("");

    await sendMessage({
      message: suggestion.prompt,
      locale,
    });
  };

  const handleClearConversation =
    (): void => {
      setInputValue("");
      clearMessages();
    };

  const handleBackdropClick =
    (): void => {
      if (!closeOnBackdrop) {
        return;
      }

      handleClose();
    };

  const handlePanelAnimationComplete =
    (): void => {
      if (!isOpen) {
        return;
      }

      setIsPanelReady(true);
    };

  const status = error
    ? "error"
    : isLoading
      ? "thinking"
      : "available";

  const statusLabel = error
    ? locale === "es"
      ? "Ocurrió un error"
      : "An error occurred"
    : isLoading
      ? copy.loadingLabel
      : locale === "es"
        ? "Disponible"
        : "Available";

  const hasConversation =
    messages.length > 0;

  const panelOpenDelay =
    prefersReducedMotion
      ? 0
      : 1.5;

  return (
    <AnimatePresence initial={false}>
      {isOpen ? (
        <motion.div
          key="fixora-assistant-panel"
          className={cn(
            "fixed inset-0 z-[80]",
            "pointer-events-none",
          )}
          initial={{
            opacity: 1,
          }}
          animate={{
            opacity: 1,
          }}
          exit={{
            opacity: 0,
          }}
          transition={{
            duration:
              prefersReducedMotion
                ? 0
                : 0.18,
            ease: "easeOut",
          }}
        >
          {showBackdrop ? (
            <motion.button
              type="button"
              aria-label={copy.closeLabel}
              title={copy.closeLabel}
              onClick={
                handleBackdropClick
              }
              className={cn(
                "pointer-events-auto",
                "absolute inset-0",
                "cursor-default",

                "bg-black/15",
                "supports-[backdrop-filter]:backdrop-blur-[2px]",

                "dark:bg-black/30",

                "xl:bg-black/[0.08]",
                "xl:dark:bg-black/20",
              )}
              initial={
                prefersReducedMotion
                  ? false
                  : {
                      opacity: 0,
                    }
              }
              animate={{
                opacity: 1,
              }}
              exit={{
                opacity: 0,
              }}
              transition={{
                duration:
                  prefersReducedMotion
                    ? 0
                    : 0.2,
              }}
            />
          ) : null}

          {!prefersReducedMotion ? (
            <motion.div
              aria-hidden="true"
              className={cn(
                "pointer-events-none",

                "absolute top-1/2 left-1/2",
                "z-[2]",

                "-translate-x-1/2",
                "-translate-y-1/2",
              )}
              initial={{
                opacity: 0,
                scale: 0.9,
                y: 8,
              }}
              animate={{
                opacity: [
                  0,
                  1,
                  1,
                  0,
                ],
                scale: [
                  0.9,
                  1,
                  1,
                  0.96,
                ],
                y: [
                  8,
                  0,
                  0,
                  -4,
                ],
              }}
              transition={{
                duration: 1.65,
                times: [
                  0,
                  0.12,
                  0.86,
                  1,
                ],
                ease: "easeOut",
              }}
            >
              <div
                className={cn(
                  "flex items-center gap-2.5",
                  "rounded-full",

                  "border border-[#393939]/12",
                  "bg-[#fdfefe]/95",
                  "px-4 py-2.5",

                  "text-xs font-semibold",
                  "text-[#303530]",

                  "shadow-[0_16px_45px_rgba(12,15,12,0.18)]",

                  "supports-[backdrop-filter]:bg-[#fdfefe]/85",
                  "supports-[backdrop-filter]:backdrop-blur-xl",

                  "dark:border-white/12",
                  "dark:bg-[#111511]/95",
                  "dark:text-[#edf0ed]",

                  "dark:shadow-[0_18px_50px_rgba(0,0,0,0.50)]",

                  "dark:supports-[backdrop-filter]:bg-[#111511]/85",
                )}
              >
                <span
                  className={cn(
                    "flex size-8",
                    "items-center justify-center",
                    "rounded-full",

                    "bg-[#4ead35]",
                    "text-[#0c0f0c]",

                    "shadow-[0_6px_18px_rgba(78,173,53,0.28)]",

                    "dark:bg-[#57af33]",
                  )}
                >
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 animate-spin"
                    strokeWidth={2}
                  />
                </span>

                <span>
                  {locale === "es"
                    ? "Abriendo asistente..."
                    : "Opening assistant..."}
                </span>
              </div>
            </motion.div>
          ) : null}

          <motion.div
            className={cn(
              "pointer-events-auto",

              "absolute right-3 bottom-3 left-3",

              "h-[min(42rem,calc(100dvh-1.5rem))]",
              "max-h-[calc(100dvh-1.5rem)]",

              "sm:right-auto",
              "sm:bottom-[calc(6rem+env(safe-area-inset-bottom))]",
              "sm:left-6",
              "sm:h-[min(40rem,calc(100dvh-8rem))]",
              "sm:w-[25rem]",

              "xl:left-7",
              "xl:w-[26rem]",
            )}
            initial={
              prefersReducedMotion
                ? false
                : {
                    opacity: 0,
                    x: -18,
                    y: 18,
                    scale: 0.965,
                    filter: "blur(6px)",
                  }
            }
            animate={{
              opacity: 1,
              x: 0,
              y: 0,
              scale: 1,
              filter: "blur(0px)",
            }}
            exit={{
              opacity: 0,
              x: prefersReducedMotion
                ? 0
                : -14,
              y: prefersReducedMotion
                ? 0
                : 16,
              scale: prefersReducedMotion
                ? 1
                : 0.98,
              filter: prefersReducedMotion
                ? "blur(0px)"
                : "blur(4px)",
              transition: {
                duration:
                  prefersReducedMotion
                    ? 0
                    : 0.18,
                ease: "easeIn",
              },
            }}
            transition={{
              delay: panelOpenDelay,
              duration:
                prefersReducedMotion
                  ? 0
                  : 0.32,
              ease: [
                0.22,
                1,
                0.36,
                1,
              ],
            }}
            onAnimationComplete={
              handlePanelAnimationComplete
            }
          >
            <section
              {...sectionProps}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={
                descriptionId
              }
              data-open="true"
              className={cn(
                "flex size-full min-h-0",
                "flex-col overflow-hidden",

                "rounded-[1.75rem]",

                "border border-[#393939]/12",
                "bg-[#fdfefe]/98",

                "shadow-[0_26px_80px_rgba(12,15,12,0.24)]",

                "supports-[backdrop-filter]:bg-[#fdfefe]/92",
                "supports-[backdrop-filter]:backdrop-blur-2xl",

                "dark:border-white/12",
                "dark:bg-[#0c0f0c]/98",

                "dark:shadow-[0_28px_90px_rgba(0,0,0,0.55)]",

                "dark:supports-[backdrop-filter]:bg-[#0c0f0c]/92",

                className,
              )}
            >
              <header
                className={cn(
                  "flex shrink-0",
                  "items-center gap-3",

                  "border-b border-[#393939]/10",
                  "px-4 py-3.5",

                  "bg-white/75",

                  "supports-[backdrop-filter]:backdrop-blur-xl",

                  "dark:border-white/10",
                  "dark:bg-[#111511]/80",
                )}
              >
                <AssistantAvatar
                  size="md"
                  isActive={!error}
                  decorative
                />

                <div className="min-w-0 flex-1">
                  <h2
                    id={titleId}
                    className={cn(
                      "truncate",
                      "text-sm leading-tight",
                      "font-bold",
                      "tracking-[-0.015em]",

                      "text-[#252925]",
                      "dark:text-[#f1f3f1]",
                    )}
                  >
                    {copy.title}
                  </h2>

                  <p
                    id={descriptionId}
                    className="sr-only"
                  >
                    {copy.subtitle}
                  </p>

                  <div className="mt-1">
                    <AssistantStatus
                      status={status}
                      size="sm"
                      label={statusLabel}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  aria-label={
                    copy.clearLabel
                  }
                  title={copy.clearLabel}
                  disabled={
                    !hasConversation &&
                    !isLoading
                  }
                  onClick={
                    handleClearConversation
                  }
                  className={cn(
                    "flex size-9 shrink-0",
                    "items-center justify-center",
                    "rounded-xl",

                    "border border-[#393939]/10",
                    "bg-[#393939]/[0.04]",
                    "text-[#656b65]",

                    "transition-[background-color,border-color,color,opacity,transform]",
                    "duration-200 ease-out",

                    "hover:border-[#cf3f3f]/25",
                    "hover:bg-[#cf3f3f]/[0.08]",
                    "hover:text-[#b53232]",

                    "active:scale-[0.94]",

                    "focus-visible:outline-none",
                    "focus-visible:ring-2",
                    "focus-visible:ring-[#4ead35]",
                    "focus-visible:ring-offset-2",
                    "focus-visible:ring-offset-white",

                    "disabled:cursor-not-allowed",
                    "disabled:opacity-35",
                    "disabled:hover:border-[#393939]/10",
                    "disabled:hover:bg-[#393939]/[0.04]",
                    "disabled:hover:text-[#656b65]",
                    "disabled:active:scale-100",

                    "dark:border-white/10",
                    "dark:bg-white/[0.05]",
                    "dark:text-[#b9beb9]",

                    "dark:hover:border-[#ef6262]/25",
                    "dark:hover:bg-[#ef6262]/10",
                    "dark:hover:text-[#ff8181]",

                    "dark:focus-visible:ring-[#63bd3d]",
                    "dark:focus-visible:ring-offset-[#111511]",

                    "dark:disabled:hover:border-white/10",
                    "dark:disabled:hover:bg-white/[0.05]",
                    "dark:disabled:hover:text-[#b9beb9]",

                    "motion-reduce:transform-none",
                    "motion-reduce:transition-none",
                  )}
                >
                  <Trash2
                    aria-hidden="true"
                    className="size-[17px]"
                    strokeWidth={1.9}
                  />
                </button>

                <button
                  type="button"
                  aria-label={
                    copy.closeLabel
                  }
                  title={copy.closeLabel}
                  onClick={handleClose}
                  className={cn(
                    "flex size-9 shrink-0",
                    "items-center justify-center",
                    "rounded-xl",

                    "border border-[#393939]/10",
                    "bg-[#393939]/[0.04]",
                    "text-[#4b514b]",

                    "transition-[background-color,border-color,color,transform]",
                    "duration-200 ease-out",

                    "hover:border-[#4ead35]/30",
                    "hover:bg-[#4ead35]/10",
                    "hover:text-[#318b22]",

                    "active:scale-[0.94]",

                    "focus-visible:outline-none",
                    "focus-visible:ring-2",
                    "focus-visible:ring-[#4ead35]",
                    "focus-visible:ring-offset-2",
                    "focus-visible:ring-offset-white",

                    "dark:border-white/10",
                    "dark:bg-white/[0.05]",
                    "dark:text-[#d8ddd8]",

                    "dark:hover:border-[#63bd3d]/30",
                    "dark:hover:bg-[#63bd3d]/10",
                    "dark:hover:text-[#82d363]",

                    "dark:focus-visible:ring-[#63bd3d]",
                    "dark:focus-visible:ring-offset-[#111511]",

                    "motion-reduce:transform-none",
                    "motion-reduce:transition-none",
                  )}
                >
                  <X
                    aria-hidden="true"
                    className="size-[18px]"
                    strokeWidth={2}
                  />
                </button>
              </header>

              {isPanelReady ? (
                <AssistantChatTemplate
                  locale={locale}
                  copy={copy}
                  messages={messages}
                  suggestions={
                    suggestions
                  }
                  inputValue={
                    inputValue
                  }
                  onInputValueChange={
                    setInputValue
                  }
                  onSubmitMessage={
                    handleSubmitMessage
                  }
                  onSuggestionSelect={
                    handleSuggestionSelect
                  }
                  isLoading={
                    isLoading
                  }
                  error={error}
                  showSuggestions
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="min-h-0 flex-1"
                />
              )}
            </section>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}