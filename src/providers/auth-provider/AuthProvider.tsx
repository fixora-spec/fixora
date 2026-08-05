"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  getAuthSession,
  signOut as requestSignOut,
} from "@/services/auth";

import {
  isAuthApiClientError,
} from "@/services/auth";

import type {
  AuthSessionResponseData,
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

const INITIAL_SESSION_STATE:
  AuthenticationSessionState = {
  status:
    "LOADING",

  account:
    null,

  expiresAt:
    null,

  errorMessage:
    null,
};

const INITIAL_PANEL_STATE:
  AuthenticationPanelState = {
  open:
    false,

  view:
    "USER_SIGN_IN",
};

const AuthProviderContext =
  createContext<
    AuthProviderContextValue
    | undefined
  >(
    undefined,
  );

/*
 * Conserva la sesión únicamente en memoria durante la navegación cliente.
 * Esto evita que el cambio de idioma muestre temporalmente la cuenta como
 * cerrada cuando el layout localizado vuelve a montar sus proveedores.
 * No se guarda ningún token ni contraseña.
 */
let clientSessionStateCache:
  AuthenticationSessionState
  | null = null;

/*
 * Conserva la vista de autenticación durante los cambios de idioma.
 * No contiene credenciales ni datos sensibles.
 */
let clientPanelStateCache:
  AuthenticationPanelState
  | null = null;

function isAbortError(
  error: unknown,
): boolean {
  return (
    error instanceof DOMException
    && error.name === "AbortError"
  );
}

function getAuthenticationErrorMessage(
  error: unknown,
): string {
  if (
    isAuthApiClientError(error)
  ) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "No se pudo comprobar la sesión de autenticación.";
}

export function AuthProvider({
  children,
}: AuthProviderProps) {
  const [
    sessionState,
    setSessionState,
  ] = useState<
    AuthenticationSessionState
  >(
    () => (
      typeof window !== "undefined"
      && clientSessionStateCache
        ? clientSessionStateCache
        : INITIAL_SESSION_STATE
    ),
  );

  const [
    panelState,
    setPanelState,
  ] = useState<
    AuthenticationPanelState
  >(
    () => (
      typeof window !== "undefined"
      && clientPanelStateCache
        ? clientPanelStateCache
        : INITIAL_PANEL_STATE
    ),
  );

  const requestSequenceReference =
    useRef(
      0,
    );

  const requestAbortControllerReference =
    useRef<
      AbortController | null
    >(
      null,
    );

  useEffect(
    () => {
      clientSessionStateCache =
        sessionState;
    },
    [
      sessionState,
    ],
  );

  useEffect(
    () => {
      clientPanelStateCache =
        panelState;
    },
    [
      panelState,
    ],
  );

  const applySessionResponse =
    useCallback(
      (
        response:
          AuthSessionResponseData,
      ): void => {
        if (
          response.authenticated
        ) {
          setSessionState({
            status:
              "AUTHENTICATED",

            account:
              response.account,

            expiresAt:
              response.expiresAt,

            errorMessage:
              null,
          });

          setPanelState(
            (currentPanelState) => ({
              ...currentPanelState,

              open:
                false,
            }),
          );

          return;
        }

        setSessionState({
          status:
            "UNAUTHENTICATED",

          account:
            null,

          expiresAt:
            null,

          errorMessage:
            null,
        });
      },
      [],
    );

  const applyAuthenticatedSession =
    useCallback(
      (
        input:
          AuthenticationResultInput,
      ): void => {
        setSessionState({
          status:
            "AUTHENTICATED",

          account:
            input.account,

          expiresAt:
            input.expiresAt,

          errorMessage:
            null,
        });

        setPanelState(
          (currentPanelState) => ({
            ...currentPanelState,

            open:
              false,
          }),
        );
      },
      [],
    );

  const clearAuthenticatedSession =
    useCallback(
      (): void => {
        setSessionState({
          status:
            "UNAUTHENTICATED",

          account:
            null,

          expiresAt:
            null,

          errorMessage:
            null,
        });
      },
      [],
    );

  const openAuthentication =
    useCallback(
      (
        options:
          OpenAuthenticationOptions = {},
      ): void => {
        setPanelState(
          (
            currentPanelState,
          ) => ({
            open:
              true,

            view:
              options.view
              ?? currentPanelState.view,
          }),
        );
      },
      [],
    );

  const closeAuthentication =
    useCallback(
      (): void => {
        setPanelState(
          (
            currentPanelState,
          ) => ({
            ...currentPanelState,

            open:
              false,
          }),
        );
      },
      [],
    );

  const setAuthenticationView =
    useCallback(
      (
        view:
          AuthenticationPanelView,
      ): void => {
        setPanelState(
          (
            currentPanelState,
          ) => ({
            ...currentPanelState,

            view,
          }),
        );
      },
      [],
    );

  const refreshAuthentication =
    useCallback(
      async (
        options:
          RefreshAuthenticationOptions = {},
      ): Promise<
        AuthSessionResponseData
        | null
      > => {
        requestAbortControllerReference
          .current
          ?.abort();

        requestSequenceReference.current += 1;

        const requestSequence =
          requestSequenceReference.current;

        const abortController =
          new AbortController();

        requestAbortControllerReference.current =
          abortController;

        const externalSignal =
          options.signal;

        const abortFromExternalSignal =
          (): void => {
            abortController.abort();
          };

        if (externalSignal) {
          if (externalSignal.aborted) {
            abortController.abort();
          } else {
            externalSignal.addEventListener(
              "abort",
              abortFromExternalSignal,
              {
                once:
                  true,
              },
            );
          }
        }

        if (!options.silent) {
          setSessionState(
            (
              currentSessionState,
            ) => {
              if (
                currentSessionState.status
                  === "AUTHENTICATED"
                && currentSessionState.account
                  !== null
              ) {
                return {
                  ...currentSessionState,

                  errorMessage:
                    null,
                };
              }

              return {
                ...currentSessionState,

                status:
                  "LOADING",

                errorMessage:
                  null,
              };
            },
          );
        }

        try {
          const response =
            await getAuthSession({
              signal:
                abortController.signal,
            });

          if (
            requestSequence
            !== requestSequenceReference
              .current
          ) {
            return null;
          }

          applySessionResponse(
            response,
          );

          return response;
        } catch (error) {
          if (
            isAbortError(error)
            || requestSequence
              !== requestSequenceReference
                .current
          ) {
            return null;
          }

          setSessionState({
            status:
              "ERROR",

            account:
              null,

            expiresAt:
              null,

            errorMessage:
              getAuthenticationErrorMessage(
                error,
              ),
          });

          return null;
        } finally {
          if (externalSignal) {
            externalSignal
              .removeEventListener(
                "abort",
                abortFromExternalSignal,
              );
          }

          if (
            requestSequence
            === requestSequenceReference
              .current
          ) {
            requestAbortControllerReference.current =
              null;
          }
        }
      },
      [
        applySessionResponse,
      ],
    );

  const signOut =
    useCallback(
      async (): Promise<boolean> => {
        requestAbortControllerReference
          .current
          ?.abort();

        requestAbortControllerReference.current =
          null;

        requestSequenceReference.current += 1;

        clearAuthenticatedSession();

        setPanelState({
          open:
            false,

          view:
            "USER_SIGN_IN",
        });

        try {
          await requestSignOut();

          return true;
        } catch (error) {
          const errorMessage =
            getAuthenticationErrorMessage(
              error,
            );

          const refreshedSession =
            await refreshAuthentication({
              silent:
                true,
            });

          if (
            refreshedSession
              ?.authenticated
          ) {
            setSessionState(
              (
                currentSessionState,
              ) => ({
                ...currentSessionState,

                errorMessage,
              }),
            );
          }

          return false;
        }
      },
      [
        clearAuthenticatedSession,
        refreshAuthentication,
      ],
    );

  useEffect(
    () => {
      const timeoutIdentifier =
        window.setTimeout(
          () => {
            void refreshAuthentication({
              silent:
                clientSessionStateCache
                  ?.status
                === "AUTHENTICATED",
            });
          },
          0,
        );

      return () => {
        window.clearTimeout(
          timeoutIdentifier,
        );

        requestSequenceReference.current += 1;

        requestAbortControllerReference
          .current
          ?.abort();

        requestAbortControllerReference.current =
          null;
      };
    },
    [
      refreshAuthentication,
    ],
  );

  const contextValue =
    useMemo<
      AuthProviderContextValue
    >(
      () => ({
        status:
          sessionState.status,

        loading:
          sessionState.status
          === "LOADING",

        authenticated:
          sessionState.status
          === "AUTHENTICATED"
          && sessionState.account
            !== null,

        account:
          sessionState.account,

        sessionExpiresAt:
          sessionState.expiresAt,

        errorMessage:
          sessionState.errorMessage,

        panelOpen:
          panelState.open,

        panelView:
          panelState.view,

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
    <AuthProviderContext.Provider
      value={contextValue}
    >
      {children}
    </AuthProviderContext.Provider>
  );
}

export function useAuth():
  AuthProviderContextValue {
  const context =
    useContext(
      AuthProviderContext,
    );

  if (!context) {
    throw new Error(
      "useAuth debe utilizarse dentro de AuthProvider.",
    );
  }

  return context;
}