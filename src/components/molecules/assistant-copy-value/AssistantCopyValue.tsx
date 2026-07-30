"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import type {
  AssistantCopyValueProps,
  AssistantCopyValueStatus,
} from "./AssistantCopyValue.types";

const DEFAULT_STATUS_RESET_DELAY =
  2_000;

function normalizeGeneratedId(
  value: string,
): string {
  return value.replace(
    /[^A-Za-z0-9_-]/gu,
    "",
  );
}

function normalizeResetDelay(
  value: number,
): number {
  if (
    !Number.isFinite(
      value,
    )
  ) {
    return DEFAULT_STATUS_RESET_DELAY;
  }

  return Math.max(
    0,
    Math.trunc(
      value,
    ),
  );
}

async function copyUsingClipboardApi(
  value: string,
): Promise<boolean> {
  if (
    typeof navigator
      === "undefined"
    || !navigator.clipboard
    || typeof navigator.clipboard
      .writeText !== "function"
  ) {
    return false;
  }

  await navigator.clipboard.writeText(
    value,
  );

  return true;
}

function copyUsingTemporaryElement(
  value: string,
): boolean {
  if (
    typeof document
      === "undefined"
  ) {
    return false;
  }

  const temporaryTextArea =
    document.createElement(
      "textarea",
    );

  temporaryTextArea.value =
    value;

  temporaryTextArea.setAttribute(
    "readonly",
    "",
  );

  temporaryTextArea.setAttribute(
    "aria-hidden",
    "true",
  );

  temporaryTextArea.tabIndex =
    -1;

  temporaryTextArea.style.position =
    "fixed";

  temporaryTextArea.style.left =
    "-9999px";

  temporaryTextArea.style.top =
    "0";

  temporaryTextArea.style.opacity =
    "0";

  temporaryTextArea.style.pointerEvents =
    "none";

  document.body.appendChild(
    temporaryTextArea,
  );

  temporaryTextArea.focus();
  temporaryTextArea.select();

  temporaryTextArea.setSelectionRange(
    0,
    temporaryTextArea.value.length,
  );

  let copied =
    false;

  try {
    copied =
      document.execCommand(
        "copy",
      );
  } finally {
    temporaryTextArea.remove();
  }

  return copied;
}

async function copyText(
  value: string,
): Promise<void> {
  try {
    const clipboardApiSucceeded =
      await copyUsingClipboardApi(
        value,
      );

    if (
      clipboardApiSucceeded
    ) {
      return;
    }
  } catch {
    // Se utiliza el método de respaldo.
  }

  const fallbackSucceeded =
    copyUsingTemporaryElement(
      value,
    );

  if (
    !fallbackSucceeded
  ) {
    throw new Error(
      "No se pudo copiar el valor.",
    );
  }
}

export function AssistantCopyValue({
  value,
  displayValue,
  label,
  copyLabel,
  copyingLabel,
  copiedLabel,
  errorLabel,
  copiedAnnouncement,
  errorAnnouncement,
  copyButtonProps,
  resetStatusAfterMilliseconds =
    DEFAULT_STATUS_RESET_DELAY,
  disabled = false,
  hidden = false,
  onCopySuccess,
  onCopyError,
  onStatusChange,
  id,
  ...containerProperties
}: AssistantCopyValueProps) {
  const generatedId =
    useId();

  const resolvedComponentId =
    id
    ?? `assistant-copy-value-${normalizeGeneratedId(
      generatedId,
    )}`;

  const valueId =
    `${resolvedComponentId}-value`;

  const statusId =
    `${resolvedComponentId}-status`;

  const [
    status,
    setStatus,
  ] = useState<
    AssistantCopyValueStatus
  >(
    "IDLE",
  );

  /*
   * window.setTimeout devuelve un número en el navegador.
   * Tiparlo directamente como number evita el conflicto
   * con NodeJS.Timeout incluido por @types/node.
   */
  const resetTimeoutReference =
    useRef<number | null>(
      null,
    );

  const copying =
    status === "COPYING";

  const controlsDisabled =
    disabled
    || copying
    || Boolean(
      copyButtonProps
        ?.disabled,
    );

  const clearResetTimeout =
    (): void => {
      const timeoutIdentifier =
        resetTimeoutReference.current;

      if (
        timeoutIdentifier
        === null
      ) {
        return;
      }

      window.clearTimeout(
        timeoutIdentifier,
      );

      resetTimeoutReference.current =
        null;
    };

  const changeStatus =
    (
      nextStatus:
        AssistantCopyValueStatus,
    ): void => {
      setStatus(
        nextStatus,
      );

      onStatusChange?.(
        nextStatus,
      );
    };

  const scheduleStatusReset =
    (): void => {
      clearResetTimeout();

      const resetDelay =
        normalizeResetDelay(
          resetStatusAfterMilliseconds,
        );

      if (
        resetDelay === 0
      ) {
        changeStatus(
          "IDLE",
        );

        return;
      }

      resetTimeoutReference.current =
        window.setTimeout(
          () => {
            resetTimeoutReference.current =
              null;

            changeStatus(
              "IDLE",
            );
          },
          resetDelay,
        );
    };

  useEffect(
    () => {
      return () => {
        const timeoutIdentifier =
          resetTimeoutReference.current;

        if (
          timeoutIdentifier
          === null
        ) {
          return;
        }

        window.clearTimeout(
          timeoutIdentifier,
        );

        resetTimeoutReference.current =
          null;
      };
    },
    [],
  );

  const handleCopy =
    async (): Promise<void> => {
      if (
        controlsDisabled
      ) {
        return;
      }

      clearResetTimeout();

      changeStatus(
        "COPYING",
      );

      try {
        await copyText(
          value,
        );

        changeStatus(
          "COPIED",
        );

        onCopySuccess?.(
          value,
        );
      } catch (error) {
        changeStatus(
          "ERROR",
        );

        onCopyError?.(
          error,
          value,
        );
      } finally {
        scheduleStatusReset();
      }
    };

  const buttonContent =
    (() => {
      switch (
        status
      ) {
        case "COPYING":
          return (
            copyingLabel
            ?? copyLabel
          );

        case "COPIED":
          return copiedLabel;

        case "ERROR":
          return errorLabel;

        default:
          return copyLabel;
      }
    })();

  const statusAnnouncement =
    (() => {
      switch (
        status
      ) {
        case "COPIED":
          return (
            copiedAnnouncement
            ?? copiedLabel
          );

        case "ERROR":
          return (
            errorAnnouncement
            ?? errorLabel
          );

        default:
          return null;
      }
    })();

  if (
    hidden
  ) {
    return null;
  }

  return (
    <div
      {...containerProperties}
      id={
        resolvedComponentId
      }
      data-assistant-copy-value=""
      data-copy-status={
        status.toLowerCase()
      }
    >
      {label ? (
        <p>
          {label}
        </p>
      ) : null}

      <output
        id={valueId}
        data-copy-value=""
      >
        {displayValue
          ?? value}
      </output>

      <button
        {...copyButtonProps}
        type="button"
        disabled={
          controlsDisabled
        }
        aria-describedby={
          `${valueId} ${statusId}`
        }
        data-copy-action=""
        onClick={
          () => {
            void handleCopy();
          }
        }
      >
        {buttonContent}
      </button>

      <span
        id={statusId}
        role={
          status === "ERROR"
            ? "alert"
            : "status"
        }
        aria-live={
          status === "ERROR"
            ? "assertive"
            : "polite"
        }
        aria-atomic="true"
      >
        {statusAnnouncement}
      </span>
    </div>
  );
}