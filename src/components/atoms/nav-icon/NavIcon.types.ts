import type { ComponentPropsWithoutRef } from "react";
import type { LucideIcon } from "lucide-react";

export type NavIconSize = "sm" | "md" | "lg";

export type NavIconProps = Omit<
  ComponentPropsWithoutRef<"span">,
  "children"
> & {
  icon: LucideIcon;
  size?: NavIconSize;
  isActive?: boolean;
  iconSize?: number;
  strokeWidth?: number;
  iconClassName?: string;
};