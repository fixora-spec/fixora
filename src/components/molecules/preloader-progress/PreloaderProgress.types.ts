import type {
  HTMLAttributes,
} from "react";

import type {
  PreloaderLocale,
  PreloaderThemeMode,
} from "@/types/preloader";

export type PreloaderProgressProps =
  Omit<
    HTMLAttributes<HTMLDivElement>,
    "children"
  > & {
    /*
     * Porcentaje actual del preloader.
     * Normalmente tendrá un valor
     * comprendido entre 0 y 100.
     */
    readonly progress:
      number;

    /*
     * Modo visual actual utilizado
     * para adaptar colores y contraste.
     */
    readonly mode:
      PreloaderThemeMode;

    /*
     * Idioma utilizado para el texto
     * Cargando o Loading.
     */
    readonly locale?:
      PreloaderLocale;

    /*
     * Permite sustituir el texto
     * configurado por uno personalizado.
     */
    readonly label?:
      string;

    /*
     * Define el valor mínimo utilizado
     * por la barra de progreso.
     */
    readonly minimum?:
      number;

    /*
     * Define el valor máximo utilizado
     * por la barra de progreso.
     */
    readonly maximum?:
      number;

    /*
     * Controla si se muestra el
     * porcentaje numérico.
     */
    readonly showPercentage?:
      boolean;

    /*
     * Permite proporcionar manualmente
     * el ancho de la barra.
     *
     * Cuando no se establece, se usa
     * el tamaño responsive configurado.
     */
    readonly barWidthPx?:
      number;

    /*
     * Permite modificar el grosor
     * visible de la barra.
     */
    readonly barHeightPx?:
      number;

    /*
     * Duración de la transición visual
     * del relleno de la barra.
     */
    readonly transitionDurationMs?:
      number;

    /*
     * Desactiva transiciones cuando
     * se debe reducir el movimiento.
     */
    readonly reducedMotion?:
      boolean;

    /*
     * Texto accesible completo para
     * lectores de pantalla.
     */
    readonly accessibilityLabel?:
      string;

    /*
     * Clases adicionales para el texto
     * principal Cargando o Loading.
     */
    readonly labelClassName?:
      string;

    /*
     * Clases adicionales para el
     * porcentaje mostrado.
     */
    readonly percentageClassName?:
      string;

    /*
     * Clases adicionales para la pista
     * exterior de la barra.
     */
    readonly trackClassName?:
      string;

    /*
     * Clases adicionales para el
     * relleno animado de la barra.
     */
    readonly fillClassName?:
      string;
  };