import type {
  HTMLAttributes,
} from "react";

import type {
  PreloaderFloatingShape,
  PreloaderThemeMode,
} from "@/types/preloader";

export type PreloaderBackgroundProps =
  Omit<
    HTMLAttributes<HTMLDivElement>,
    "children"
  > & {
    /*
     * Modo visual actual:
     * oscuro o claro.
     */
    readonly mode:
      PreloaderThemeMode;

    /*
     * Permite proporcionar directamente
     * las formas flotantes ya generadas.
     */
    readonly shapes?:
      readonly PreloaderFloatingShape[];

    /*
     * Cantidad de formas que se generarán
     * cuando no se proporciona shapes.
     */
    readonly amount?:
      number;

    /*
     * Semilla estable para mantener las
     * mismas posiciones entre renderizados.
     */
    readonly seed?:
      string;

    /*
     * Desactiva el movimiento continuo
     * de todas las figuras.
     */
    readonly reducedMotion?:
      boolean;

    /*
     * Distancia máxima de desplazamiento
     * utilizada por las formas.
     */
    readonly animationDistancePx?:
      number;

    /*
     * Multiplicador general de velocidad.
     */
    readonly speedMultiplier?:
      number;

    /*
     * Activa el resplandor exterior
     * de las figuras flotantes.
     */
    readonly showShapeGlow?:
      boolean;

    /*
     * Permite reemplazar el color general
     * de las figuras.
     */
    readonly shapeColor?:
      string;

    /*
     * Grosor del contorno de las figuras.
     */
    readonly shapeBorderWidthPx?:
      number;

    /*
     * Activa los resplandores ambientales
     * grandes ubicados detrás del contenido.
     */
    readonly showAmbientGlows?:
      boolean;

    /*
     * Activa una cuadrícula tecnológica
     * muy sutil sobre el fondo.
     */
    readonly showGrid?:
      boolean;

    /*
     * Activa pequeños puntos decorativos
     * distribuidos sobre la pantalla.
     */
    readonly showNoiseDots?:
      boolean;

    /*
     * Marca todo el fondo como decorativo.
     */
    readonly decorative?:
      boolean;

    /*
     * Clases adicionales aplicadas
     * a cada forma flotante.
     */
    readonly shapeClassName?:
      string;
  };