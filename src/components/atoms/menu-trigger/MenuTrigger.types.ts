import type { ComponentPropsWithRef } from "react";
import type { LucideIcon } from "lucide-react";

export type MenuTriggerVariant =
  | "navigation"
  | "quick-actions";

export type MenuTriggerSize = "md" | "lg";

export type MenuTriggerProps = Omit<
  ComponentPropsWithRef<"button">,
  "children" | "aria-label" | "aria-expanded" | "aria-controls"
> & {
  isOpen: boolean;
  openLabel: string;
  closeLabel: string;
  controlsId: string;
  openIcon: LucideIcon;
  closeIcon: LucideIcon;
  variant?: MenuTriggerVariant;
  size?: MenuTriggerSize;
  iconSize?: number;
  iconStrokeWidth?: number;
};