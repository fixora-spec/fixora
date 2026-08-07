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
  CircleAlert,
  LoaderCircle,
  Mail,
  ShieldCheck,
} from "lucide-react";

import {
  VerificationCodeField,
} from "@/components/molecules/verification-code-field";

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

const VERIFICATION_ANIMATION_MINIMUM_MILLISECONDS =
  3000;

const VERIFICATION_SUCCESS_HOLD_MILLISECONDS =
  1400;

function waitForMilliseconds(
  duration: number,
): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(
      resolve,
      duration,
    );
  });
}

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
    error instanceof Error
    && error.name === "AbortError"
  );
}

const FALLBACK_CODE_TTL_MILLISECONDS = 10 * 60 * 1_000;
const FALLBACK_RESEND_DELAY_MILLISECONDS = 60 * 1_000;

function getCurrentTimestamp(): number {
  return Date.now();
}

function normalizeEmail(
  value: string,
): string {
  return value
    .trim()
    .normalize("NFC")
    .toLowerCase();
}

function maskEmailAddress(
  value: string,
): string {
  const normalizedEmail =
    value.trim();

  const separatorIndex =
    normalizedEmail.lastIndexOf("@");

  if (
    separatorIndex <= 0
    || separatorIndex === normalizedEmail.length - 1
  ) {
    return normalizedEmail;
  }

  const localPart =
    normalizedEmail.slice(
      0,
      separatorIndex,
    );

  const domain =
    normalizedEmail.slice(
      separatorIndex + 1,
    );

  const visibleCharacterCount =
    Math.min(
      3,
      Math.max(
        1,
        localPart.length,
      ),
    );

  return `${localPart.slice(0, visibleCharacterCount)}***@${domain}`;
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
  if (
    value.length < 5
    || value.length > 320
    || /[\s\r\n\0]/u.test(value)
  ) {
    return false;
  }

  const separatorIndex = value.lastIndexOf("@");

  if (
    separatorIndex <= 0
    || separatorIndex > 64
    || separatorIndex === value.length - 1
    || value.indexOf("@") !== separatorIndex
  ) {
    return false;
  }

  const localPart = value.slice(0, separatorIndex);
  const domain = value.slice(separatorIndex + 1);

  return (
    !localPart.startsWith(".")
    && !localPart.endsWith(".")
    && !localPart.includes("..")
    && domain.length <= 255
    && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))+$/iu.test(
      domain,
    )
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

  const [
    rateLimitMessage,
    setRateLimitMessage,
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

  const {
    remainingSeconds:
      requestRateLimitRemainingSeconds,

    formattedTime:
      requestRateLimitFormattedTime,

    start:
      startRequestRateLimitCountdown,

    stop:
      stopRequestRateLimitCountdown,
  } = useVerificationCountdown(
    0,
  );

  const mountedReference =
    useRef(false);

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
    || busy
    || status === "CODE_VERIFIED";

  const requestRateLimited =
    requestRateLimitRemainingSeconds > 0;

  const normalizedEmail =
    normalizeEmail(
      email,
    );

  const maskedEmail =
    maskEmailAddress(
      normalizedEmail,
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
      mountedReference.current = true;

      return () => {
        mountedReference.current = false;

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
      eventOrCode:
        ChangeEvent<HTMLInputElement>
        | string,
    ): void => {
      const nextValue =
        typeof eventOrCode === "string"
          ? eventOrCode
          : eventOrCode.target.value;

      setCode(
        normalizeVerificationCode(
          nextValue,
        ),
      );

      clearMessages();
    };

  const sendRecoveryCode =
    async (): Promise<boolean> => {
      if (
        controlsDisabled
        || requestRateLimited
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

      setRateLimitMessage(
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

        if (
          !mountedReference.current
          || requestAbortControllerReference.current !== abortController
          || abortController.signal.aborted
        ) {
          return false;
        }

        const responseReceivedAt = getCurrentTimestamp();

        setCodeExpiresAt(
          result.expiresAt
          ?? new Date(
            responseReceivedAt + FALLBACK_CODE_TTL_MILLISECONDS,
          ).toISOString(),
        );

        setResendAvailableAt(
          result.resendAvailableAt
          ?? new Date(
            responseReceivedAt + FALLBACK_RESEND_DELAY_MILLISECONDS,
          ).toISOString(),
        );

        stopRequestRateLimitCountdown();

        setRateLimitMessage(
          null,
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
        if (
          isAbortError(error)
          || !mountedReference.current
          || requestAbortControllerReference.current !== abortController
        ) {
          return false;
        }

        if (
          isAuthApiClientError(
            error,
          )
          && error.code === "RATE_LIMITED"
          && error.retryAfterSeconds !== null
          && error.retryAfterSeconds > 0
        ) {
          setStatus(
            "ERROR",
          );

          setErrorMessage(
            null,
          );

          setInformationMessage(
            null,
          );

          setRateLimitMessage(
            error.message,
          );

          startRequestRateLimitCountdown(
            Math.min(
              86_400,
              Math.max(
                1,
                Math.ceil(
                  error.retryAfterSeconds,
                ),
              ),
            ),
          );

          return false;
        }

        setStatus(
          "ERROR",
        );

        setRateLimitMessage(
          null,
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
        const [verificationOutcome] =
          await Promise.all([
            verifyPasswordResetCode(
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
            ).then(
              (result) => ({
                ok: true as const,
                result,
              }),
              (error: unknown) => ({
                ok: false as const,
                error,
              }),
            ),
            waitForMilliseconds(
              VERIFICATION_ANIMATION_MINIMUM_MILLISECONDS,
            ),
          ]);

        if (
          !mountedReference.current
          || verificationAbortControllerReference.current !== abortController
          || abortController.signal.aborted
        ) {
          return;
        }

        if (!verificationOutcome.ok) {
          if (
            isAbortError(
              verificationOutcome.error,
            )
          ) {
            return;
          }

          setStatus(
            "ERROR",
          );

          setErrorMessage(
            getRecoveryErrorMessage(
              verificationOutcome.error,
              translations(
                "errors.verificationFailed",
              ),
            ),
          );

          return;
        }

        const {
          result,
        } = verificationOutcome;

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

        await waitForMilliseconds(
          VERIFICATION_SUCCESS_HOLD_MILLISECONDS,
        );

        if (
          !mountedReference.current
          || verificationAbortControllerReference.current !== abortController
          || abortController.signal.aborted
        ) {
          return;
        }

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
        || requestRateLimited
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
        onSubmit={handleRequestSubmit}
        aria-busy={requestingCode}
        aria-describedby={
          errorMessage
          || requestRateLimited
            ? messageId
            : undefined
        }
        noValidate
        className={[
          "relative mx-auto flex w-[min(100%,25rem)] flex-col overflow-hidden",
          "rounded-[1.65rem] border border-[var(--fixora-otp-card-border)]",
          "bg-[var(--fixora-otp-card)] text-[var(--fixora-foreground)]",
          "px-[clamp(1rem,5vw,2.25rem)] py-[clamp(1.35rem,4.5vw,2.35rem)]",
          "shadow-[var(--fixora-otp-card-shadow)]",
        ].join(" ")}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-[4.2rem] -right-[4.1rem] size-[8.7rem] rounded-full border border-[var(--fixora-otp-decoration-border)] bg-[var(--fixora-otp-card)] shadow-[var(--fixora-otp-decoration-shadow)]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-[5.4rem] -left-[5.2rem] size-[10.4rem] rounded-full border border-[var(--fixora-otp-decoration-border)] bg-[var(--fixora-otp-card)] shadow-[var(--fixora-otp-decoration-shadow)]"
        />

        <header className="relative z-10 text-center">
          <span className="mx-auto flex size-10 items-center justify-center rounded-full border border-[var(--fixora-otp-card-border)] bg-[var(--fixora-otp-surface-muted)] text-[var(--fixora-green)] shadow-[var(--fixora-otp-box-shadow)]">
            <Mail
              aria-hidden="true"
              className="size-[1.05rem]"
              strokeWidth={1.8}
            />
          </span>

          <h1 className="mt-4 text-[clamp(1.1rem,5vw,1.48rem)] font-black tracking-[-0.035em]">
            {translations(
              "request.title",
            )}
          </h1>

          <p className="mx-auto mt-3 max-w-[19rem] text-[clamp(0.76rem,3.2vw,0.9rem)] leading-relaxed text-[var(--fixora-foreground-muted)]">
            {translations(
              "request.description",
            )}
          </p>
        </header>

        <div className="relative z-10 mt-6">
          <label
            htmlFor={emailInputId}
            className="mb-2 block text-[0.72rem] font-semibold text-[var(--fixora-foreground-muted)]"
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
            maxLength={320}
            value={email}
            disabled={controlsDisabled}
            required
            onChange={handleEmailChange}
            className={[
              "fixora-auth-email-input h-12 w-full rounded-[0.9rem] border border-[var(--fixora-otp-border)]",
              "bg-[var(--fixora-auth-email-bg)] px-4 text-[0.88rem] text-[var(--fixora-foreground)] outline-none",
              "shadow-[var(--fixora-otp-box-shadow)]",
              "transition-[border-color,box-shadow] duration-200",
              "focus:border-[var(--fixora-otp-active-border)] focus:shadow-[var(--fixora-otp-active-shadow)]",
              "disabled:opacity-55",
            ].join(" ")}
          />
        </div>

        {errorMessage ? (
          <p
            id={messageId}
            role="alert"
            aria-live="assertive"
            className="relative z-10 mt-3 flex items-start justify-center gap-2 text-center text-[0.75rem] font-medium text-[var(--fixora-danger)]"
          >
            <CircleAlert
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
              strokeWidth={1.9}
            />
            <span>{errorMessage}</span>
          </p>
        ) : null}

        {requestRateLimited
          && rateLimitMessage ? (
          <p
            id={messageId}
            role="alert"
            aria-live="polite"
            className="relative z-10 mt-3 text-center text-[0.72rem] font-medium text-[var(--fixora-danger)]"
          >
            {rateLimitMessage}
            {" "}
            {resolvedLocale === "en"
              ? `Try again in ${requestRateLimitFormattedTime}.`
              : `Podrás intentarlo nuevamente en ${requestRateLimitFormattedTime}.`}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={
            controlsDisabled
            || requestRateLimited
          }
          className="relative z-10 mt-6 flex h-[3.15rem] w-full items-center justify-center gap-2 rounded-[1rem] border border-[var(--fixora-otp-button-border)] bg-[var(--fixora-otp-button)] text-[0.88rem] font-semibold shadow-[var(--fixora-otp-button-shadow)] transition-[transform,box-shadow,opacity] duration-200 hover:-translate-y-px active:translate-y-0 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
        >
          {requestingCode ? (
            <LoaderCircle
              aria-hidden="true"
              className="size-4 animate-spin motion-reduce:animate-none"
            />
          ) : null}
          <span>
            {requestingCode
              ? translations(
                  "actions.requesting",
                )
              : translations(
                  "actions.requestCode",
                )}
          </span>
        </button>

        <button
          type="button"
          disabled={controlsDisabled}
          onClick={handleSignInRequest}
          className="relative z-10 mt-4 text-center text-[0.7rem] font-medium text-[var(--fixora-foreground-muted)] transition-colors hover:text-[var(--fixora-green)] disabled:pointer-events-none disabled:opacity-40"
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
      onSubmit={handleVerifySubmit}
      aria-busy={busy}
      aria-describedby={
        errorMessage
        || requestRateLimited
          ? messageId
          : undefined
      }
      noValidate
      className={[
        "relative mx-auto flex w-[min(100%,25rem)] flex-col overflow-hidden",
        "rounded-[1.65rem] border border-[var(--fixora-otp-card-border)]",
        "bg-[var(--fixora-otp-card)] text-[var(--fixora-foreground)]",
        "px-[clamp(1rem,5vw,2.25rem)] py-[clamp(1.35rem,4.5vw,2.35rem)]",
        "shadow-[var(--fixora-otp-card-shadow)]",
      ].join(" ")}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-[4.2rem] -right-[4.1rem] size-[8.7rem] rounded-full border border-[var(--fixora-otp-decoration-border)] bg-[var(--fixora-otp-card)] shadow-[var(--fixora-otp-decoration-shadow)]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-[5.4rem] -left-[5.2rem] size-[10.4rem] rounded-full border border-[var(--fixora-otp-decoration-border)] bg-[var(--fixora-otp-card)] shadow-[var(--fixora-otp-decoration-shadow)]"
      />

      <header className="relative z-10 text-center">
        <h1 className="text-[clamp(1.15rem,5vw,1.55rem)] font-black tracking-[-0.035em]">
          {translations(
            "verification.title",
          )}
        </h1>

        <p className="mx-auto mt-4 max-w-[19rem] text-[clamp(0.78rem,3.3vw,0.94rem)] leading-relaxed text-[var(--fixora-foreground-muted)]">
          {translations(
            "verification.description",
          )}
        </p>

        <p className="mt-2 break-all text-[clamp(0.88rem,3.7vw,1.02rem)] font-bold">
          {maskedEmail}
        </p>
      </header>

      <div className="relative z-10 mt-[clamp(1.5rem,6vw,2.25rem)]">
        <VerificationCodeField
          fieldId={codeInputId}
          name="verificationCode"
          label={translations(
            "code.label",
          )}
          code={code}
          codeLength={6}
          autoFocus
          visualState={
            verifyingCode
              ? "VERIFYING"
              : status === "CODE_VERIFIED"
                ? "SUCCESS"
                : status === "ERROR"
                  ? "ERROR"
                  : "IDLE"
          }
          disabled={controlsDisabled}
          onCodeChange={handleCodeChange}
        />
      </div>

      {codeExpiresAt ? (
        <p
          id={expirationMessageId}
          aria-live="polite"
          className="relative z-10 mt-3 text-center text-[0.7rem] text-[var(--fixora-foreground-muted)]"
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
          className="relative z-10 mt-3 text-center text-[0.72rem] font-medium text-[var(--fixora-green)]"
        >
          {informationMessage}
        </p>
      ) : null}

      {errorMessage ? (
        <p
          id={messageId}
          role="alert"
          aria-live="assertive"
          className="relative z-10 mt-3 flex items-start justify-center gap-2 text-center text-[0.75rem] font-medium text-[var(--fixora-danger)]"
        >
          <CircleAlert
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0"
            strokeWidth={1.9}
          />
          <span>{errorMessage}</span>
        </p>
      ) : null}

      {requestRateLimited
        && rateLimitMessage ? (
        <p
          id={messageId}
          role="alert"
          aria-live="polite"
          className="relative z-10 mt-3 text-center text-[0.72rem] font-medium text-[var(--fixora-danger)]"
        >
          {rateLimitMessage}
          {" "}
          {resolvedLocale === "en"
            ? `Try again in ${requestRateLimitFormattedTime}.`
            : `Podrás intentarlo nuevamente en ${requestRateLimitFormattedTime}.`}
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
        className="relative z-10 mt-[clamp(1.25rem,5vw,1.8rem)] flex h-[3.15rem] w-full items-center justify-center gap-2 rounded-[1rem] border border-[var(--fixora-otp-button-border)] bg-[var(--fixora-otp-button)] text-[0.88rem] font-semibold shadow-[var(--fixora-otp-button-shadow)] transition-[transform,box-shadow,opacity] duration-200 hover:-translate-y-px active:translate-y-0 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        {verifyingCode ? (
          <LoaderCircle
            aria-hidden="true"
            className="size-4 animate-spin motion-reduce:animate-none"
          />
        ) : null}
        <span>
          {verifyingCode
            ? translations(
                "actions.verifying",
              )
            : translations(
                "actions.verifyCode",
              )}
        </span>
      </button>

      <div className="relative z-10 mt-4 text-center">
        <button
          type="button"
          disabled={
            controlsDisabled
            || requestRateLimited
            || !resendAvailable
          }
          onClick={
            () => {
              void handleResend();
            }
          }
          className="text-[0.78rem] font-semibold text-[var(--fixora-green)] transition-opacity hover:opacity-75 disabled:pointer-events-none disabled:opacity-40"
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
            className="mt-1.5 text-[0.68rem] text-[var(--fixora-foreground-muted)]"
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
      </div>

      <p className="relative z-10 mt-4 flex items-start justify-center gap-2 text-center text-[0.64rem] leading-relaxed text-[var(--fixora-foreground-muted)]">
        <ShieldCheck
          aria-hidden="true"
          className="mt-0.5 size-3.5 shrink-0 text-[var(--fixora-green)]"
          strokeWidth={1.8}
        />
        <span>
          {translations(
            "securityNotice",
          )}
        </span>
      </p>

      <div className="relative z-10 mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[0.68rem]">
        <button
          type="button"
          disabled={controlsDisabled}
          onClick={handleChangeEmail}
          className="font-medium text-[var(--fixora-foreground-muted)] transition-colors hover:text-[var(--fixora-green)] disabled:pointer-events-none disabled:opacity-40"
        >
          {translations(
            "actions.changeEmail",
          )}
        </button>

        <button
          type="button"
          disabled={controlsDisabled}
          onClick={handleSignInRequest}
          className="font-medium text-[var(--fixora-foreground-muted)] transition-colors hover:text-[var(--fixora-green)] disabled:pointer-events-none disabled:opacity-40"
        >
          {translations(
            "actions.signIn",
          )}
        </button>
      </div>
    </form>
  );
}