"use client";

import {
  MessageCircleQuestion,
  MoveUpRight,
} from "lucide-react";

import { cn } from "@/utils/cn";

import type {
  AssistantSuggestionProps,
} from "./AssistantSuggestion.types";

export function AssistantSuggestion({
  suggestion,
  onSuggestionSelect,
  compact = false,
  showIcon = true,
  type = "button",
  disabled = false,
  className,
  ...buttonProps
}: AssistantSuggestionProps) {
  const handleClick = (): void => {
    if (disabled) {
      return;
    }

    void onSuggestionSelect(suggestion);
  };

  return (
    <button
      {...buttonProps}
      type={type}
      disabled={disabled}
      data-suggestion-id={suggestion.id}
      onClick={handleClick}
      className={cn(
        "group relative",
        "inline-flex min-w-0 items-center",
        "rounded-2xl",

        "border border-[#393939]/10",
        "bg-white/90",
        "text-left text-[#303530]",

        "shadow-[0_8px_24px_rgba(57,57,57,0.08)]",

        "transition-[background-color,border-color,color,box-shadow,transform]",
        "duration-200 ease-out",

        "hover:border-[#4ead35]/35",
        "hover:bg-[#4ead35]/[0.08]",
        "hover:text-[#318b22]",
        "hover:shadow-[0_10px_28px_rgba(78,173,53,0.12)]",

        "active:scale-[0.98]",

        "focus-visible:outline-none",
        "focus-visible:ring-2",
        "focus-visible:ring-[#4ead35]",
        "focus-visible:ring-offset-2",
        "focus-visible:ring-offset-[#fdfefe]",

        "disabled:cursor-not-allowed",
        "disabled:opacity-50",
        "disabled:hover:border-[#393939]/10",
        "disabled:hover:bg-white/90",
        "disabled:hover:text-[#303530]",
        "disabled:hover:shadow-[0_8px_24px_rgba(57,57,57,0.08)]",
        "disabled:active:scale-100",

        "dark:border-white/10",
        "dark:bg-[#171b17]/95",
        "dark:text-[#dfe4df]",
        "dark:shadow-[0_8px_26px_rgba(0,0,0,0.26)]",

        "dark:hover:border-[#63bd3d]/35",
        "dark:hover:bg-[#63bd3d]/10",
        "dark:hover:text-[#82d363]",
        "dark:hover:shadow-[0_10px_30px_rgba(87,175,51,0.12)]",

        "dark:focus-visible:ring-[#63bd3d]",
        "dark:focus-visible:ring-offset-[#0c0f0c]",

        "dark:disabled:hover:border-white/10",
        "dark:disabled:hover:bg-[#171b17]/95",
        "dark:disabled:hover:text-[#dfe4df]",
        "dark:disabled:hover:shadow-[0_8px_26px_rgba(0,0,0,0.26)]",

        compact
          ? [
              "gap-2",
              "px-3 py-2",
              "text-xs leading-5 font-medium",
            ]
          : [
              "gap-2.5",
              "px-3.5 py-3",
              "text-sm leading-5 font-medium",
            ],

        "motion-reduce:transform-none",
        "motion-reduce:transition-none",

        className,
      )}
    >
      {showIcon ? (
        <span
          aria-hidden="true"
          className={cn(
            "flex shrink-0",
            "items-center justify-center",
            "rounded-xl",

            "bg-[#4ead35]/12",
            "text-[#318b22]",

            "transition-[background-color,color,transform]",
            "duration-200 ease-out",

            "group-hover:scale-105",
            "group-hover:bg-[#4ead35]/18",

            "dark:bg-[#63bd3d]/12",
            "dark:text-[#82d363]",
            "dark:group-hover:bg-[#63bd3d]/18",

            compact
              ? "size-7"
              : "size-8",

            "motion-reduce:transform-none",
            "motion-reduce:transition-none",
          )}
        >
          <MessageCircleQuestion
            aria-hidden="true"
            className={cn(
              compact
                ? "size-3.5"
                : "size-4",
            )}
            strokeWidth={1.9}
          />
        </span>
      ) : null}

      <span className="min-w-0 flex-1">
        <span className="block truncate">
          {suggestion.label}
        </span>
      </span>

      <MoveUpRight
        aria-hidden="true"
        strokeWidth={1.9}
        className={cn(
          "shrink-0 opacity-55",

          "transition-[opacity,transform]",
          "duration-200 ease-out",

          "group-hover:translate-x-0.5",
          "group-hover:-translate-y-0.5",
          "group-hover:opacity-100",

          compact
            ? "size-3.5"
            : "size-4",

          "motion-reduce:transform-none",
          "motion-reduce:transition-none",
        )}
      />
    </button>
  );
}