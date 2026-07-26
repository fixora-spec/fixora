import type { ComponentPropsWithRef } from "react";
import type { LucideIcon } from "lucide-react";

export type IconButtonVariant =
  | "default"
  | "brand"
  | "ghost"
  | "outline";

export type IconButtonSize = "sm" | "md" | "lg";

export type IconButtonProps = Omit<
  ComponentPropsWithRef<"button">,
  "children" | "aria-label"
> & {
  icon: LucideIcon;
  label: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  isActive?: boolean;
  isLoading?: boolean;
  iconSize?: number;
  iconStrokeWidth?: number;
};