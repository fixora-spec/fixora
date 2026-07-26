import type { ComponentPropsWithoutRef } from "react";

export type AssistantAvatarSize =
  | "sm"
  | "md"
  | "lg";

export type AssistantAvatarProps = Omit<
  ComponentPropsWithoutRef<"div">,
  "children"
> & {
  size?: AssistantAvatarSize;
  isActive?: boolean;
  decorative?: boolean;
  label?: string;
};