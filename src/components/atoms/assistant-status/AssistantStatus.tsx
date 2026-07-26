import { cn } from "@/utils/cn";

import type {
  AssistantStatusProps,
  AssistantStatusSize,
  AssistantStatusVariant,
} from "./AssistantStatus.types";

const DEFAULT_STATUS_LABELS: Record<
  AssistantStatusVariant,
  string
> = {
  available: "Disponible",
  thinking: "Escribiendo...",
  offline: "No disponible",
  error: "Error de conexión",
};

const CONTAINER_SIZE_CLASSES: Record<
  AssistantStatusSize,
  string
> = {
  sm: "gap-1.5 text-[11px]",
  md: "gap-2 text-xs",
};

const INDICATOR_SIZE_CLASSES: Record<
  AssistantStatusSize,
  string
> = {
  sm: "size-1.5",
  md: "size-2",
};

const STATUS_INDICATOR_CLASSES: Record<
  AssistantStatusVariant,
  string
> = {
  available: [
    "bg-[#4ead35]",
    "shadow-[0_0_0_3px_rgba(78,173,53,0.14)]",
    "dark:bg-[#6ac447]",
    "dark:shadow-[0_0_0_3px_rgba(106,196,71,0.14)]",
  ].join(" "),

  thinking: [
    "animate-pulse",
    "bg-[#d49a25]",
    "shadow-[0_0_0_3px_rgba(212,154,37,0.14)]",
    "dark:bg-[#e9b84c]",
    "dark:shadow-[0_0_0_3px_rgba(233,184,76,0.14)]",
  ].join(" "),

  offline: [
    "bg-[#8a918a]",
    "shadow-[0_0_0_3px_rgba(138,145,138,0.12)]",
    "dark:bg-[#767d76]",
    "dark:shadow-[0_0_0_3px_rgba(118,125,118,0.14)]",
  ].join(" "),

  error: [
    "bg-[#cf3f3f]",
    "shadow-[0_0_0_3px_rgba(207,63,63,0.13)]",
    "dark:bg-[#ef6262]",
    "dark:shadow-[0_0_0_3px_rgba(239,98,98,0.14)]",
  ].join(" "),
};

const STATUS_TEXT_CLASSES: Record<
  AssistantStatusVariant,
  string
> = {
  available: [
    "text-[#318b22]",
    "dark:text-[#82d363]",
  ].join(" "),

  thinking: [
    "text-[#9a6915]",
    "dark:text-[#e9b84c]",
  ].join(" "),

  offline: [
    "text-[#707670]",
    "dark:text-[#a9afa9]",
  ].join(" "),

  error: [
    "text-[#b53232]",
    "dark:text-[#ff8181]",
  ].join(" "),
};

export function AssistantStatus({
  status = "available",
  size = "md",
  label,
  showIndicator = true,
  className,
  ...divProps
}: AssistantStatusProps) {
  const resolvedLabel =
    label ?? DEFAULT_STATUS_LABELS[status];

  return (
    <div
      {...divProps}
      role="status"
      aria-live={
        status === "thinking" ? "polite" : "off"
      }
      data-status={status}
      className={cn(
        "inline-flex min-w-0 items-center",
        "font-medium leading-none",
        "transition-colors duration-300",
        CONTAINER_SIZE_CLASSES[size],
        STATUS_TEXT_CLASSES[status],
        className,
      )}
    >
      {showIndicator ? (
        <span
          aria-hidden="true"
          className={cn(
            "shrink-0 rounded-full",
            "motion-reduce:animate-none",
            INDICATOR_SIZE_CLASSES[size],
            STATUS_INDICATOR_CLASSES[status],
          )}
        />
      ) : null}

      <span className="truncate">
        {resolvedLabel}
      </span>
    </div>
  );
}