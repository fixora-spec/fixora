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
  requestPasswordReset,
  verifyPasswordResetCode,
} from "@/services/auth";

import type {
  Locale,
} from "@/types/locale";

import type {
  PasswordRecoveryFormProps,
  PasswordRecoveryFormStatus,
  PasswordRecoveryFormStep,
} from "./PasswordRecoveryForm.types";

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

function normalizeEmail(
  value: string,
): string {
  return value
    .trim()
    .normalize("NFC")
    .toLowerCase();
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

function isEmailValid(
  value: string,
): boolean {
  return (
    value.length >= 5
    && value.length <= 320
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u
      .test(value)
  );
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

function getRecoveryErrorMessage(
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

export function PasswordRecoveryForm({
  formId,
  locale,
  accountRole = "USER",
  initialEmail = "",
  initialCode = "",
  initialStep = "REQUEST_CODE",
  disabled = false,
  onCodeRequested,
  onCodeVerified,
  onRequestPasswordReset,
  onRequestSignIn,
}: PasswordRecoveryFormProps) {
  const translations =
    useTranslations(
      "auth.passwordRecovery",
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
    ?? `password-recovery-form-${generatedFormId}`;

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

  const [
    step,
    setStep,
  ] = useState<
    PasswordRecoveryFormStep
  >(
    initialStep,
  );

  const [
    status,
    setStatus,
  ] = useState<
    PasswordRecoveryFormStatus
  >(
    "IDLE",
  );

  const [
    email,
    setEmail,
  ] = useState(
    () =>
      initialEmail,
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
    codeExpiresAt,
    setCodeExpiresAt,
  ] = useState<
    string | null
  >(
    null,
  );

  const [
    resendAvailableAt,
    setResendAvailableAt,
  ] = useState<
    string | null
  >(
    null,
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
    informationMessage,
    setInformationMessage,
  ] = useState<
    string | null
  >(
    null,
  );

  const {
    formattedTime:
      expirationFormattedTime,

    isExpired:
      codeExpired,

    start:
      startExpirationCountdown,

    stop:
      stopExpirationCountdown,
  } = useVerificationCountdown(
    0,
  );

  const {
    formattedTime:
      resendFormattedTime,

    isExpired:
      resendAvailable,

    start:
      startResendCountdown,

    stop:
      stopResendCountdown,
  } = useVerificationCountdown(
    0,
  );

  const requestAbortControllerReference =
    useRef<
      AbortController | null
    >(
      null,
    );

  const verificationAbortControllerReference =
    useRef<
      AbortController | null
    >(
      null,
    );

  const requestingCode =
    status === "REQUESTING_CODE";

  const verifyingCode =
    status === "VERIFYING_CODE";

  const busy =
    requestingCode
    || verifyingCode;

  const controlsDisabled =
    disabled
    || busy;

  const normalizedEmail =
    normalizeEmail(
      email,
    );

  const emailInputId =
    `${resolvedFormId}-email`;

  const codeInputId =
    `${resolvedFormId}-code`;

  const messageId =
    `${resolvedFormId}-message`;

  const expirationMessageId =
    `${resolvedFormId}-expiration`;

  const resendMessageId =
    `${resolvedFormId}-resend`;

  useEffect(
    () => {
      if (
        step !== "VERIFY_CODE"
      ) {
        return undefined;
      }

      const timeoutIdentifier =
        window.setTimeout(
          () => {
            startExpirationCountdown(
              getRemainingSeconds(
                codeExpiresAt,
              ),
            );

            startResendCountdown(
              getRemainingSeconds(
                resendAvailableAt,
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
      step,
      codeExpiresAt,
      resendAvailableAt,
      startExpirationCountdown,
      startResendCountdown,
    ],
  );

  useEffect(
    () => {
      return () => {
        requestAbortControllerReference
          .current
          ?.abort();

        verificationAbortControllerReference
          .current
          ?.abort();

        requestAbortControllerReference.current =
          null;

        verificationAbortControllerReference.current =
          null;
      };
    },
    [],
  );

  const clearMessages =
    (): void => {
      setErrorMessage(
        null,
      );

      setInformationMessage(
        null,
      );

      if (
        status === "ERROR"
        || status === "CODE_SENT"
        || status === "CODE_VERIFIED"
      ) {
        setStatus(
          "IDLE",
        );
      }
    };

  const handleEmailChange =
    (
      event:
        ChangeEvent<HTMLInputElement>,
    ): void => {
      setEmail(
        event.target.value,
      );

      clearMessages();
    };

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

      clearMessages();
    };

  const sendRecoveryCode =
    async (): Promise<boolean> => {
      if (
        controlsDisabled
      ) {
        return false;
      }

      if (
        !isEmailValid(
          normalizedEmail,
        )
      ) {
        setStatus(
          "ERROR",
        );

        setErrorMessage(
          translations(
            "errors.invalidEmail",
          ),
        );

        return false;
      }

      requestAbortControllerReference
        .current
        ?.abort();

      const abortController =
        new AbortController();

      requestAbortControllerReference.current =
        abortController;

      setStatus(
        "REQUESTING_CODE",
      );

      setErrorMessage(
        null,
      );

      setInformationMessage(
        null,
      );

      try {
        const result =
          await requestPasswordReset(
            {
              email:
                normalizedEmail,

              accountRole,

              locale:
                resolvedLocale,
            },
            {
              signal:
                abortController.signal,
            },
          );

        setCodeExpiresAt(
          result.expiresAt,
        );

        setResendAvailableAt(
          result.resendAvailableAt,
        );

        setCode(
          "",
        );

        setStep(
          "VERIFY_CODE",
        );

        setStatus(
          "CODE_SENT",
        );

        setInformationMessage(
          translations(
            "messages.codeRequested",
          ),
        );

        onCodeRequested?.(
          result,
        );

        return true;
      } catch (error) {
        if (isAbortError(error)) {
          return false;
        }

        setStatus(
          "ERROR",
        );

        setErrorMessage(
          getRecoveryErrorMessage(
            error,
            translations(
              "errors.requestFailed",
            ),
          ),
        );

        return false;
      } finally {
        if (
          requestAbortControllerReference.current
          === abortController
        ) {
          requestAbortControllerReference.current =
            null;
        }
      }
    };

  const handleRequestSubmit =
    async (
      event:
        FormEvent<HTMLFormElement>,
    ): Promise<void> => {
      event.preventDefault();

      await sendRecoveryCode();
    };

  const handleVerifySubmit =
    async (
      event:
        FormEvent<HTMLFormElement>,
    ): Promise<void> => {
      event.preventDefault();

      if (
        controlsDisabled
      ) {
        return;
      }

      if (
        !isEmailValid(
          normalizedEmail,
        )
      ) {
        setStatus(
          "ERROR",
        );

        setErrorMessage(
          translations(
            "errors.invalidEmail",
          ),
        );

        return;
      }

      if (
        codeExpiresAt !== null
        && codeExpired
      ) {
        setStatus(
          "ERROR",
        );

        setErrorMessage(
          translations(
            "errors.codeExpired",
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
        "VERIFYING_CODE",
      );

      setErrorMessage(
        null,
      );

      setInformationMessage(
        null,
      );

      try {
        const result =
          await verifyPasswordResetCode(
            {
              email:
                normalizedEmail,

              accountRole,

              code,

              locale:
                resolvedLocale,
            },
            {
              signal:
                abortController.signal,
            },
          );

        stopExpirationCountdown();
        stopResendCountdown();

        setCode(
          "",
        );

        setStatus(
          "CODE_VERIFIED",
        );

        setInformationMessage(
          translations(
            "messages.codeVerified",
          ),
        );

        onCodeVerified?.(
          result,
        );

        onRequestPasswordReset?.(
          result,
        );

        if (
          !onRequestPasswordReset
        ) {
          setAuthenticationView(
            "PASSWORD_RESET",
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
          getRecoveryErrorMessage(
            error,
            translations(
              "errors.verificationFailed",
            ),
          ),
        );
      } finally {
        if (
          verificationAbortControllerReference.current
          === abortController
        ) {
          verificationAbortControllerReference.current =
            null;
        }
      }
    };

  const handleResend =
    async (): Promise<void> => {
      if (
        controlsDisabled
        || !resendAvailable
      ) {
        return;
      }

      await sendRecoveryCode();
    };

  const handleChangeEmail =
    (): void => {
      requestAbortControllerReference
        .current
        ?.abort();

      verificationAbortControllerReference
        .current
        ?.abort();

      stopExpirationCountdown();
      stopResendCountdown();

      setCode(
        "",
      );

      setCodeExpiresAt(
        null,
      );

      setResendAvailableAt(
        null,
      );

      setStep(
        "REQUEST_CODE",
      );

      setStatus(
        "IDLE",
      );

      setErrorMessage(
        null,
      );

      setInformationMessage(
        null,
      );
    };

  const handleSignInRequest =
    (): void => {
      if (onRequestSignIn) {
        onRequestSignIn();
        return;
      }

      setAuthenticationView(
        accountRole === "ADMIN"
          ? "ADMIN_SIGN_IN"
          : "USER_SIGN_IN",
      );
    };

  if (
    step === "REQUEST_CODE"
  ) {
    return (
      <form
        id={resolvedFormId}
        onSubmit={
          handleRequestSubmit
        }
        aria-busy={
          requestingCode
        }
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
              "request.title",
            )}
          </h1>

          <p>
            {translations(
              "request.description",
            )}
          </p>
        </header>

        <div>
          <label
            htmlFor={
              emailInputId
            }
          >
            {translations(
              "email.label",
            )}
          </label>

          <input
            id={emailInputId}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            disabled={
              controlsDisabled
            }
            required
            onChange={
              handleEmailChange
            }
          />
        </div>

        {errorMessage ? (
          <p
            id={messageId}
            role="alert"
            aria-live="assertive"
          >
            {errorMessage}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={
            controlsDisabled
          }
        >
          {requestingCode
            ? translations(
                "actions.requesting",
              )
            : translations(
                "actions.requestCode",
              )}
        </button>

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
      </form>
    );
  }

  return (
    <form
      id={resolvedFormId}
      onSubmit={
        handleVerifySubmit
      }
      aria-busy={
        busy
      }
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
            "verification.title",
          )}
        </h1>

        <p>
          {translations(
            "verification.description",
          )}
        </p>

        <p>
          {normalizedEmail}
        </p>
      </header>

      <div>
        <label
          htmlFor={
            codeInputId
          }
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
          required
          onChange={
            handleCodeChange
          }
        />
      </div>

      {codeExpiresAt ? (
        <p
          id={
            expirationMessageId
          }
          aria-live="polite"
        >
          {codeExpired
            ? translations(
                "verification.expired",
              )
            : translations(
                "verification.expiresIn",
                {
                  time:
                    expirationFormattedTime,
                },
              )}
        </p>
      ) : null}

      {informationMessage ? (
        <p
          role="status"
          aria-live="polite"
        >
          {informationMessage}
        </p>
      ) : null}

      {errorMessage ? (
        <p
          id={messageId}
          role="alert"
          aria-live="assertive"
        >
          {errorMessage}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={
          controlsDisabled
          || (
            codeExpiresAt !== null
            && codeExpired
          )
        }
      >
        {verifyingCode
          ? translations(
              "actions.verifying",
            )
          : translations(
              "actions.verifyCode",
            )}
      </button>

      <button
        type="button"
        disabled={
          controlsDisabled
          || !resendAvailable
        }
        onClick={
          () => {
            void handleResend();
          }
        }
      >
        {requestingCode
          ? translations(
              "actions.requesting",
            )
          : translations(
              "actions.resendCode",
            )}
      </button>

      {!resendAvailable ? (
        <p
          id={resendMessageId}
          aria-live="polite"
        >
          {translations(
            "verification.resendAvailableIn",
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
          handleChangeEmail
        }
      >
        {translations(
          "actions.changeEmail",
        )}
      </button>

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
    </form>
  );
}