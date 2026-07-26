import type { ComponentPropsWithoutRef } from "react";

export type AssistantStatusVariant =
  | "available"
  | "thinking"
  | "offline"
  | "error";

export type AssistantStatusSize =
  | "sm"
  | "md";

export type AssistantStatusProps = Omit<
  ComponentPropsWithoutRef<"div">,
  "children"
> & {
  status?: AssistantStatusVariant;
  size?: AssistantStatusSize;
  label?: string;
  showIndicator?: boolean;
};