"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
} from "react";

import {
  getAuthSession,
  isAuthApiClientError,
  signOut as requestSignOut,
  type AuthSessionResponseData,
} from "@/services/auth";

import type {
  AuthProviderContextValue,
  AuthProviderProps,
  AuthenticationPanelState,
  AuthenticationPanelView,
  AuthenticationResultInput,
  AuthenticationSessionState,
  OpenAuthenticationOptions,
  RefreshAuthenticationOptions,
} from "./AuthProvider.types";

const INITIAL_SESSION_STATE: AuthenticationSessionState = {
  status: "LOADING",
  account: null,
  expiresAt: null,
  errorMessage: null,
};

const INITIAL_PANEL_STATE: AuthenticationPanelState = {
  open: false,
  view: "USER_SIGN_IN",
};

const MAXIMUM_BROWSER_TIMEOUT_MILLISECONDS = 2_147_000_000;
const SESSION_EXPIRATION_REFRESH_DELAY_MILLISECONDS = 250;

const AuthProviderContext = createContext<
  AuthProviderContextValue | undefined
>(undefined);

/*
 * Conserva únicamente el estado público de la sesión durante cambios de
 * idioma y remontajes del layout. Nunca se almacena el token HttpOnly ni una
 * contraseña en JavaScript.
 */
let clientSessionStateCache: AuthenticationSessionState | null = null;

/*
 * Conserva la vista abierta durante la navegación localizada. No contiene
 * credenciales ni secretos.
 */
let clientPanelStateCache: AuthenticationPanelState | null = null;

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error
    && error.name === "AbortError"
  );
}

function getAuthenticationErrorMessage(error: unknown): string {
  if (isAuthApiClientError(error)) {
    return error.message;
  }

  return "No se pudo comprobar la sesión de autenticación.";
}

function getExpirationTime(value: string | null): number | null {
  if (value === null) {
    return null;
  }

  const expirationTime = Date.parse(value);

  return Number.isFinite(expirationTime)
    ? expirationTime
    : null;
}

