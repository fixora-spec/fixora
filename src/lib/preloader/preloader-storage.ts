import {
  PRELOADER_CONFIG,
} from "@/config/preloader.config";

import type {
  PreloaderStorageState,
  PreloaderVisibilityStrategy,
} from "@/types/preloader";

function isBrowserEnvironment(): boolean {
  return (
    typeof window !==
    "undefined"
  );
}

function isRecord(
  value: unknown,
): value is Record<
  string,
  unknown
> {
  return (
    typeof value ===
      "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isPreloaderStorageState(
  value: unknown,
): value is PreloaderStorageState {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.version ===
      "number" &&
    Number.isFinite(
      value.version,
    ) &&
    typeof value.completed ===
      "boolean" &&
    typeof value.completedAt ===
      "number" &&
    Number.isFinite(
      value.completedAt,
    )
  );
}

function getStorageForStrategy(
  strategy:
    PreloaderVisibilityStrategy,
): Storage | null {
  if (!isBrowserEnvironment()) {
    return null;
  }

  try {
    if (
      strategy ===
      "session"
    ) {
      return window.sessionStorage;
    }

    if (
      strategy ===
      "first-visit"
    ) {
      return window.localStorage;
    }

    return null;
  } catch {
    return null;
  }
}

function createCompletedState():
  PreloaderStorageState {
  return {
    version:
      PRELOADER_CONFIG
        .storage.version,

    completed: true,
    completedAt: Date.now(),
  };
}

export function readPreloaderStorageState(
  strategy:
    PreloaderVisibilityStrategy =
      PRELOADER_CONFIG
        .storage.strategy,
): PreloaderStorageState | null {
  if (
    strategy ===
    "always"
  ) {
    return null;
  }

  const storage =
    getStorageForStrategy(
      strategy,
    );

  if (!storage) {
    return null;
  }

  try {
    const storedValue =
      storage.getItem(
        PRELOADER_CONFIG
          .storage.storageKey,
      );

    if (!storedValue) {
      return null;
    }

    const parsedValue: unknown =
      JSON.parse(storedValue);

    if (
      !isPreloaderStorageState(
        parsedValue,
      )
    ) {
      return null;
    }

    if (
      parsedValue.version !==
      PRELOADER_CONFIG
        .storage.version
    ) {
      return null;
    }

    return parsedValue;
  } catch {
    return null;
  }
}

export function shouldShowPreloader(
  strategy:
    PreloaderVisibilityStrategy =
      PRELOADER_CONFIG
        .storage.strategy,
): boolean {
  if (
    strategy ===
    "always"
  ) {
    return true;
  }

  const storedState =
    readPreloaderStorageState(
      strategy,
    );

  if (!storedState) {
    return true;
  }

  return !storedState.completed;
}

export function markPreloaderCompleted(
  strategy:
    PreloaderVisibilityStrategy =
      PRELOADER_CONFIG
        .storage.strategy,
): void {
  if (
    strategy ===
    "always"
  ) {
    return;
  }

  const storage =
    getStorageForStrategy(
      strategy,
    );

  if (!storage) {
    return;
  }

  try {
    storage.setItem(
      PRELOADER_CONFIG
        .storage.storageKey,

      JSON.stringify(
        createCompletedState(),
      ),
    );
  } catch {
    /*
     * El preloader continúa funcionando
     * aunque el almacenamiento del
     * navegador esté deshabilitado.
     */
  }
}

export function clearPreloaderStorage(
  strategy?:
    PreloaderVisibilityStrategy,
): void {
  if (!isBrowserEnvironment()) {
    return;
  }

  const key =
    PRELOADER_CONFIG
      .storage.storageKey;

  try {
    if (
      strategy ===
      "session"
    ) {
      window.sessionStorage.removeItem(
        key,
      );

      return;
    }

    if (
      strategy ===
      "first-visit"
    ) {
      window.localStorage.removeItem(
        key,
      );

      return;
    }

    /*
     * Si no se proporciona una estrategia,
     * limpia ambos almacenamientos.
     */
    window.sessionStorage.removeItem(
      key,
    );

    window.localStorage.removeItem(
      key,
    );
  } catch {
    // No se requiere otra acción.
  }
}

export function hasCompletedPreloader(
  strategy:
    PreloaderVisibilityStrategy =
      PRELOADER_CONFIG
        .storage.strategy,
): boolean {
  if (
    strategy ===
    "always"
  ) {
    return false;
  }

  const storedState =
    readPreloaderStorageState(
      strategy,
    );

  return (
    storedState?.completed ===
    true
  );
}

export function getPreloaderCompletedAt(
  strategy:
    PreloaderVisibilityStrategy =
      PRELOADER_CONFIG
        .storage.strategy,
): number | null {
  const storedState =
    readPreloaderStorageState(
      strategy,
    );

  return (
    storedState?.completedAt ??
    null
  );
}