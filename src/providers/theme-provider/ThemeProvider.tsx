"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

import type {
  AppTheme,
  ResolvedAppTheme,
} from "@/types/theme";

import type {
  ThemeContextValue,
  ThemeProviderProps,
} from "./ThemeProvider.types";

const STORAGE_KEY = "fixora-theme";
const THEME_CHANGE_EVENT = "fixora-theme-change";

const ThemeContext =
  createContext<ThemeContextValue | null>(null);

function isAppTheme(value: string | null): value is AppTheme {
  return (
    value === "light" ||
    value === "dark" ||
    value === "system"
  );
}

function getStoredTheme(): AppTheme {
  if (typeof window === "undefined") {
    return "system";
  }

  const storedTheme = window.localStorage.getItem(STORAGE_KEY);

  return isAppTheme(storedTheme)
    ? storedTheme
    : "system";
}

function resolveTheme(theme: AppTheme): ResolvedAppTheme {
  if (theme !== "system") {
    return theme;
  }

  if (typeof window === "undefined") {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)")
    .matches
    ? "dark"
    : "light";
}

function getClientSnapshot(): string {
  const theme = getStoredTheme();
  const resolvedTheme = resolveTheme(theme);

  return `${theme}:${resolvedTheme}`;
}

function getServerSnapshot(): string {
  return "system:light";
}

function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const mediaQuery = window.matchMedia(
    "(prefers-color-scheme: dark)",
  );

  const handleChange = (): void => {
    onStoreChange();
  };

  window.addEventListener("storage", handleChange);
  window.addEventListener(
    THEME_CHANGE_EVENT,
    handleChange,
  );
  mediaQuery.addEventListener("change", handleChange);

  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener(
      THEME_CHANGE_EVENT,
      handleChange,
    );
    mediaQuery.removeEventListener("change", handleChange);
  };
}

export function ThemeProvider({
  children,
}: ThemeProviderProps) {
  const snapshot = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );

  const [themeValue, resolvedThemeValue] =
    snapshot.split(":");

  const theme = themeValue as AppTheme;
  const resolvedTheme =
    resolvedThemeValue as ResolvedAppTheme;

  useEffect(() => {
    const root = document.documentElement;

    root.classList.toggle(
      "dark",
      resolvedTheme === "dark",
    );

    root.classList.toggle(
      "light",
      resolvedTheme === "light",
    );

    root.dataset.theme = resolvedTheme;
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  const setTheme = useCallback(
    (nextTheme: AppTheme): void => {
      window.localStorage.setItem(
        STORAGE_KEY,
        nextTheme,
      );

      window.dispatchEvent(
        new Event(THEME_CHANGE_EVENT),
      );
    },
    [],
  );

  const toggleTheme = useCallback((): void => {
    setTheme(
      resolvedTheme === "dark"
        ? "light"
        : "dark",
    );
  }, [resolvedTheme, setTheme]);

  const contextValue =
    useMemo<ThemeContextValue>(
      () => ({
        theme,
        resolvedTheme,
        setTheme,
        toggleTheme,
      }),
      [
        resolvedTheme,
        setTheme,
        theme,
        toggleTheme,
      ],
    );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error(
      "useTheme debe utilizarse dentro de ThemeProvider.",
    );
  }

  return context;
}