import type {
  ReactNode,
} from "react";

import type {
  AuthenticationPanelView,
} from "@/providers/auth-provider";

export type ApplicationBootstrapProps = {
  children?: ReactNode;

  preloaderCompleted: boolean;

  automaticAuthenticationEnabled?: boolean;

  automaticAuthenticationView?:
    AuthenticationPanelView;

  onAutomaticAuthenticationOpen?:
    () => void;
};