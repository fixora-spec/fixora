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
  Check,
  CircleAlert,
  LoaderCircle,
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

function normalizeAccountId(
  accountId: string,
): string | null {
  const normalizedAccountId =
    accountId.trim();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      normalizedAccountId,
    )
  ) {
    return null;
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
    normalizeAccountId(
      accountId,
    );

  const maskedEmail =
    maskEmailAddress(
      email,
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

  const mountedReference =
    useRef(false);

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
    || busy
    || status === "SUCCESS"
    || normalizedAccountId === null;

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
      mountedReference.current = true;

      return () => {
        mountedReference.current = false;

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

      if (disabled || busy || status === "SUCCESS") {
        return;
      }

      if (normalizedAccountId === null) {
        setStatus(
          "ERROR",
        );

        setErrorMessage(
          translations(
            "errors.unknown",
          ),
        );

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
        const [verificationOutcome] =
          await Promise.all([
            verifyUserEmail(
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
            getVerificationErrorMessage(
              verificationOutcome.error,
              translations(
                "errors.unknown",
              ),
            ),
          );

          return;
        }

        const {
          result,
        } = verificationOutcome;

        setCode(
          "",
        );

        setStatus(
          "SUCCESS",
        );

        stopVerificationCountdown();

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

        onSuccess?.(
          result,
        );

        if (!onSuccess) {
          setAuthenticationView(
            "USER_SIGN_IN",
          );
        }
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
      if (resendDisabled || normalizedAccountId === null) {
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

        if (
          !mountedReference.current
          || resendAbortControllerReference.current !== abortController
          || abortController.signal.aborted
        ) {
          return;
        }

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
        if (
          isAbortError(error)
          || !mountedReference.current
          || resendAbortControllerReference.current !== abortController
        ) {
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
      className={[
        "relative mx-auto flex w-[min(100%,25rem)] flex-col overflow-hidden",
        "rounded-[1.65rem] border border-[var(--fixora-otp-card-border)]",
        "bg-[var(--fixora-otp-card)] text-[var(--fixora-foreground)]",
        "px-[clamp(1rem,5vw,2.25rem)] py-[clamp(1.35rem,4.5vw,2.35rem)]",
        "shadow-[var(--fixora-otp-card-shadow)]",
      ].join(
        " ",
      )}
    >
      <span
        aria-hidden="true"
        className={[
          "pointer-events-none absolute -top-[4.2rem] -right-[4.1rem]",
          "size-[8.7rem] rounded-full",
          "border border-[var(--fixora-otp-decoration-border)]",
          "bg-[var(--fixora-otp-card)]",
          "shadow-[var(--fixora-otp-decoration-shadow)]",
        ].join(" ")}
      />

      <span
        aria-hidden="true"
        className={[
          "pointer-events-none absolute -bottom-[5.4rem] -left-[5.2rem]",
          "size-[10.4rem] rounded-full",
          "border border-[var(--fixora-otp-decoration-border)]",
          "bg-[var(--fixora-otp-card)]",
          "shadow-[var(--fixora-otp-decoration-shadow)]",
        ].join(" ")}
      />

      <header className="relative z-10 text-center">
        <h1 className="text-[clamp(1.15rem,5vw,1.55rem)] font-black tracking-[-0.035em]">
          {translations(
            "title",
          )}
        </h1>

        <p className="mx-auto mt-4 max-w-[19rem] text-[clamp(0.78rem,3.3vw,0.94rem)] leading-relaxed text-[var(--fixora-foreground-muted)]">
          {translations(
            "description",
          )}
        </p>

        {username ? (
          <p className="mt-1 text-[0.76rem] font-medium text-[var(--fixora-foreground-muted)]">
            {username}
          </p>
        ) : null}

        <p className="mt-1 break-all text-[clamp(0.88rem,3.7vw,1.02rem)] font-bold">
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
            status === "VERIFYING"
              ? "VERIFYING"
              : status === "SUCCESS"
                ? "SUCCESS"
                : status === "ERROR"
                  ? "ERROR"
                  : "IDLE"
          }
          disabled={controlsDisabled}
          aria-describedby={verificationCountdownId}
          aria-invalid={Boolean(errorMessage)}
          onCodeChange={handleCodeChange}
        />
      </div>

      <p
        id={verificationCountdownId}
        aria-live="polite"
        className="relative z-10 mt-3 text-center text-[0.7rem] text-[var(--fixora-foreground-muted)]"
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
          className="relative z-10 mt-3 flex items-start justify-center gap-2 text-center text-[0.76rem] font-medium text-[var(--fixora-danger)]"
        >
          <CircleAlert
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0"
            strokeWidth={1.9}
          />
          <span>{errorMessage}</span>
        </p>
      ) : null}

      {status === "SUCCESS" ? (
        <p
          role="status"
          aria-live="polite"
          className="relative z-10 mt-3 flex items-center justify-center gap-2 text-center text-[0.76rem] font-semibold text-[var(--fixora-green)]"
        >
          <Check
            aria-hidden="true"
            className="size-4"
            strokeWidth={2.3}
          />
          <span>
            {translations(
              "success",
            )}
          </span>
        </p>
      ) : null}

      <button
        type="submit"
        disabled={
          controlsDisabled
          || verificationExpired
        }
        className={[
          "relative z-10 mt-[clamp(1.35rem,5vw,2rem)] flex h-[3.15rem] w-full items-center justify-center gap-2",
          "rounded-[1rem] border border-[var(--fixora-otp-button-border)]",
          status === "SUCCESS"
            ? "bg-[linear-gradient(145deg,var(--fixora-green-light),var(--fixora-green-dark))] text-white shadow-[var(--fixora-otp-success-button-shadow)]"
            : "bg-[var(--fixora-otp-button)] shadow-[var(--fixora-otp-button-shadow)]",
          "text-[0.9rem] font-semibold",
          "transition-[transform,box-shadow,opacity] duration-200",
          "hover:-translate-y-px active:translate-y-0 active:scale-[0.99]",
          "disabled:pointer-events-none disabled:opacity-55",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fixora-green)]/40",
          "motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        ].join(" ")}
      >
        {verifying ? (
          <LoaderCircle
            aria-hidden="true"
            className="size-4 animate-spin motion-reduce:animate-none"
          />
        ) : status === "SUCCESS" ? (
          <Check
            aria-hidden="true"
            className="size-4"
            strokeWidth={2.2}
          />
        ) : null}

        <span>
          {verifying
            ? translations(
                "actions.verifying",
              )
            : translations(
                "actions.verify",
              )}
        </span>
      </button>

      <div className="relative z-10 mt-4 text-center">
        <button
          type="button"
          disabled={resendDisabled}
          onClick={
            () => {
              void handleResend();
            }
          }
          className="text-[0.78rem] font-semibold text-[var(--fixora-green)] transition-opacity hover:opacity-75 disabled:pointer-events-none disabled:opacity-40"
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
            className="mt-1.5 text-[0.68rem] text-[var(--fixora-foreground-muted)]"
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
          onClick={handleSignInRequest}
          className="font-medium text-[var(--fixora-foreground-muted)] transition-colors hover:text-[var(--fixora-green)] disabled:pointer-events-none disabled:opacity-40"
        >
          {translations(
            "actions.signIn",
          )}
        </button>

        <button
          type="button"
          disabled={controlsDisabled}
          onClick={handleRegistrationRequest}
          className="font-medium text-[var(--fixora-foreground-muted)] transition-colors hover:text-[var(--fixora-green)] disabled:pointer-events-none disabled:opacity-40"
        >
          {translations(
            "actions.registerAgain",
          )}
        </button>
      </div>
    </form>
  );
}