import { Bot } from "lucide-react";

import { cn } from "@/utils/cn";

import type {
  AssistantAvatarProps,
  AssistantAvatarSize,
} from "./AssistantAvatar.types";

const AVATAR_SIZE_CLASSES: Record<
  AssistantAvatarSize,
  string
> = {
  sm: "size-8",
  md: "size-10",
  lg: "size-12",
};

const ICON_SIZE_CLASSES: Record<
  AssistantAvatarSize,
  string
> = {
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
};

const STATUS_SIZE_CLASSES: Record<
  AssistantAvatarSize,
  string
> = {
  sm: "size-2",
  md: "size-2.5",
  lg: "size-3",
};

export function AssistantAvatar({
  size = "md",
  isActive = true,
  decorative = false,
  label = "Asistente Fixora",
  className,
  ...divProps
}: AssistantAvatarProps) {
  return (
    <div
      {...divProps}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
      data-active={isActive ? "true" : "false"}
      className={cn(
        "relative shrink-0",
        "flex items-center justify-center",
        "overflow-visible rounded-full",

        "border border-[#393939]/15",
        "bg-[#fdfefe]",
        "text-[#393939]",

        "shadow-[0_8px_24px_rgba(57,57,57,0.12)]",

        "transition-[background-color,border-color,color,box-shadow]",
        "duration-300 ease-out",

        "dark:border-white/12",
        "dark:bg-[#141814]",
        "dark:text-[#f1f3f1]",
        "dark:shadow-[0_8px_26px_rgba(0,0,0,0.34)]",

        isActive && [
          "border-[#4ead35]/45",
          "bg-[#4ead35]",
          "text-[#0c0f0c]",
          "shadow-[0_8px_26px_rgba(78,173,53,0.28)]",

          "dark:border-[#63bd3d]/55",
          "dark:bg-[#57af33]",
          "dark:text-[#0c0f0c]",
          "dark:shadow-[0_8px_28px_rgba(87,175,51,0.30)]",
        ],

        AVATAR_SIZE_CLASSES[size],
        className,
      )}
    >
      <Bot
        aria-hidden="true"
        strokeWidth={1.9}
        className={cn(
          "shrink-0",
          ICON_SIZE_CLASSES[size],
        )}
      />

      <span
        aria-hidden="true"
        className={cn(
          "absolute right-0 bottom-0",
          "rounded-full",
          "border-2 border-[#fdfefe]",
          "dark:border-[#141814]",

          isActive
            ? [
                "bg-[#318b22]",
                "dark:bg-[#6ac447]",
              ]
            : [
                "bg-[#9ca39c]",
                "dark:bg-[#717871]",
              ],

          STATUS_SIZE_CLASSES[size],
        )}
      />
    </div>
  );
}