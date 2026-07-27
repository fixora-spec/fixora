import type {
  HTMLMotionProps,
} from "motion/react";

import type {
  PreloaderLocale,
  PreloaderPhase,
  PreloaderStatus,
  PreloaderThemeMode,
} from "@/types/preloader";

export type PreloaderShellProps =
  Omit<
    HTMLMotionProps<"div">,
    | "children"
    | "initial"
    | "animate"
    | "exit"
    | "transition"
    | "style"
  > & {
    /*
     * Idioma utilizado por los textos
     * visibles y los atributos accesibles.
     */
    readonly locale?:
      PreloaderLocale;

    /*
     * Modo visual actual del preloader.
     *
     * dark → fondo oscuro y logo claro.
     * light → fondo claro y logo oscuro.
     */
    readonly mode:
      PreloaderThemeMode;

    /*
     * Estado general proporcionado por
     * useAppPreloader.
     */
    readonly status:
      PreloaderStatus;

    /*
     * Fase activa dentro de la secuencia:
     *
     * 0–2 s → oscuro
     * 2–4 s → claro
     * 4–6 s → oscuro
     */
    readonly currentPhase:
      PreloaderPhase;

    /*
     * Tiempo transcurrido en milisegundos.
     * Se utiliza para animar el Canvas.
     */
    readonly elapsedMs:
      number;

    /*
     * Progreso actual comprendido
     * normalmente entre 0 y 100.
     */
    readonly progress:
      number;

    /*
     * Desactiva animaciones intensas
     * cuando el usuario prefiere
     * movimiento reducido.
     */
    readonly reducedMotion?:
      boolean;

    /*
     * Indica que el preloader está
     * realizando su transición de salida.
     */
    readonly isFinishing?:
      boolean;

    /*
     * Controla la visualización del
     * fondo tecnológico completo.
     */
    readonly showBackground?:
      boolean;

    /*
     * Controla la visualización de
     * cuadrados, rombos, líneas,
     * puntos y hexágonos flotantes.
     */
    readonly showFloatingShapes?:
      boolean;

    /*
     * Controla la visualización del
     * anillo circular de partículas.
     */
    readonly showParticleRing?:
      boolean;

    /*
     * Controla la visualización de la
     * barra, el texto y el porcentaje.
     */
    readonly showProgress?:
      boolean;

    /*
     * Controla la visualización del logo.
     */
    readonly showLogo?:
      boolean;

    /*
     * Permite reemplazar el logo utilizado
     * cuando el fondo está en modo claro.
     */
    readonly lightModeLogoSrc?:
      string;

    /*
     * Permite reemplazar el logo utilizado
     * cuando el fondo está en modo oscuro.
     */
    readonly darkModeLogoSrc?:
      string;

    /*
     * Texto alternativo personalizado
     * para el logo de Fixora.
     */
    readonly logoAlt?:
      string;

    /*
     * Permite reemplazar el texto
     * Cargando o Loading.
     */
    readonly loadingLabel?:
      string;

    /*
     * Texto accesible completo para
     * lectores de pantalla.
     */
    readonly accessibilityLabel?:
      string;

    /*
     * Marca el contenido visual como
     * decorativo. El organismo principal
     * continuará anunciando el progreso.
     */
    readonly decorative?:
      boolean;

    /*
     * Clases adicionales para el fondo.
     */
    readonly backgroundClassName?:
      string;

    /*
     * Clases adicionales para el bloque
     * central que contiene logo, anillo
     * y progreso.
     */
    readonly contentClassName?:
      string;

    /*
     * Clases adicionales para el logo.
     */
    readonly logoClassName?:
      string;

    /*
     * Clases adicionales para el anillo.
     */
    readonly particleRingClassName?:
      string;

    /*
     * Clases adicionales para la barra
     * y el porcentaje.
     */
    readonly progressClassName?:
      string;

    /*
     * Clases adicionales para los
     * elementos flotantes del fondo.
     */
    readonly floatingShapeClassName?:
      string;

    /*
     * Estilos compatibles directamente
     * con motion.div.
     */
    readonly style?:
      HTMLMotionProps<"div">["style"];
  };