"use client";

import { useSyncExternalStore } from "react";

const subscribe = (): (() => void) => {
  return () => undefined;
};

const getClientSnapshot = (): boolean => true;

const getServerSnapshot = (): boolean => false;

export function useMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );
}