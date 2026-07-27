import type {
  HTMLMotionProps,
} from "motion/react";

import type {
  PreloaderFloatingShape,
  PreloaderThemeMode,
} from "@/types/preloader";

export type PreloaderFloatingShapeProps =
  Omit<
    HTMLMotionProps<"span">,
    | "children"
    | "animate"
    | "initial"
    | "transition"
    | "style"
  > & {
    /*
     * Datos generados para la figura:
     * tipo, posición, tamaño, movimiento,
     * opacidad, rotación y desenfoque.
     */
    readonly shape:
      PreloaderFloatingShape;

    /*
     * Modo visual actual del preloader.
     */
    readonly mode:
      PreloaderThemeMode;

    /*
     * Desactiva las animaciones continuas.
     */
    readonly reducedMotion?:
      boolean;

    /*
     * Distancia máxima de desplazamiento.
     */
    readonly animationDistancePx?:
      number;

    /*
     * Color personalizado de la figura.
     */
    readonly shapeColor?:
      string;

    /*
     * Grosor del borde de cuadrados,
     * rombos, hexágonos y líneas.
     */
    readonly borderWidthPx?:
      number;

    /*
     * Activa el resplandor exterior.
     */
    readonly showGlow?:
      boolean;

    /*
     * Multiplicador de velocidad:
     *
     * 1   → velocidad normal.
     * 0.5 → más lento.
     * 2   → más rápido.
     */
    readonly speedMultiplier?:
      number;

    /*
     * Utiliza directamente el tipo de
     * estilos compatible con motion.span.
     */
    readonly style?:
      HTMLMotionProps<"span">["style"];
  };