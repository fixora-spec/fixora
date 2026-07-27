import type {
  HTMLAttributes,
} from "react";

import type {
  PreloaderLocale,
  PreloaderThemeMode,
} from "@/types/preloader";

export type PreloaderLogoProps =
  Omit<
    HTMLAttributes<HTMLDivElement>,
    "children"
  > & {
    readonly mode:
      PreloaderThemeMode;

    readonly locale?:
      PreloaderLocale;

    /*
     * Logo oscuro utilizado cuando
     * el fondo del preloader es claro.
     */
    readonly lightModeSrc?:
      string;

    /*
     * Logo claro o plateado utilizado
     * cuando el fondo es oscuro.
     */
    readonly darkModeSrc?:
      string;

    readonly alt?: string;

    readonly decorative?:
      boolean;

    readonly priority?:
      boolean;

    readonly sizes?:
      string;

    readonly imageClassName?:
      string;

    readonly transitionDurationMs?:
      number;
  };