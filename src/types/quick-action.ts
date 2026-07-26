import type { LucideIcon } from "lucide-react";

export type QuickActionId =
  | "appearance"
  | "language"
  | "settings"
  | "assistant"
  | "help"
  | "information";

export type QuickActionLabelKey =
  | "appearance"
  | "language"
  | "settings"
  | "assistant"
  | "help"
  | "information";

export type QuickActionBehavior =
  | "theme"
  | "language"
  | "assistant"
  | "placeholder";

export type QuickAction = {
  id: QuickActionId;
  labelKey: QuickActionLabelKey;
  icon: LucideIcon;
  behavior: QuickActionBehavior;
  isAvailable: boolean;
};

export type QuickActionPosition = {
  index: number;
  angle: number;
  x: number;
  y: number;
};

export type QuickActionsState = {
  isOpen: boolean;
  startIndex: number;
  visibleActionIds: QuickActionId[];
};

export type QuickActionItemProps = {
  action: QuickAction;
  position: QuickActionPosition;
  isOpen: boolean;
  isActive?: boolean;
  iconOverride?: LucideIcon;
  badge?: string;
  labelOverride?: string;
  onSelect: (action: QuickAction) => void;
  className?: string;
};

export type QuickActionsDirection =
  | "previous"
  | "next";