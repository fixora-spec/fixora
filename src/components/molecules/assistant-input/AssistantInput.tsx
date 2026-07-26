"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import {
  LoaderCircle,
  SendHorizontal,
} from "lucide-react";

import { ASSISTANT_CONFIG } from "@/config/assistant.config";
import { cn } from "@/utils/cn";

import type { AssistantInputProps } from "./AssistantInput.types";

function normalizeRowCount(
  value: number,
  fallback: number,
): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
}

export function AssistantInput({
  value,
  onValueChange,
  onSubmitMessage,
  placeholder = "Escribe tu consulta...",
  sendLabel = "Enviar mensaje",
  textareaId,
  textareaName = "assistant-message",
  maxLength = ASSISTANT_CONFIG.maxMessageLength,
  minRows = 1,
  maxRows = 5,
  isLoading = false,
  disabled = false,
  autoFocus = false,
  showCharacterCount = true,
  textareaRef,
  className,
  ...formProps
}: AssistantInputProps) {
  const generatedId = useId();

  const internalTextareaRef =
    useRef<HTMLTextAreaElement | null>(null);

  const resolvedTextareaId =
    textareaId ?? `assistant-input-${generatedId}`;

  const characterCountId =
    `${resolvedTextareaId}-character-count`;

  const resolvedMinRows = normalizeRowCount(
    minRows,
    1,
  );

  const resolvedMaxRows = Math.max(
    resolvedMinRows,
    normalizeRowCount(maxRows, 5),
  );

  const normalizedValue = value.trim();

  const isSubmitDisabled =
    disabled ||
    isLoading ||
    normalizedValue.length === 0 ||
    value.length > maxLength;

  const setTextareaElement = useCallback(
    (element: HTMLTextAreaElement | null) => {
      internalTextareaRef.current = element;

      if (textareaRef) {
        textareaRef.current = element;
      }
    },
    [textareaRef],
  );

  const resizeTextarea = useCallback((): void => {
    const textarea = internalTextareaRef.current;

    if (!textarea || typeof window === "undefined") {
      return;
    }

    textarea.style.height = "auto";

    const computedStyle =
      window.getComputedStyle(textarea);

    const lineHeight =
      Number.parseFloat(computedStyle.lineHeight) || 24;

    const paddingTop =
      Number.parseFloat(computedStyle.paddingTop) || 0;

    const paddingBottom =
      Number.parseFloat(computedStyle.paddingBottom) || 0;

    const borderTop =
      Number.parseFloat(
        computedStyle.borderTopWidth,
      ) || 0;

    const borderBottom =
      Number.parseFloat(
        computedStyle.borderBottomWidth,
      ) || 0;

    const verticalSpacing =
      paddingTop +
      paddingBottom +
      borderTop +
      borderBottom;

    const minimumHeight =
      lineHeight * resolvedMinRows +
      verticalSpacing;

    const maximumHeight =
      lineHeight * resolvedMaxRows +
      verticalSpacing;

    const nextHeight = Math.min(
      Math.max(textarea.scrollHeight, minimumHeight),
      maximumHeight,
    );

    textarea.style.height = `${nextHeight}px`;

    textarea.style.overflowY =
      textarea.scrollHeight > maximumHeight
        ? "auto"
        : "hidden";
  }, [resolvedMaxRows, resolvedMinRows]);

  useEffect(() => {
    resizeTextarea();
  }, [resizeTextarea, value]);

  const submitMessage = useCallback((): void => {
    if (isSubmitDisabled) {
      return;
    }

    void onSubmitMessage(normalizedValue);
  }, [
    isSubmitDisabled,
    normalizedValue,
    onSubmitMessage,
  ]);

  const handleSubmit = (
    event: FormEvent<HTMLFormElement>,
  ): void => {
    event.preventDefault();
    submitMessage();
  };

  const handleChange = (
    event: ChangeEvent<HTMLTextAreaElement>,
  ): void => {
    onValueChange(
      event.currentTarget.value.slice(0, maxLength),
    );
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>,
  ): void => {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }

    event.preventDefault();
    submitMessage();
  };

  return (
    <form
      {...formProps}
      onSubmit={handleSubmit}
      className={cn(
        "relative w-full",
        "rounded-[1.35rem]",
        "border border-[#393939]/12",
        "bg-white/95",
        "p-1.5",

        "shadow-[0_10px_30px_rgba(57,57,57,0.10)]",

        "transition-[background-color,border-color,box-shadow]",
        "duration-300 ease-out",

        "focus-within:border-[#4ead35]/45",
        "focus-within:shadow-[0_12px_34px_rgba(78,173,53,0.14)]",

        "dark:border-white/10",
        "dark:bg-[#141814]/95",
        "dark:shadow-[0_12px_34px_rgba(0,0,0,0.34)]",

        "dark:focus-within:border-[#63bd3d]/45",
        "dark:focus-within:shadow-[0_12px_36px_rgba(87,175,51,0.16)]",

        disabled && "opacity-65",
        className,
      )}
    >
      <div className="flex items-end gap-1.5">
        <label
          htmlFor={resolvedTextareaId}
          className="sr-only"
        >
          {placeholder}
        </label>

        <textarea
          ref={setTextareaElement}
          id={resolvedTextareaId}
          name={textareaName}
          value={value}
          rows={resolvedMinRows}
          maxLength={maxLength}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={isLoading}
          autoFocus={autoFocus}
          aria-describedby={
            showCharacterCount
              ? characterCountId
              : undefined
          }
          aria-invalid={
            value.length > maxLength
              ? true
              : undefined
          }
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          className={cn(
            "min-h-11 min-w-0 flex-1 resize-none",
            "overflow-x-hidden",
            "bg-transparent",
            "px-3 py-2.5",

            "text-sm leading-6",
            "text-[#303530]",
            "placeholder:text-[#8a918a]",

            "outline-none",
            "disabled:cursor-not-allowed",

            "dark:text-[#edf0ed]",
            "dark:placeholder:text-[#858c85]",

            "scrollbar-thin",
          )}
        />

        <button
          type="submit"
          aria-label={sendLabel}
          title={sendLabel}
          disabled={isSubmitDisabled}
          className={cn(
            "flex size-11 shrink-0",
            "items-center justify-center",
            "rounded-2xl",

            "border border-[#4ead35]/35",
            "bg-[#4ead35]",
            "text-[#0c0f0c]",

            "shadow-[0_8px_22px_rgba(78,173,53,0.22)]",

            "transition-[background-color,border-color,box-shadow,opacity,transform]",
            "duration-200 ease-out",

            "hover:bg-[#57af33]",
            "hover:shadow-[0_10px_26px_rgba(78,173,53,0.28)]",

            "active:scale-[0.94]",

            "focus-visible:outline-none",
            "focus-visible:ring-2",
            "focus-visible:ring-[#318b22]",
            "focus-visible:ring-offset-2",
            "focus-visible:ring-offset-white",

            "disabled:cursor-not-allowed",
            "disabled:border-[#393939]/10",
            "disabled:bg-[#393939]/10",
            "disabled:text-[#7c837c]",
            "disabled:shadow-none",
            "disabled:hover:bg-[#393939]/10",
            "disabled:active:scale-100",

            "dark:border-[#63bd3d]/35",
            "dark:bg-[#57af33]",
            "dark:text-[#0c0f0c]",
            "dark:shadow-[0_8px_24px_rgba(87,175,51,0.24)]",

            "dark:hover:bg-[#63bd3d]",

            "dark:focus-visible:ring-[#63bd3d]",
            "dark:focus-visible:ring-offset-[#141814]",

            "dark:disabled:border-white/8",
            "dark:disabled:bg-white/8",
            "dark:disabled:text-[#777e77]",
            "dark:disabled:hover:bg-white/8",

            "motion-reduce:transform-none",
            "motion-reduce:transition-none",
          )}
        >
          {isLoading ? (
            <LoaderCircle
              aria-hidden="true"
              className={cn(
                "size-5 animate-spin",
                "motion-reduce:animate-none",
              )}
              strokeWidth={2}
            />
          ) : (
            <SendHorizontal
              aria-hidden="true"
              className="size-5"
              strokeWidth={2}
            />
          )}
        </button>
      </div>

      {showCharacterCount ? (
        <div
          id={characterCountId}
          aria-live="polite"
          className={cn(
            "flex justify-end px-3 pt-1 pb-0.5",
            "text-[10px] leading-none font-medium",

            value.length >= maxLength
              ? [
                  "text-[#b53232]",
                  "dark:text-[#ff8181]",
                ]
              : [
                  "text-[#858b85]",
                  "dark:text-[#858c85]",
                ],
          )}
        >
          <span>
            {value.length}/{maxLength}
          </span>
        </div>
      ) : null}
    </form>
  );
}