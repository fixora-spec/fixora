import type {
  PreloaderShellProps,
} from "@/components/templates/preloader-shell";

import type {
  PreloaderPhase,
  PreloaderStatus,
  PreloaderThemeMode,
} from "@/types/preloader";

export type AppPreloaderStartHandler =
  () => void;

export type AppPreloaderCompleteHandler =
  () => void;

export type AppPreloaderProgressHandler =
  (
    progress: number,
  ) => void;

export type AppPreloaderStatusHandler =
  (
    status: PreloaderStatus,
  ) => void;

export type AppPreloaderModeHandler =
  (
    mode: PreloaderThemeMode,
  ) => void;

export type AppPreloaderPhaseHandler =
  (
    phase: PreloaderPhase,
  ) => void;

export type AppPreloaderProps =
  Omit<
    PreloaderShellProps,
    | "mode"
    | "status"
    | "currentPhase"
    | "elapsedMs"
    | "progress"
    | "isFinishing"
  > & {
    /*
     * Activa o desactiva completamente
     * el preloader global.
     */
    readonly enabled?:
      boolean;

    /*
     * Duración completa del preloader.
     *
     * Valor predeterminado:
     * 6000 milisegundos.
     */
    readonly durationMs?:
      number;

    /*
     * Porcentaje desde el que debe
     * comenzar la animación.
     */
    readonly initialProgress?:
      number;

    /*
     * Bloquea el desplazamiento del
     * documento mientras el preloader
     * permanece visible.
     */
    readonly lockDocumentScroll?:
      boolean;

    /*
     * Nivel visual del preloader.
     * Debe permanecer por encima de
     * todos los elementos del proyecto.
     */
    readonly zIndex?:
      number;

    /*
     * Identificador opcional utilizado
     * para pruebas automatizadas.
     */
    readonly testId?:
      string;

    /*
     * Se ejecuta cuando empieza una
     * nueva secuencia de carga.
     */
    readonly onStart?:
      AppPreloaderStartHandler;

    /*
     * Se ejecuta cuando cambia el
     * porcentaje de carga.
     */
    readonly onProgress?:
      AppPreloaderProgressHandler;

    /*
     * Se ejecuta cuando cambia el
     * estado general del preloader.
     */
    readonly onStatusChange?:
      AppPreloaderStatusHandler;

    /*
     * Se ejecuta al alternar entre
     * modo claro y oscuro.
     */
    readonly onModeChange?:
      AppPreloaderModeHandler;

    /*
     * Se ejecuta cuando cambia una
     * de las tres fases.
     */
    readonly onPhaseChange?:
      AppPreloaderPhaseHandler;

    /*
     * Se ejecuta después de terminar
     * la carga y la salida visual.
     */
    readonly onComplete?:
      AppPreloaderCompleteHandler;
  };