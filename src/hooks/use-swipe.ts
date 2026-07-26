"use client";

import {
  useCallback,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type PointerEventHandler,
} from "react";

export type SwipeDirection = "left" | "right" | "up" | "down";

export type SwipeAxis = "horizontal" | "vertical" | "both";

export type UseSwipeOptions = {
  onSwipe: (direction: SwipeDirection) => void;
  enabled?: boolean;
  axis?: SwipeAxis;
  threshold?: number;
  maxDuration?: number;
};

export type SwipeHandlers = {
  onPointerDown: PointerEventHandler<HTMLElement>;
  onPointerUp: PointerEventHandler<HTMLElement>;
  onPointerCancel: PointerEventHandler<HTMLElement>;
};

type SwipeStartPoint = {
  pointerId: number;
  x: number;
  y: number;
  startedAt: number;
};

function releasePointerCapture(
  event: ReactPointerEvent<HTMLElement>,
): void {
  const element = event.currentTarget;

  if (element.hasPointerCapture(event.pointerId)) {
    element.releasePointerCapture(event.pointerId);
  }
}

export function useSwipe({
  onSwipe,
  enabled = true,
  axis = "both",
  threshold = 42,
  maxDuration = 600,
}: UseSwipeOptions): SwipeHandlers {
  const startPointRef = useRef<SwipeStartPoint | null>(null);

  const handlePointerDown = useCallback<
    PointerEventHandler<HTMLElement>
  >(
    (event) => {
      if (!enabled || !event.isPrimary) {
        return;
      }

      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      startPointRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        startedAt: performance.now(),
      };

      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [enabled],
  );

  const handlePointerUp = useCallback<
    PointerEventHandler<HTMLElement>
  >(
    (event) => {
      const startPoint = startPointRef.current;

      startPointRef.current = null;

      if (
        !enabled ||
        !startPoint ||
        startPoint.pointerId !== event.pointerId
      ) {
        releasePointerCapture(event);
        return;
      }

      const elapsedTime = performance.now() - startPoint.startedAt;
      const deltaX = event.clientX - startPoint.x;
      const deltaY = event.clientY - startPoint.y;
      const absoluteX = Math.abs(deltaX);
      const absoluteY = Math.abs(deltaY);

      releasePointerCapture(event);

      if (elapsedTime > maxDuration) {
        return;
      }

      if (axis === "horizontal") {
        if (absoluteX < threshold || absoluteX < absoluteY) {
          return;
        }

        onSwipe(deltaX < 0 ? "left" : "right");
        return;
      }

      if (axis === "vertical") {
        if (absoluteY < threshold || absoluteY < absoluteX) {
          return;
        }

        onSwipe(deltaY < 0 ? "up" : "down");
        return;
      }

      if (absoluteX < threshold && absoluteY < threshold) {
        return;
      }

      if (absoluteX >= absoluteY) {
        onSwipe(deltaX < 0 ? "left" : "right");
        return;
      }

      onSwipe(deltaY < 0 ? "up" : "down");
    },
    [axis, enabled, maxDuration, onSwipe, threshold],
  );

  const handlePointerCancel = useCallback<
    PointerEventHandler<HTMLElement>
  >((event) => {
    startPointRef.current = null;
    releasePointerCapture(event);
  }, []);

  return {
    onPointerDown: handlePointerDown,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerCancel,
  };
}