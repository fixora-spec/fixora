"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import type {
  ChangeEvent,
  FormEvent,
} from "react";

import {
  useLocale,
  useTranslations,
} from "next-intl";

import {
  useVerificationCountdown,
} from "@/hooks/use-verification-countdown";

import {
  useAuth,
} from "@/providers/auth-provider";

import {
  isAuthApiClientError,
  resendVerificationCode,
  verifyUserEmail,
} from "@/services/auth";

import type {
  Locale,
} from "@/types/locale";

import type {
  EmailVerificationFormProps,
  EmailVerificationFormStatus,
} from "./EmailVerificationForm.types";

const VERIFICATION_CODE_LENGTH = 6;

const VERIFICATION_CODE_PATTERN =
  /^[A-Z0-9]{6}$/u;

function isSupportedLocale(
  value: string,
): value is Locale {
  return (
    value === "es"
    || value === "en"
  );
}

function isAbortError(
  error: unknown,
): boolean {
  return (
    error instanceof DOMException
    && error.name === "AbortError"
  );
}

function normalizeVerificationCode(
  value: string,
): string {
  return value
    .toUpperCase()
    .replace(
      /[^A-Z0-9]/gu,
      "",
    )
    .slice(
      0,
      VERIFICATION_CODE_LENGTH,
    );
}

function validateAccountId(
  accountId: string,
): string {
  const normalizedAccountId =
    accountId.trim();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      normalizedAccountId,
    )
  ) {
    throw new Error(
      "El identificador de la cuenta no es válido.",
    );
  }

  return normalizedAccountId;
}

function getRemainingSeconds(
  targetDate:
    string
    | null
    | undefined,
): number {
  if (!targetDate) {
    return 0;
  }

  const parsedTargetDate =
    new Date(
      targetDate,
    );

  if (
    Number.isNaN(
      parsedTargetDate.getTime(),
    )
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.ceil(
      (
        parsedTargetDate.getTime()
        - Date.now()
      ) / 1_000,
    ),
  );
}

function getVerificationErrorMessage(
  error: unknown,
  fallbackMessage: string,
): string {
  if (
    isAuthApiClientError(
      error,
    )
  ) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallbackMessage;
}

