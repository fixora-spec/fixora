import type {
  HTMLAttributes,
} from "react";

import type {
  PreloaderRingParticle,
  PreloaderThemeMode,
} from "@/types/preloader";

export type PreloaderParticleRingProps =
  Omit<
    HTMLAttributes<HTMLDivElement>,
    "children"
  > & {
    /*
     * Modo visual actual del preloader.
     */
    readonly mode:
      PreloaderThemeMode;

    /*
     * Tiempo transcurrido en milisegundos.
     * Controla la rotación y movimiento.
     */
    readonly elapsedMs:
      number;

    /*
     * Porcentaje actual de carga.
     */
    readonly progress:
      number;

    /*
     * Permite proporcionar partículas
     * previamente generadas.
     */
    readonly particles?:
      readonly PreloaderRingParticle[];

    /*
     * Cantidad de partículas generadas
     * cuando no se proporciona particles.
     */
    readonly particleCount?:
      number;

    /*
     * Longitud visible de la cola.
     */
    readonly trailLength?:
      number;

    /*
     * Semilla estable para evitar cambios
     * entre diferentes renderizados.
     */
    readonly seed?:
      string;

    /*
     * Tamaño manual del anillo.
     * Cuando no se proporciona, se utiliza
     * el tamaño responsive configurado.
     */
    readonly sizePx?:
      number;

    /*
     * Desactiva el movimiento continuo.
     */
    readonly reducedMotion?:
      boolean;

    /*
     * Marca el Canvas como decorativo.
     */
    readonly decorative?:
      boolean;

    /*
     * Descripción accesible del anillo.
     */
    readonly label?:
      string;

    /*
     * Clases adicionales para el Canvas.
     */
    readonly canvasClassName?:
      string;
  };