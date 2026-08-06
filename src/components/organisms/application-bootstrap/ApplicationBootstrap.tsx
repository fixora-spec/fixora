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
        || status === "LOADING"
        || status === "ERROR"
      ) {
        return undefined;
      }

      /*
       * Se programa la apertura fuera del cuerpo síncrono del efecto para
       * evitar actualizaciones encadenadas durante el mismo ciclo de render.
       * La oportunidad solamente se consume cuando la tarea llega a ejecutarse.
       */
      const timeoutIdentifier =
        window.setTimeout(
          () => {
            if (
              automaticAuthenticationHandledForCurrentLoad
            ) {
              return;
            }

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
          0,
        );

      return () => {
        window.clearTimeout(
          timeoutIdentifier,
        );
      };
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