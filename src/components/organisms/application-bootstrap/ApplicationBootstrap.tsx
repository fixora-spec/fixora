"use client";

import {
  useEffect,
} from "react";

import {
  useAuth,
} from "@/providers/auth-provider";

import type {
  ApplicationBootstrapProps,
} from "./ApplicationBootstrap.types";

/*
 * Esta variable vive durante toda la navegación cliente.
 * Se reinicia únicamente cuando la página se recarga por completo.
 */
let automaticAuthenticationHandledForCurrentLoad =
  false;

export function ApplicationBootstrap({
  children,
  preloaderCompleted,
  automaticAuthenticationEnabled = true,
  automaticAuthenticationView =
    "USER_SIGN_IN",
  onAutomaticAuthenticationOpen,
}: ApplicationBootstrapProps) {
  const {
    status,
    authenticated,
    panelOpen,
    openAuthentication,
  } = useAuth();

  useEffect(
    () => {
      if (
        !automaticAuthenticationEnabled
        || !preloaderCompleted
        || automaticAuthenticationHandledForCurrentLoad
      ) {
        return;
      }

      if (
        status === "LOADING"
        || status === "ERROR"
      ) {
        return;
      }

      /*
       * La oportunidad de apertura automática queda consumida
       * para esta carga completa, aunque ya exista una sesión
       * o el panel haya sido abierto manualmente.
       */
      automaticAuthenticationHandledForCurrentLoad =
        true;

      if (
        authenticated
        || panelOpen
      ) {
        return;
      }

      openAuthentication({
        view:
          automaticAuthenticationView,
      });

      onAutomaticAuthenticationOpen?.();
    },
    [
      automaticAuthenticationEnabled,
      automaticAuthenticationView,
      authenticated,
      onAutomaticAuthenticationOpen,
      openAuthentication,
      panelOpen,
      preloaderCompleted,
      status,
    ],
  );

  return children ?? null;
}