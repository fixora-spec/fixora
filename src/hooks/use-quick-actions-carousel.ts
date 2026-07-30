"use client";

import {
  useCallback,
  useMemo,
  useState,
} from "react";

import {
  QUICK_ACTIONS,
  QUICK_ACTIONS_LAYOUT,
} from "@/config/quick-actions.config";

import type {
  QuickAction,
  QuickActionsDirection,
} from "@/types/quick-action";

export type UseQuickActionsCarouselOptions = {
  actions?: readonly QuickAction[];
  initialIndex?: number;
  step?: number;
  visibleItems?: number;
};

export type UseQuickActionsCarouselReturn = {
  startIndex: number;
  visibleActions: QuickAction[];
  showPrevious: () => void;
  showNext: () => void;
  move: (
    direction: QuickActionsDirection,
  ) => void;
  goTo: (
    index: number,
  ) => void;
  reset: () => void;
};

function normalizeIndex(
  index: number,
  total: number,
): number {
  if (
    total <= 0
  ) {
    return 0;
  }

  return (
    (index % total) + total
  ) % total;
}

function normalizePositiveInteger(
  value: number,
  fallback: number,
): number {
  if (
    !Number.isFinite(
      value,
    )
    || value <= 0
  ) {
    return fallback;
  }

  return Math.max(
    1,
    Math.trunc(
      value,
    ),
  );
}

export function useQuickActionsCarousel({
  actions = QUICK_ACTIONS,
  initialIndex = 0,
  step = 1,
  visibleItems =
    QUICK_ACTIONS_LAYOUT.visibleItems,
}: UseQuickActionsCarouselOptions = {}): UseQuickActionsCarouselReturn {
  const totalActions =
    actions.length;

  const safeStep =
    normalizePositiveInteger(
      step,
      1,
    );

  const safeVisibleItems =
    totalActions === 0
      ? 0
      : Math.min(
          totalActions,
          normalizePositiveInteger(
            visibleItems,
            QUICK_ACTIONS_LAYOUT.visibleItems,
          ),
        );

  const [
    storedStartIndex,
    setStoredStartIndex,
  ] = useState(
    () =>
      normalizeIndex(
        initialIndex,
        totalActions,
      ),
  );

  const startIndex =
    normalizeIndex(
      storedStartIndex,
      totalActions,
    );

  const visibleActions =
    useMemo<QuickAction[]>(
      () => {
        if (
          totalActions === 0
          || safeVisibleItems === 0
        ) {
          return [];
        }

        const result:
          QuickAction[] = [];

        for (
          let offset = 0;
          offset < safeVisibleItems;
          offset += 1
        ) {
          const actionIndex =
            normalizeIndex(
              startIndex + offset,
              totalActions,
            );

          const action =
            actions[
              actionIndex
            ];

          if (
            action
          ) {
            result.push(
              action,
            );
          }
        }

        return result;
      },
      [
        actions,
        safeVisibleItems,
        startIndex,
        totalActions,
      ],
    );

  const move =
    useCallback(
      (
        direction:
          QuickActionsDirection,
      ): void => {
        if (
          totalActions === 0
        ) {
          return;
        }

        const offset =
          direction === "next"
            ? safeStep
            : -safeStep;

        setStoredStartIndex(
          (
            currentIndex,
          ) =>
            normalizeIndex(
              currentIndex + offset,
              totalActions,
            ),
        );
      },
      [
        safeStep,
        totalActions,
      ],
    );

  const showPrevious =
    useCallback(
      (): void => {
        move(
          "previous",
        );
      },
      [
        move,
      ],
    );

  const showNext =
    useCallback(
      (): void => {
        move(
          "next",
        );
      },
      [
        move,
      ],
    );

  const goTo =
    useCallback(
      (
        index: number,
      ): void => {
        setStoredStartIndex(
          normalizeIndex(
            index,
            totalActions,
          ),
        );
      },
      [
        totalActions,
      ],
    );

  const reset =
    useCallback(
      (): void => {
        setStoredStartIndex(
          normalizeIndex(
            initialIndex,
            totalActions,
          ),
        );
      },
      [
        initialIndex,
        totalActions,
      ],
    );

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