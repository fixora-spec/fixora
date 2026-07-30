"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const MAXIMUM_COUNTDOWN_SECONDS =
  86_400;

export type VerificationCountdownState = {
  remainingSeconds: number;
  minutes: number;
  seconds: number;

  formattedTime: string;

  isRunning: boolean;
  isExpired: boolean;

  start: (
    seconds: number,
  ) => void;

  stop: () => void;
  reset: () => void;
};

function validateCountdownSeconds(
  seconds: number,
): number {
  if (
    !Number.isSafeInteger(seconds)
    || seconds < 0
    || seconds
      > MAXIMUM_COUNTDOWN_SECONDS
  ) {
    throw new Error(
      `El contador debe estar entre 0 y ${MAXIMUM_COUNTDOWN_SECONDS} segundos.`,
    );
  }

  return seconds;
}

function calculateRemainingSeconds(
  deadlineMilliseconds: number,
): number {
  const remainingMilliseconds =
    deadlineMilliseconds
    - Date.now();

  return Math.max(
    0,
    Math.ceil(
      remainingMilliseconds
      / 1_000,
    ),
  );
}

function formatCountdownTime(
  remainingSeconds: number,
): string {
  const minutes =
    Math.floor(
      remainingSeconds / 60,
    );

  const seconds =
    remainingSeconds % 60;

  return [
    String(minutes).padStart(
      2,
      "0",
    ),

    String(seconds).padStart(
      2,
      "0",
    ),
  ].join(":");
}

export function useVerificationCountdown(
  initialSeconds = 0,
): VerificationCountdownState {
  const [
    initialCountdownSeconds,
  ] = useState(
    () =>
      validateCountdownSeconds(
        initialSeconds,
      ),
  );

  const [
    remainingSeconds,
    setRemainingSeconds,
  ] = useState(
    () =>
      initialCountdownSeconds,
  );

  const [
    isRunning,
    setIsRunning,
  ] = useState(
    () =>
      initialCountdownSeconds > 0,
  );

  const deadlineReference =
    useRef<number | null>(
      null,
    );

  const intervalReference =
    useRef<
      ReturnType<
        typeof setInterval
      >
      | null
    >(
      null,
    );

  const clearCountdownInterval =
    useCallback(
      (): void => {
        if (
          intervalReference.current
          === null
        ) {
          return;
        }

        clearInterval(
          intervalReference.current,
        );

        intervalReference.current =
          null;
      },
      [],
    );

  const updateCountdown =
    useCallback(
      (): void => {
        const deadline =
          deadlineReference.current;

        if (deadline === null) {
          clearCountdownInterval();

          setIsRunning(
            false,
          );

          return;
        }

        const nextRemainingSeconds =
          calculateRemainingSeconds(
            deadline,
          );

        setRemainingSeconds(
          nextRemainingSeconds,
        );

        if (
          nextRemainingSeconds > 0
        ) {
          return;
        }

        deadlineReference.current =
          null;

        clearCountdownInterval();

        setIsRunning(
          false,
        );
      },
      [
        clearCountdownInterval,
      ],
    );

  const start =
    useCallback(
      (
        secondsToCount: number,
      ): void => {
        const normalizedSeconds =
          validateCountdownSeconds(
            secondsToCount,
          );

        clearCountdownInterval();

        setRemainingSeconds(
          normalizedSeconds,
        );

        if (
          normalizedSeconds === 0
        ) {
          deadlineReference.current =
            null;

          setIsRunning(
            false,
          );

          return;
        }

        deadlineReference.current =
          Date.now()
          + normalizedSeconds
            * 1_000;

        setIsRunning(
          true,
        );

        intervalReference.current =
          setInterval(
            updateCountdown,
            250,
          );
      },
      [
        clearCountdownInterval,
        updateCountdown,
      ],
    );

  const stop =
    useCallback(
      (): void => {
        clearCountdownInterval();

        deadlineReference.current =
          null;

        setIsRunning(
          false,
        );
      },
      [
        clearCountdownInterval,
      ],
    );

  const reset =
    useCallback(
      (): void => {
        clearCountdownInterval();

        deadlineReference.current =
          null;

        setRemainingSeconds(
          0,
        );

        setIsRunning(
          false,
        );
      },
      [
        clearCountdownInterval,
      ],
    );

  useEffect(
    () => {
      if (
        initialCountdownSeconds === 0
      ) {
        return undefined;
      }

      deadlineReference.current =
        Date.now()
        + initialCountdownSeconds
          * 1_000;

      intervalReference.current =
        setInterval(
          updateCountdown,
          250,
        );

      return () => {
        clearCountdownInterval();

        deadlineReference.current =
          null;
      };
    },
    [
      initialCountdownSeconds,
      updateCountdown,
      clearCountdownInterval,
    ],
  );

  const minutes =
    Math.floor(
      remainingSeconds / 60,
    );

  const seconds =
    remainingSeconds % 60;

  const formattedTime =
    useMemo(
      () =>
        formatCountdownTime(
          remainingSeconds,
        ),
      [
        remainingSeconds,
      ],
    );

  return {
    remainingSeconds,
    minutes,
    seconds,

    formattedTime,

    isRunning,

    isExpired:
      remainingSeconds === 0,

    start,
    stop,
    reset,
  };
}