import {
  Bell,
  Bot,
  CircleHelp,
  Globe2,
  Info,
  LogOut,
  Settings,
  ShoppingCart,
  SunMoon,
  UserRound,
} from "lucide-react";

import type {
  QuickAction,
} from "@/types/quick-action";

export const PUBLIC_QUICK_ACTIONS = [
  {
    id:
      "appearance",

    labelKey:
      "appearance",

    icon:
      SunMoon,

    behavior:
      "theme",

    isAvailable:
      true,

    availability:
      "public",
  },

  {
    id:
      "language",

    labelKey:
      "language",

    icon:
      Globe2,

    behavior:
      "language",

    isAvailable:
      true,

    availability:
      "public",
  },

  {
    id:
      "settings",

    labelKey:
      "settings",

    icon:
      Settings,

    behavior:
      "placeholder",

    isAvailable:
      false,

    availability:
      "public",
  },

  {
    id:
      "assistant",

    labelKey:
      "assistant",

    icon:
      Bot,

    behavior:
      "assistant",

    isAvailable:
      true,

    availability:
      "public",
  },

  {
    id:
      "help",

    labelKey:
      "help",

    icon:
      CircleHelp,

    behavior:
      "placeholder",

    isAvailable:
      false,

    availability:
      "public",
  },

  {
    id:
      "information",

    labelKey:
      "information",

    icon:
      Info,

    behavior:
      "placeholder",

    isAvailable:
      false,

    availability:
      "public",
  },
] as const satisfies readonly QuickAction[];

export const ACCOUNT_QUICK_ACTIONS = [
  {
    id:
      "profile",

    labelKey:
      "profile",

    icon:
      UserRound,

    behavior:
      "placeholder",

    isAvailable:
      false,

    availability:
      "authenticated",
  },

  {
    id:
      "notifications",

    labelKey:
      "notifications",

    icon:
      Bell,

    behavior:
      "notifications",

    isAvailable:
      true,

    availability:
      "authenticated",
  },

  {
    id:
      "cart",

    labelKey:
      "cart",

    icon:
      ShoppingCart,

    behavior:
      "placeholder",

    isAvailable:
      false,

    availability:
      "authenticated",
  },

  {
    id:
      "logout",

    labelKey:
      "logout",

    icon:
      LogOut,

    behavior:
      "logout",

    isAvailable:
      true,

    availability:
      "authenticated",
  },
] as const satisfies readonly QuickAction[];

/*
 * Se conserva esta exportación para que el carrusel
 * actual continúe funcionando sin mostrar acciones
 * privadas antes de integrar QuickActionsMenu.
 */
export const QUICK_ACTIONS =
  PUBLIC_QUICK_ACTIONS;

export const QUICK_ACTIONS_LAYOUT = {
  totalItems:
    PUBLIC_QUICK_ACTIONS.length
    + ACCOUNT_QUICK_ACTIONS.length,

  visibleItems:
    4,

  triggerSize:
    58,

  itemSize:
    46,

  mobileOrbitRadius:
    88,

  desktopOrbitRadius:
    104,

  mobileEdgeOffset:
    18,

  desktopEdgeOffset:
    28,

  wheelThreshold:
    24,

  swipeThreshold:
    42,

  openDuration:
    520,

  closeDuration:
    400,

  itemDelay:
    28,
} as const;

export const QUICK_ACTIONS_ANGLES = [
  -82,
  -57,
  -32,
  -7,
] as const;