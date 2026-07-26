import {
  Accessibility,
  CircleHelp,
  Globe2,
  Info,
  Settings,
  SunMoon,
} from "lucide-react";

export const QUICK_ACTIONS = [
  {
    id: "appearance",
    labelKey: "appearance",
    icon: SunMoon,
    behavior: "theme",
    isAvailable: true,
  },
  {
    id: "language",
    labelKey: "language",
    icon: Globe2,
    behavior: "language",
    isAvailable: true,
  },
  {
    id: "settings",
    labelKey: "settings",
    icon: Settings,
    behavior: "placeholder",
    isAvailable: false,
  },
  {
    id: "accessibility",
    labelKey: "accessibility",
    icon: Accessibility,
    behavior: "placeholder",
    isAvailable: false,
  },
  {
    id: "help",
    labelKey: "help",
    icon: CircleHelp,
    behavior: "placeholder",
    isAvailable: false,
  },
  {
    id: "information",
    labelKey: "information",
    icon: Info,
    behavior: "placeholder",
    isAvailable: false,
  },
] as const;

export const QUICK_ACTIONS_LAYOUT = {
  totalItems: QUICK_ACTIONS.length,
  visibleItems: 4,

  triggerSize: 58,
  itemSize: 46,

  mobileOrbitRadius: 88,
  desktopOrbitRadius: 104,

  mobileEdgeOffset: 18,
  desktopEdgeOffset: 28,

  wheelThreshold: 24,
  swipeThreshold: 42,

  openDuration: 520,
  closeDuration: 400,
  itemDelay: 28,
} as const;

export const QUICK_ACTIONS_ANGLES = [
  -82,
  -57,
  -32,
  -7,
] as const;