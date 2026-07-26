"use client";

import { useEffect } from "react";

type BodyStyleSnapshot = {
  overflow: string;
  position: string;
  top: string;
  left: string;
  right: string;
  width: string;
  paddingRight: string;
};

let activeLocks = 0;
let previousScrollY = 0;
let previousBodyStyles: BodyStyleSnapshot | null = null;

function lockBodyScroll(): void {
  if (activeLocks === 0) {
    const bodyStyle = document.body.style;
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;

    const computedPaddingRight =
      Number.parseFloat(
        window.getComputedStyle(document.body).paddingRight,
      ) || 0;

    previousScrollY = window.scrollY;

    previousBodyStyles = {
      overflow: bodyStyle.overflow,
      position: bodyStyle.position,
      top: bodyStyle.top,
      left: bodyStyle.left,
      right: bodyStyle.right,
      width: bodyStyle.width,
      paddingRight: bodyStyle.paddingRight,
    };

    bodyStyle.overflow = "hidden";
    bodyStyle.position = "fixed";
    bodyStyle.top = `-${previousScrollY}px`;
    bodyStyle.left = "0";
    bodyStyle.right = "0";
    bodyStyle.width = "100%";

    if (scrollbarWidth > 0) {
      bodyStyle.paddingRight = `${
        computedPaddingRight + scrollbarWidth
      }px`;
    }
  }

  activeLocks += 1;
}

function unlockBodyScroll(): void {
  if (activeLocks === 0) {
    return;
  }

  activeLocks -= 1;

  if (activeLocks > 0 || !previousBodyStyles) {
    return;
  }

  const bodyStyle = document.body.style;
  const savedStyles = previousBodyStyles;
  const savedScrollY = previousScrollY;

  bodyStyle.overflow = savedStyles.overflow;
  bodyStyle.position = savedStyles.position;
  bodyStyle.top = savedStyles.top;
  bodyStyle.left = savedStyles.left;
  bodyStyle.right = savedStyles.right;
  bodyStyle.width = savedStyles.width;
  bodyStyle.paddingRight = savedStyles.paddingRight;

  previousBodyStyles = null;
  previousScrollY = 0;

  window.scrollTo(0, savedScrollY);
}

export function useLockBodyScroll(locked = true): void {
  useEffect(() => {
    if (!locked) {
      return;
    }

    lockBodyScroll();

    return () => {
      unlockBodyScroll();
    };
  }, [locked]);
}