"use client";

import { useEffect, type RefObject } from "react";

export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onClickOutside: (event: PointerEvent) => void,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handlePointerDown = (event: PointerEvent): void => {
      const element = ref.current;
      const target = event.target;

      if (!element || !(target instanceof Node)) {
        return;
      }

      if (element.contains(target)) {
        return;
      }

      onClickOutside(event);
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [enabled, onClickOutside, ref]);
}