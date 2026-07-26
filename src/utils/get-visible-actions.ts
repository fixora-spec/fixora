import {
  QUICK_ACTIONS,
  QUICK_ACTIONS_LAYOUT,
} from "@/config/quick-actions.config";

import type { QuickAction } from "@/types/quick-action";

function normalizeIndex(index: number, total: number): number {
  return ((index % total) + total) % total;
}

export function getVisibleActions(
  startIndex: number,
  visibleItems = QUICK_ACTIONS_LAYOUT.visibleItems,
): QuickAction[] {
  const actions: readonly QuickAction[] = QUICK_ACTIONS;
  const totalActions = actions.length;

  if (totalActions === 0 || visibleItems <= 0) {
    return [];
  }

  const normalizedStartIndex = normalizeIndex(startIndex, totalActions);
  const safeVisibleItems = Math.min(visibleItems, totalActions);

  return Array.from({ length: safeVisibleItems }, (_, offset) => {
    const actionIndex = (normalizedStartIndex + offset) % totalActions;

    return actions[actionIndex];
  });
}