export function EmailVerificationForm({
  formId,
  accountId,
  email,
  username,
  verificationExpiresAt = null,
  resendAvailableAt = null,
  locale,
  initialCode = "",
  disabled = false,
  onSuccess,
  onResendSuccess,
  onRequestSignIn,
  onRequestRegistration,
}: EmailVerificationFormProps) {
  const translations =
    useTranslations(
      "auth.emailVerification",
    );

  const currentLocale =
    useLocale();

  const {
    setAuthenticationView,
  } = useAuth();

  const generatedFormId =
    useId();

  const resolvedFormId =
    formId
    ?? `email-verification-form-${generatedFormId}`;

  const resolvedLocale:
    Locale =
    locale
    ?? (
      isSupportedLocale(
        currentLocale,
      )
        ? currentLocale
        : "es"
    );

  const normalizedAccountId =
    validateAccountId(
      accountId,
    );

  const [
    code,
    setCode,
  ] = useState(
    () =>
      normalizeVerificationCode(
        initialCode,
      ),
  );

  const [
    status,
    setStatus,
  ] = useState<
    EmailVerificationFormStatus
  >(
    "IDLE",
  );

  const [
    errorMessage,
    setErrorMessage,
  ] = useState<
    string | null
  >(
    null,
  );

  const [
    currentVerificationExpiresAt,
    setCurrentVerificationExpiresAt,
  ] = useState<
    string | null
  >(
    verificationExpiresAt,
  );

  const [
    currentResendAvailableAt,
    setCurrentResendAvailableAt,
  ] = useState<
    string | null
  >(
    resendAvailableAt,
  );

  const {
    formattedTime:
      verificationFormattedTime,

    isExpired:
      verificationExpired,

    start:
      startVerificationCountdown,

    stop:
      stopVerificationCountdown,
  } = useVerificationCountdown(
    0,
  );

  const {
    formattedTime:
      resendFormattedTime,

    isExpired:
      resendExpired,

    start:
      startResendCountdown,
  } = useVerificationCountdown(
    0,
  );

  const verificationAbortControllerReference =
    useRef<
      AbortController | null
    >(
      null,
    );

  const resendAbortControllerReference =
    useRef<
      AbortController | null
    >(
      null,
    );

  const verifying =
    status === "VERIFYING";

  const resending =
    status === "RESENDING";

  const busy =
    verifying
    || resending;

  const controlsDisabled =
    disabled
    || busy;

  const resendDisabled =
    controlsDisabled
    || !resendExpired;

  const codeInputId =
    `${resolvedFormId}-code`;

  const messageId =
    `${resolvedFormId}-message`;

  const verificationCountdownId =
    `${resolvedFormId}-verification-countdown`;

  const resendCountdownId =
    `${resolvedFormId}-resend-countdown`;

  useEffect(
    () => {
      const timeoutIdentifier =
        window.setTimeout(
          () => {
            startVerificationCountdown(
              getRemainingSeconds(
                currentVerificationExpiresAt,
              ),
            );

            startResendCountdown(
              getRemainingSeconds(
                currentResendAvailableAt,
              ),
            );
          },
          0,
        );

      return () => {
        window.clearTimeout(
          timeoutIdentifier,
        );
      };
    },
    [
      currentVerificationExpiresAt,
      currentResendAvailableAt,
      startVerificationCountdown,
      startResendCountdown,
    ],
  );

  useEffect(
    () => {
      return () => {
        verificationAbortControllerReference
          .current
          ?.abort();

        resendAbortControllerReference
          .current
          ?.abort();

        verificationAbortControllerReference.current =
          null;

        resendAbortControllerReference.current =
          null;
      };
    },
    [],
  );

  const handleCodeChange =
    (
      event:
        ChangeEvent<HTMLInputElement>,
    ): void => {
      setCode(
        normalizeVerificationCode(
          event.target.value,
        ),
      );

      if (
        status === "ERROR"
        || status === "SUCCESS"
      ) {
        setStatus(
          "IDLE",
        );
      }

      if (errorMessage) {
        setErrorMessage(
          null,
        );
      }
    };

  const handleSubmit =
    async (
      event:
        FormEvent<HTMLFormElement>,
    ): Promise<void> => {
      event.preventDefault();

      if (controlsDisabled) {
        return;
      }

      if (
        verificationExpired
      ) {
        setStatus(
          "ERROR",
        );

        setErrorMessage(
          translations(
            "errors.expired",
          ),
        );

        return;
      }

      if (
        !VERIFICATION_CODE_PATTERN
          .test(code)
      ) {
        setStatus(
          "ERROR",
        );

        setErrorMessage(
          translations(
            "errors.invalidCode",
          ),
        );

        return;
      }

      verificationAbortControllerReference
        .current
        ?.abort();

      const abortController =
        new AbortController();

      verificationAbortControllerReference.current =
        abortController;

      setStatus(
        "VERIFYING",
      );

      setErrorMessage(
        null,
      );

      try {
        const result =
          await verifyUserEmail(
            {
              accountId:
                normalizedAccountId,

              code,

              locale:
                resolvedLocale,
            },
            {
              signal:
                abortController.signal,
            },
          );

        setCode(
          "",
        );

        setStatus(
          "SUCCESS",
        );

        stopVerificationCountdown();

        onSuccess?.(
          result,
        );

        if (!onSuccess) {
          setAuthenticationView(
            "USER_SIGN_IN",
          );
        }
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }

        setStatus(
          "ERROR",
        );

        setErrorMessage(
          getVerificationErrorMessage(
            error,
            translations(
              "errors.unknown",
            ),
          ),
        );
      } finally {
        if (
          verificationAbortControllerReference
            .current
          === abortController
        ) {
          verificationAbortControllerReference.current =
            null;
        }
      }
    };

  const handleResend =
    async (): Promise<void> => {
      if (resendDisabled) {
        return;
      }

      resendAbortControllerReference
        .current
        ?.abort();

      const abortController =
        new AbortController();

      resendAbortControllerReference.current =
        abortController;

      setStatus(
        "RESENDING",
      );

      setErrorMessage(
        null,
      );

      try {
        const result =
          await resendVerificationCode(
            {
              accountId:
                normalizedAccountId,

              locale:
                resolvedLocale,
            },
            {
              signal:
                abortController.signal,
            },
          );

        setCurrentVerificationExpiresAt(
          result.verificationExpiresAt,
        );

        setCurrentResendAvailableAt(
          result.resendAvailableAt,
        );

        setCode(
          "",
        );

        setStatus(
          "IDLE",
        );

        onResendSuccess?.(
          result,
        );
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }

        setStatus(
          "ERROR",
        );

        setErrorMessage(
          getVerificationErrorMessage(
            error,
            translations(
              "errors.resendFailed",
            ),
          ),
        );
      } finally {
        if (
          resendAbortControllerReference
            .current
          === abortController
        ) {
          resendAbortControllerReference.current =
            null;
        }
      }
    };

  const handleSignInRequest =
    (): void => {
      if (onRequestSignIn) {
        onRequestSignIn();
        return;
      }

      setAuthenticationView(
        "USER_SIGN_IN",
      );
    };

  const handleRegistrationRequest =
    (): void => {
      if (
        onRequestRegistration
      ) {
        onRequestRegistration();
        return;
      }

      setAuthenticationView(
        "USER_REGISTRATION",
      );
    };

  return (
    <form
      id={resolvedFormId}
      onSubmit={handleSubmit}
      aria-busy={busy}
      aria-describedby={
        errorMessage
          ? messageId
          : undefined
      }
      noValidate
    >
      <header>
        <h1>
          {translations(
            "title",
          )}
        </h1>

        <p>
          {translations(
            "description",
          )}
        </p>

        {username ? (
          <p>
            {username}
          </p>
        ) : null}

        <p>
          {email}
        </p>
      </header>

      <div>
        <label
          htmlFor={codeInputId}
        >
          {translations(
            "code.label",
          )}
        </label>

        <input
          id={codeInputId}
          name="verificationCode"
          type="text"
          inputMode="text"
          autoComplete="one-time-code"
          value={code}
          minLength={
            VERIFICATION_CODE_LENGTH
          }
          maxLength={
            VERIFICATION_CODE_LENGTH
          }
          pattern="[A-Z0-9]{6}"
          disabled={
            controlsDisabled
          }
          aria-invalid={
            Boolean(
              errorMessage,
            )
          }
          aria-describedby={
            verificationCountdownId
          }
          required
          onChange={
            handleCodeChange
          }
        />
      </div>

      <p
        id={
          verificationCountdownId
        }
        aria-live="polite"
      >
        {verificationExpired
          ? translations(
              "code.expired",
            )
          : translations(
              "code.expiresIn",
              {
                time:
                  verificationFormattedTime,
              },
            )}
      </p>

      {errorMessage ? (
        <p
          id={messageId}
          role="alert"
          aria-live="assertive"
        >
          {errorMessage}
        </p>
      ) : null}

      {status === "SUCCESS" ? (
        <p
          role="status"
          aria-live="polite"
        >
          {translations(
            "success",
          )}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={
          controlsDisabled
          || verificationExpired
        }
      >
        {verifying
          ? translations(
              "actions.verifying",
            )
          : translations(
              "actions.verify",
            )}
      </button>

      <button
        type="button"
        disabled={
          resendDisabled
        }
        onClick={
          () => {
            void handleResend();
          }
        }
      >
        {resending
          ? translations(
              "actions.resending",
            )
          : translations(
              "actions.resend",
            )}
      </button>

      {!resendExpired ? (
        <p
          id={resendCountdownId}
          aria-live="polite"
        >
          {translations(
            "resend.availableIn",
            {
              time:
                resendFormattedTime,
            },
          )}
        </p>
      ) : null}

      <p>
        {translations(
          "securityNotice",
        )}
      </p>

      <button
        type="button"
        disabled={
          controlsDisabled
        }
        onClick={
          handleSignInRequest
        }
      >
        {translations(
          "actions.signIn",
        )}
      </button>

      <button
        type="button"
        disabled={
          controlsDisabled
        }
        onClick={
          handleRegistrationRequest
        }
      >
        {translations(
          "actions.registerAgain",
        )}
      </button>
    </form>
  );
}