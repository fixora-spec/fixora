"use client";

import { useCallback, useMemo, useState } from "react";

import { QUICK_ACTIONS } from "@/config/quick-actions.config";
import { getVisibleActions } from "@/utils/get-visible-actions";

import type {
  QuickAction,
  QuickActionsDirection,
} from "@/types/quick-action";

export type UseQuickActionsCarouselOptions = {
  initialIndex?: number;
  step?: number;
};

export type UseQuickActionsCarouselReturn = {
  startIndex: number;
  visibleActions: QuickAction[];
  showPrevious: () => void;
  showNext: () => void;
  move: (direction: QuickActionsDirection) => void;
  goTo: (index: number) => void;
  reset: () => void;
};

function normalizeIndex(index: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return ((index % total) + total) % total;
}

export function useQuickActionsCarousel({
  initialIndex = 0,
  step = 1,
}: UseQuickActionsCarouselOptions = {}): UseQuickActionsCarouselReturn {
  const totalActions = QUICK_ACTIONS.length;
  const safeStep = Math.max(1, Math.trunc(step));

  const [startIndex, setStartIndex] = useState(() =>
    normalizeIndex(initialIndex, totalActions),
  );

  const visibleActions = useMemo(
    () => getVisibleActions(startIndex),
    [startIndex],
  );

  const move = useCallback(
    (direction: QuickActionsDirection): void => {
      const offset = direction === "next" ? safeStep : -safeStep;

      setStartIndex((currentIndex) =>
        normalizeIndex(currentIndex + offset, totalActions),
      );
    },
    [safeStep, totalActions],
  );

  const showPrevious = useCallback((): void => {
    move("previous");
  }, [move]);

  const showNext = useCallback((): void => {
    move("next");
  }, [move]);

  const goTo = useCallback(
    (index: number): void => {
      setStartIndex(normalizeIndex(index, totalActions));
    },
    [totalActions],
  );

  const reset = useCallback((): void => {
    setStartIndex(normalizeIndex(initialIndex, totalActions));
  }, [initialIndex, totalActions]);

  return {
    startIndex,
    visibleActions,
    showPrevious,
    showNext,
    move,
    goTo,
    reset,
  };
}