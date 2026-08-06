"use client";

import {
  useEffect,
} from "react";

import {
  useAuth,
} from "@/providers/auth-provider";

export default function SignInPage() {
  const {
    status,
    authenticated,
    panelOpen,
    panelView,
    openAuthentication,
  } = useAuth();

  useEffect(
    () => {
      if (
        status === "LOADING"
        || authenticated
        || (
          panelOpen
          && panelView === "USER_SIGN_IN"
        )
      ) {
        return undefined;
      }

      /*
       * La ruta abre el panel directamente sin montar un segundo
       * ApplicationBootstrap. La tarea se difiere para no actualizar el
       * proveedor de forma síncrona dentro del cuerpo del efecto.
       */
      const timeoutIdentifier =
        window.setTimeout(
          () => {
            openAuthentication({
              view:
                "USER_SIGN_IN",
            });
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
      authenticated,
      openAuthentication,
      panelOpen,
      panelView,
      status,
    ],
  );

  return null;
}