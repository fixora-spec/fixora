import type {
  ReactNode,
} from "react";

import type {
  AccountRole,
} from "@/types/account";

import type {
  AuthenticationPanelView,
} from "@/providers/auth-provider";

export type AuthenticationGatewayProps = {
  children?:
    ReactNode;

  /*
   * Mantiene montado el contenido del panel
   * cuando se encuentra cerrado.
   */
  keepMounted?:
    boolean;

  /*
   * Identificador opcional para relacionar
   * el panel con controles externos.
   */
  panelId?:
    string;

  /*
   * Etiqueta accesible general del diálogo.
   */
  ariaLabel?:
    string;

  /*
   * Se ejecuta después de solicitar
   * el cierre del panel.
   */
  onClose?:
    () => void;

  /*
   * Se ejecuta cuando cambia
   * la vista activa.
   */
  onViewChange?: (
    view:
      AuthenticationPanelView,
  ) => void;
};

export type AuthenticationGatewayViewProps = {
  activeView:
    AuthenticationPanelView;

  setActiveView: (
    view:
      AuthenticationPanelView,
  ) => void;

  close:
    () => void;
};

export type AuthenticationGatewayPanelState = {
  open:
    boolean;

  activeView:
    AuthenticationPanelView;
};

export type AuthenticationGatewayVerificationState = {
  accountId:
    string;

  email:
    string;

  username:
    string;

  verificationExpiresAt:
    string;

  resendAvailableAt:
    string;
};

export type AuthenticationGatewayPasswordResetState = {
  resetToken:
    string;

  accountRole:
    AccountRole;
};