export function AuthProvider({
  children,
}: AuthProviderProps) {
  const [sessionState, setSessionState] = useState<AuthenticationSessionState>(
    () => (
      typeof window !== "undefined" && clientSessionStateCache
        ? clientSessionStateCache
        : INITIAL_SESSION_STATE
    ),
  );

  const [panelState, setPanelState] = useState<AuthenticationPanelState>(
    () => (
      typeof window !== "undefined" && clientPanelStateCache
        ? clientPanelStateCache
        : INITIAL_PANEL_STATE
    ),
  );

  const mountedReference = useRef(false);
  const requestSequenceReference = useRef(0);
  const requestAbortControllerReference = useRef<AbortController | null>(null);
  const signOutPromiseReference = useRef<Promise<boolean> | null>(null);

  const updateSessionState = useCallback(
    (action: SetStateAction<AuthenticationSessionState>): void => {
      setSessionState((currentState) => {
        const nextState = typeof action === "function"
          ? action(currentState)
          : action;

        clientSessionStateCache = nextState;

        return nextState;
      });
    },
    [],
  );

  const updatePanelState = useCallback(
    (action: SetStateAction<AuthenticationPanelState>): void => {
      setPanelState((currentState) => {
        const nextState = typeof action === "function"
          ? action(currentState)
          : action;

        clientPanelStateCache = nextState;

        return nextState;
      });
    },
    [],
  );

  const invalidatePendingSessionRequest = useCallback((): void => {
    requestSequenceReference.current += 1;
    requestAbortControllerReference.current?.abort();
    requestAbortControllerReference.current = null;
  }, []);

  const commitSessionResponse = useCallback(
    (response: AuthSessionResponseData): void => {
      if (response.authenticated) {
        updateSessionState({
          status: "AUTHENTICATED",
          account: response.account,
          expiresAt: response.expiresAt,
          errorMessage: null,
        });

        updatePanelState((currentPanelState) => ({
          ...currentPanelState,
          open: false,
        }));

        return;
      }

      updateSessionState({
        status: "UNAUTHENTICATED",
        account: null,
        expiresAt: null,
        errorMessage: null,
      });
    },
    [
      updatePanelState,
      updateSessionState,
    ],
  );

  const applySessionResponse = useCallback(
    (response: AuthSessionResponseData): void => {
      invalidatePendingSessionRequest();
      commitSessionResponse(response);
    },
    [
      commitSessionResponse,
      invalidatePendingSessionRequest,
    ],
  );

  const applyAuthenticatedSession = useCallback(
    (input: AuthenticationResultInput): void => {
      invalidatePendingSessionRequest();

      const expirationTime = getExpirationTime(input.expiresAt);

      if (expirationTime === null || expirationTime <= Date.now()) {
        updateSessionState({
          status: "ERROR",
          account: null,
          expiresAt: null,
          errorMessage: "La sesión de autenticación recibida no es válida.",
        });

        return;
      }

      updateSessionState({
        status: "AUTHENTICATED",
        account: input.account,
        expiresAt: input.expiresAt,
        errorMessage: null,
      });

      updatePanelState((currentPanelState) => ({
        ...currentPanelState,
        open: false,
      }));
    },
    [
      invalidatePendingSessionRequest,
      updatePanelState,
      updateSessionState,
    ],
  );

  const clearAuthenticatedSession = useCallback((): void => {
    invalidatePendingSessionRequest();

    updateSessionState({
      status: "UNAUTHENTICATED",
      account: null,
      expiresAt: null,
      errorMessage: null,
    });
  }, [
    invalidatePendingSessionRequest,
    updateSessionState,
  ]);

  const openAuthentication = useCallback(
    (options: OpenAuthenticationOptions = {}): void => {
      updatePanelState((currentPanelState) => ({
        open: true,
        view: options.view ?? currentPanelState.view,
      }));
    },
    [updatePanelState],
  );

  const closeAuthentication = useCallback((): void => {
    updatePanelState((currentPanelState) => ({
      ...currentPanelState,
      open: false,
    }));
  }, [updatePanelState]);

  const setAuthenticationView = useCallback(
    (view: AuthenticationPanelView): void => {
      updatePanelState((currentPanelState) => ({
        ...currentPanelState,
        view,
      }));
    },
    [updatePanelState],
  );

  const refreshAuthentication = useCallback(
    async (
      options: RefreshAuthenticationOptions = {},
    ): Promise<AuthSessionResponseData | null> => {
      requestAbortControllerReference.current?.abort();
      requestSequenceReference.current += 1;

      const requestSequence = requestSequenceReference.current;
      const abortController = new AbortController();
      const externalSignal = options.signal;

      requestAbortControllerReference.current = abortController;

      const abortFromExternalSignal = (): void => {
        abortController.abort(externalSignal?.reason);
      };

      if (externalSignal) {
        if (externalSignal.aborted) {
          abortController.abort(externalSignal.reason);
        } else {
          externalSignal.addEventListener(
            "abort",
            abortFromExternalSignal,
            {
              once: true,
            },
          );
        }
      }

      if (!options.silent) {
        updateSessionState((currentSessionState) => {
          if (
            currentSessionState.status === "AUTHENTICATED"
            && currentSessionState.account !== null
          ) {
            return {
              ...currentSessionState,
              errorMessage: null,
            };
          }

          return {
            ...currentSessionState,
            status: "LOADING",
            account: null,
            expiresAt: null,
            errorMessage: null,
          };
        });
      }

      try {
        const response = await getAuthSession({
          signal: abortController.signal,
        });

        if (
          !mountedReference.current
          || requestSequence !== requestSequenceReference.current
        ) {
          return null;
        }

        commitSessionResponse(response);

        return response;
      } catch (error) {
        if (
          isAbortError(error)
          || !mountedReference.current
          || requestSequence !== requestSequenceReference.current
        ) {
          return null;
        }

        const errorMessage = getAuthenticationErrorMessage(error);

        updateSessionState((currentSessionState) => {
          const expirationTime = getExpirationTime(
            currentSessionState.expiresAt,
          );

          if (
            options.silent
            && currentSessionState.status === "AUTHENTICATED"
            && currentSessionState.account !== null
            && expirationTime !== null
            && expirationTime > Date.now()
          ) {
            return {
              ...currentSessionState,
              errorMessage,
            };
          }

          return {
            status: "ERROR",
            account: null,
            expiresAt: null,
            errorMessage,
          };
        });

        return null;
      } finally {
        externalSignal?.removeEventListener(
          "abort",
          abortFromExternalSignal,
        );

        if (requestSequence === requestSequenceReference.current) {
          requestAbortControllerReference.current = null;
        }
      }
    },
    [
      commitSessionResponse,
      updateSessionState,
    ],
  );

  const signOut = useCallback(async (): Promise<boolean> => {
    if (signOutPromiseReference.current) {
      return signOutPromiseReference.current;
    }

    const signOutOperation = (async (): Promise<boolean> => {
      invalidatePendingSessionRequest();

      updateSessionState({
        status: "UNAUTHENTICATED",
        account: null,
        expiresAt: null,
        errorMessage: null,
      });

      updatePanelState({
        open: false,
        view: "USER_SIGN_IN",
      });

      const abortController = new AbortController();

      requestAbortControllerReference.current = abortController;

      try {
        await requestSignOut({
          signal: abortController.signal,
        });

        return true;
      } catch (error) {
        if (!mountedReference.current || isAbortError(error)) {
          return false;
        }

        const errorMessage = getAuthenticationErrorMessage(error);

        const refreshedSession = await refreshAuthentication({
          silent: true,
        });

        if (refreshedSession?.authenticated) {
          updateSessionState((currentSessionState) => ({
            ...currentSessionState,
            errorMessage,
          }));
        }

        return false;
      } finally {
        if (requestAbortControllerReference.current === abortController) {
          requestAbortControllerReference.current = null;
        }
      }
    })();

    signOutPromiseReference.current = signOutOperation;

    try {
      return await signOutOperation;
    } finally {
      if (signOutPromiseReference.current === signOutOperation) {
        signOutPromiseReference.current = null;
      }
    }
  }, [
    invalidatePendingSessionRequest,
    refreshAuthentication,
    updatePanelState,
    updateSessionState,
  ]);

  useEffect(() => {
    mountedReference.current = true;

    const timeoutIdentifier = window.setTimeout(() => {
      void refreshAuthentication({
        silent: clientSessionStateCache?.status === "AUTHENTICATED",
      });
    }, 0);

    return () => {
      mountedReference.current = false;

      window.clearTimeout(timeoutIdentifier);

      invalidatePendingSessionRequest();
    };
  }, [
    invalidatePendingSessionRequest,
    refreshAuthentication,
  ]);

  useEffect(() => {
    if (
      sessionState.status !== "AUTHENTICATED"
      || sessionState.account === null
    ) {
      return;
    }

    const expirationTime = getExpirationTime(sessionState.expiresAt);

    /*
     * El cambio de estado se programa fuera del cuerpo síncrono del efecto.
     * Esto evita renderizados encadenados y cumple la regla
     * react-hooks/set-state-in-effect.
     */
    if (expirationTime === null) {
      const timeoutIdentifier = window.setTimeout(() => {
        clearAuthenticatedSession();
      }, 0);

      return () => {
        window.clearTimeout(timeoutIdentifier);
      };
    }

    const delay = expirationTime
      - Date.now()
      + SESSION_EXPIRATION_REFRESH_DELAY_MILLISECONDS;

    const timeoutIdentifier = window.setTimeout(
      () => {
        void refreshAuthentication({
          silent: true,
        });
      },
      Math.min(
        Math.max(delay, 0),
        MAXIMUM_BROWSER_TIMEOUT_MILLISECONDS,
      ),
    );

    return () => {
      window.clearTimeout(timeoutIdentifier);
    };
  }, [
    clearAuthenticatedSession,
    refreshAuthentication,
    sessionState.account,
    sessionState.expiresAt,
    sessionState.status,
  ]);

  const contextValue = useMemo<AuthProviderContextValue>(
    () => ({
      status: sessionState.status,
      loading: sessionState.status === "LOADING",
      authenticated:
        sessionState.status === "AUTHENTICATED"
        && sessionState.account !== null,
      account: sessionState.account,
      sessionExpiresAt: sessionState.expiresAt,
      errorMessage: sessionState.errorMessage,
      panelOpen: panelState.open,
      panelView: panelState.view,
      openAuthentication,
      closeAuthentication,
      setAuthenticationView,
      applyAuthenticatedSession,
      applySessionResponse,
      clearAuthenticatedSession,
      refreshAuthentication,
      signOut,
    }),
    [
      sessionState,
      panelState,
      openAuthentication,
      closeAuthentication,
      setAuthenticationView,
      applyAuthenticatedSession,
      applySessionResponse,
      clearAuthenticatedSession,
      refreshAuthentication,
      signOut,
    ],
  );

  return (
    <AuthProviderContext.Provider value={contextValue}>
      {children}
    </AuthProviderContext.Provider>
  );
}

export function useAuth(): AuthProviderContextValue {
  const context = useContext(AuthProviderContext);

  if (!context) {
    throw new Error(
      "useAuth debe utilizarse dentro de AuthProvider.",
    );
  }

  return context;
}