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
  LoaderCircle,
  LockKeyhole,
  Mail,
  ScanEye,
  ShieldCheck,
  UserPlus,
} from "lucide-react";

import {
  useLocale,
  useTranslations,
} from "next-intl";

import {
  useAuth,
} from "@/providers/auth-provider";

import {
  isAuthApiClientError,
  signInUser,
} from "@/services/auth";

import type {
  Locale,
} from "@/types/locale";

import {
  cn,
} from "@/utils/cn";

import type {
  UserSignInFormProps,
  UserSignInFormStatus,
} from "./UserSignInForm.types";

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

function getSignInErrorMessage(
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

export function UserSignInForm({
  formId,
  locale,
  disabled = false,
  onSuccess,
  onRequestRegistration,
  onRequestPasswordRecovery,
  onRequestAdminSignIn,
}: UserSignInFormProps) {
  const translations =
    useTranslations(
      "auth.userSignIn",
    );

  const currentLocale =
    useLocale();

  const {
    applyAuthenticatedSession,
    setAuthenticationView,
  } = useAuth();

  const generatedFormId =
    useId();

  const resolvedFormId =
    formId
    ?? `user-sign-in-form-${generatedFormId}`;

  const formReference =
    useRef<HTMLFormElement | null>(
      null,
    );

  const abortControllerReference =
    useRef<AbortController | null>(
      null,
    );

  const resolvedLocale: Locale =
    locale
    ?? (
      isSupportedLocale(
        currentLocale,
      )
        ? currentLocale
        : "es"
    );

  const [
    email,
    setEmail,
  ] = useState(
    "",
  );

  const [
    password,
    setPassword,
  ] = useState(
    "",
  );

  const [
    passwordVisible,
    setPasswordVisible,
  ] = useState(
    false,
  );

  const [
    status,
    setStatus,
  ] = useState<UserSignInFormStatus>(
    "IDLE",
  );

  const [
    errorMessage,
    setErrorMessage,
  ] = useState<string | null>(
    null,
  );

  const submitting =
    status === "SUBMITTING";

  const controlsDisabled =
    disabled
    || submitting;

  const emailInputId =
    `${resolvedFormId}-email`;

  const passwordInputId =
    `${resolvedFormId}-password`;

  const messageId =
    `${resolvedFormId}-message`;

  const showPasswordLabel =
    resolvedLocale === "es"
      ? "Mostrar contraseña"
      : "Show password";

  const hidePasswordLabel =
    resolvedLocale === "es"
      ? "Ocultar contraseña"
      : "Hide password";

  useEffect(
    () => {
      const timeoutIdentifiers: number[] = [];

      const clearSavedCredentials =
        (): void => {
          const formElement =
            formReference.current;

          if (
            formElement
            && formElement.contains(
              document.activeElement,
            )
          ) {
            return;
          }

          setEmail(
            "",
          );

          setPassword(
            "",
          );

          setPasswordVisible(
            false,
          );

          formElement?.reset();
        };

      const scheduleCredentialClearing =
        (): void => {
          for (const delay of [0, 100, 500, 1_500]) {
            timeoutIdentifiers.push(
              window.setTimeout(
                clearSavedCredentials,
                delay,
              ),
            );
          }
        };

      const handlePageShow =
        (): void => {
          scheduleCredentialClearing();
        };

      scheduleCredentialClearing();

      window.addEventListener(
        "pageshow",
        handlePageShow,
      );

      return () => {
        window.removeEventListener(
          "pageshow",
          handlePageShow,
        );

        for (const timeoutIdentifier of timeoutIdentifiers) {
          window.clearTimeout(
            timeoutIdentifier,
          );
        }
      };
    },
    [],
  );

  useEffect(
    () => {
      return () => {
        abortControllerReference
          .current
          ?.abort();

        abortControllerReference.current =
          null;
      };
    },
    [],
  );

  const clearError =
    (): void => {
      if (
        status === "ERROR"
      ) {
        setStatus(
          "IDLE",
        );
      }

      if (
        errorMessage !== null
      ) {
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

      if (
        controlsDisabled
      ) {
        return;
      }

      const normalizedEmail =
        email
          .trim()
          .toLowerCase();

      if (
        normalizedEmail.length === 0
        || password.length === 0
      ) {
        setStatus(
          "ERROR",
        );

        setErrorMessage(
          translations(
            "errors.requiredFields",
          ),
        );

        return;
      }

      abortControllerReference
        .current
        ?.abort();

      const abortController =
        new AbortController();

      abortControllerReference.current =
        abortController;

      setStatus(
        "SUBMITTING",
      );

      setErrorMessage(
        null,
      );

      try {
        const result =
          await signInUser(
            {
              email:
                normalizedEmail,

              password,

              locale:
                resolvedLocale,
            },
            {
              signal:
                abortController.signal,
            },
          );

        applyAuthenticatedSession({
          account:
            result.account,

          expiresAt:
            result.session.expiresAt,
        });

        setEmail(
          "",
        );

        setPassword(
          "",
        );

        setPasswordVisible(
          false,
        );

        setStatus(
          "SUCCESS",
        );

        formReference.current
          ?.reset();

        onSuccess?.(
          result,
        );
      } catch (error) {
        if (
          isAbortError(
            error,
          )
        ) {
          return;
        }

        setStatus(
          "ERROR",
        );

        setErrorMessage(
          getSignInErrorMessage(
            error,
            translations(
              "errors.unknown",
            ),
          ),
        );
      } finally {
        if (
          abortControllerReference.current
          === abortController
        ) {
          abortControllerReference.current =
            null;
        }
      }
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

  const handlePasswordRecoveryRequest =
    (): void => {
      if (
        onRequestPasswordRecovery
      ) {
        onRequestPasswordRecovery();

        return;
      }

      setAuthenticationView(
        "PASSWORD_RECOVERY",
      );
    };

  const handleAdminSignInRequest =
    (): void => {
      if (
        onRequestAdminSignIn
      ) {
        onRequestAdminSignIn();

        return;
      }

      setAuthenticationView(
        "ADMIN_SIGN_IN",
      );
    };

  const inputClassName =
    cn(
      "h-11 w-full rounded-full",
      "border border-black/15",
      "bg-[var(--fixora-surface-muted)]",
      "pl-10",
      "text-[0.8rem]",
      "text-[var(--fixora-foreground)]",

      "shadow-[inset_7px_8px_16px_rgba(42,49,42,0.18),inset_-6px_-6px_14px_rgba(255,255,255,0.88)]",

      "outline-none",

      "placeholder:text-[var(--fixora-foreground-muted)]/70",

      "transition-[border-color,box-shadow,background-color]",
      "duration-200",

      "hover:border-[#4ead35]/50",

      "focus:border-[#4ead35]/75",
      "focus:bg-[var(--fixora-surface)]",

      "focus:shadow-[0_0_0_3px_rgba(78,173,53,0.11),inset_6px_7px_14px_rgba(42,49,42,0.16),inset_-5px_-5px_12px_rgba(255,255,255,0.86)]",

      "disabled:cursor-not-allowed",
      "disabled:opacity-60",

      "dark:border-white/12",

      "dark:shadow-[inset_8px_9px_18px_rgba(0,0,0,0.62),inset_-5px_-5px_13px_rgba(255,255,255,0.025)]",

      "dark:focus:border-[#57af33]/75",

      "dark:focus:shadow-[0_0_0_3px_rgba(87,175,51,0.12),inset_7px_8px_16px_rgba(0,0,0,0.56)]",

      "[&:-webkit-autofill]:[-webkit-text-fill-color:var(--fixora-foreground)]",

      "[&:-webkit-autofill]:[caret-color:var(--fixora-foreground)]",

      "[&:-webkit-autofill]:[transition:background-color_999999s_ease-out_0s]",

      "[&:-webkit-autofill]:[-webkit-box-shadow:0_0_0_1000px_var(--fixora-surface-muted)_inset]",

      "[&:-webkit-autofill:hover]:[-webkit-box-shadow:0_0_0_1000px_var(--fixora-surface-muted)_inset]",

      "[&:-webkit-autofill:focus]:[-webkit-box-shadow:0_0_0_1000px_var(--fixora-surface)_inset]",

      "sm:h-12",
      "sm:pl-11",
      "sm:text-sm",
    );

  return (
    <form
      ref={
        formReference
      }
      id={
        resolvedFormId
      }
      onSubmit={
        handleSubmit
      }
      autoComplete="off"
      aria-busy={
        submitting
      }
      aria-describedby={
        errorMessage
          ? messageId
          : undefined
      }
      noValidate
      className="grid w-full gap-3.5 sm:gap-4"
    >
      <header className="text-center">
        <h1
          className={cn(
            "text-2xl font-bold",
            "tracking-[-0.04em]",
            "text-[var(--fixora-foreground)]",
            "sm:text-3xl",
          )}
        >
          {translations(
            "title",
          )}
        </h1>

        <p
          className={cn(
            "mx-auto mt-2",
            "max-w-sm",
            "text-[0.75rem] leading-5",
            "text-[var(--fixora-foreground-muted)]",
            "sm:mt-2.5",
            "sm:text-[0.82rem]",
          )}
        >
          {translations(
            "description",
          )}
        </p>
      </header>

      <div className="grid gap-2.5 sm:gap-3">
        <div className="relative">
          <label
            htmlFor={
              emailInputId
            }
            className="sr-only"
          >
            {translations(
              "email.label",
            )}
          </label>

          <Mail
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute",
              "top-1/2 left-3.5 z-10",
              "size-[15px]",
              "-translate-y-1/2",
              "text-[var(--fixora-foreground-muted)]",
              "sm:left-4 sm:size-4",
            )}
            strokeWidth={1.7}
          />

          <input
            id={
              emailInputId
            }
            name={`${resolvedFormId}-identity`}
            type="email"
            inputMode="email"
            autoComplete="off"
            aria-autocomplete="none"
            data-1p-ignore="true"
            data-bwignore="true"
            data-lpignore="true"
            autoCapitalize="none"
            spellCheck={false}
            value={
              email
            }
            disabled={
              controlsDisabled
            }
            required
            maxLength={320}
            placeholder={
              translations(
                "email.placeholder",
              )
            }
            className={cn(
              inputClassName,
              "pr-4",
            )}
            onChange={
              (
                event:
                  ChangeEvent<HTMLInputElement>,
              ) => {
                setEmail(
                  event.target.value,
                );

                clearError();
              }
            }
          />
        </div>

        <div className="relative">
          <label
            htmlFor={
              passwordInputId
            }
            className="sr-only"
          >
            {translations(
              "password.label",
            )}
          </label>

          <LockKeyhole
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute",
              "top-1/2 left-3.5 z-10",
              "size-[15px]",
              "-translate-y-1/2",
              "text-[var(--fixora-foreground-muted)]",
              "sm:left-4 sm:size-4",
            )}
            strokeWidth={1.7}
          />

          <input
            id={
              passwordInputId
            }
            name={`${resolvedFormId}-secret`}
            type={
              passwordVisible
                ? "text"
                : "password"
            }
            autoComplete="new-password"
            aria-autocomplete="none"
            data-1p-ignore="true"
            data-bwignore="true"
            data-lpignore="true"
            value={
              password
            }
            disabled={
              controlsDisabled
            }
            required
            maxLength={128}
            placeholder={
              translations(
                "password.placeholder",
              )
            }
            className={cn(
              inputClassName,
              "pr-12",
            )}
            onChange={
              (
                event:
                  ChangeEvent<HTMLInputElement>,
              ) => {
                setPassword(
                  event.target.value,
                );

                clearError();
              }
            }
          />

          <button
            type="button"
            disabled={
              controlsDisabled
            }
            onClick={
              () => {
                setPasswordVisible(
                  (
                    currentValue,
                  ) =>
                    !currentValue,
                );              }
            }
            aria-pressed={
              passwordVisible
            }
            aria-label={
              passwordVisible
                ? hidePasswordLabel
                : showPasswordLabel
            }
            title={
              passwordVisible
                ? hidePasswordLabel
                : showPasswordLabel
            }
            className={cn(
              "absolute top-1/2 right-2 z-20",

              "inline-flex size-8",
              "-translate-y-1/2",
              "items-center justify-center",

              "overflow-hidden rounded-full",

              "border border-[#4ead35]/25",

              "bg-[#4ead35]/8",

              "text-[#318b22]",

              "shadow-[inset_3px_3px_7px_rgba(42,49,42,0.13),inset_-3px_-3px_7px_rgba(255,255,255,0.72)]",

              "transition-[transform,border-color,background-color,color]",
              "duration-200",

              "hover:border-[#4ead35]/60",

              "hover:bg-[#4ead35]/14",

              "focus-visible:outline-none",

              "focus-visible:ring-2",

              "focus-visible:ring-[#4ead35]",

              "active:scale-95",

              "disabled:cursor-not-allowed",
              "disabled:opacity-50",

              "dark:border-[#57af33]/25",

              "dark:bg-[#57af33]/8",

              "dark:text-[#6ac447]",

              "dark:shadow-[inset_4px_4px_9px_rgba(0,0,0,0.55),inset_-3px_-3px_7px_rgba(255,255,255,0.02)]",
            )}
          >
            <ScanEye
              aria-hidden="true"
              className="size-[16px]"
              strokeWidth={1.8}
            />

            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute",
                "h-px w-5",
                "rotate-45 rounded-full",
                "bg-current",

                "transition-[opacity,transform]",
                "duration-200",

                passwordVisible
                  ? "scale-100 opacity-100"
                  : "scale-75 opacity-0",
              )}
            />
          </button>
        </div>
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          disabled={
            controlsDisabled
          }
          onClick={
            handlePasswordRecoveryRequest
          }
          className={cn(
            "text-[0.75rem] font-medium",

            "text-[var(--fixora-foreground-muted)]",

            "underline-offset-4",

            "transition-colors duration-200",

            "hover:text-[#318b22]",
            "hover:underline",

            "focus-visible:outline-none",
            "focus-visible:text-[#318b22]",
            "focus-visible:underline",

            "disabled:cursor-not-allowed",
            "disabled:opacity-50",

            "dark:hover:text-[#6ac447]",
            "dark:focus-visible:text-[#6ac447]",

            "sm:text-[0.82rem]",
          )}
        >
          {translations(
            "actions.forgotPassword",
          )}
        </button>
      </div>

      {errorMessage ? (
        <p
          id={
            messageId
          }
          role="alert"
          aria-live="assertive"
          className={cn(
            "rounded-xl border",

            "border-red-500/20",

            "bg-red-500/8",

            "px-3 py-2",

            "text-center text-xs font-medium",

            "text-red-700",

            "shadow-[inset_4px_4px_9px_rgba(90,20,20,0.08),inset_-3px_-3px_7px_rgba(255,255,255,0.6)]",

            "dark:text-red-300",

            "dark:shadow-[inset_4px_4px_9px_rgba(0,0,0,0.35)]",
          )}
        >
          {errorMessage}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={
          controlsDisabled
        }
        className={cn(
          "inline-flex h-11 w-full",
          "items-center justify-center gap-2",

          "rounded-full",
          "border border-[#4ead35]",

          "bg-[#4ead35]",

          "px-6",

          "text-[0.7rem] font-bold",
          "tracking-[0.18em]",
          "text-white uppercase",

          "shadow-[inset_0_2px_2px_rgba(255,255,255,0.25),inset_0_-6px_12px_rgba(31,104,24,0.2)]",

          "transition-[transform,background-color,border-color,box-shadow]",
          "duration-200",

          "hover:border-[#57af33]",

          "hover:bg-[#57af33]",

          "hover:shadow-[inset_0_2px_2px_rgba(255,255,255,0.28),inset_0_-7px_14px_rgba(31,104,24,0.24)]",

          "focus-visible:outline-none",

          "focus-visible:ring-2",

          "focus-visible:ring-[#4ead35]",

          "focus-visible:ring-offset-2",

          "focus-visible:ring-offset-[var(--fixora-surface)]",

          "active:scale-[0.99]",

          "disabled:cursor-not-allowed",

          "disabled:opacity-60",

          "dark:border-[#57af33]",

          "dark:bg-[#57af33]",

          "dark:text-[#0c0f0c]",

          "dark:shadow-[inset_0_2px_2px_rgba(255,255,255,0.1),inset_0_-7px_14px_rgba(0,0,0,0.24)]",

          "dark:hover:border-[#6ac447]",

          "dark:hover:bg-[#6ac447]",

          "motion-reduce:transform-none",

          "motion-reduce:transition-none",

          "sm:h-12",

          "sm:text-xs",
        )}
      >
        {submitting ? (
          <LoaderCircle
            aria-hidden="true"
            className="size-4 animate-spin"
            strokeWidth={2}
          />
        ) : null}

        {submitting
          ? translations(
              "actions.submitting",
            )
          : translations(
              "actions.submit",
            )}
      </button>

      <div
        className={cn(
          "grid grid-cols-1 gap-1",

          "border-t border-black/10",

          "pt-2.5",

          "dark:border-white/10",

          "min-[390px]:grid-cols-2",

          "min-[390px]:gap-2",
        )}
      >
        <button
          type="button"
          disabled={
            controlsDisabled
          }
          onClick={
            handleRegistrationRequest
          }
          className={cn(
            "inline-flex items-center",
            "justify-center gap-2",

            "rounded-full px-3 py-1.5",

            "text-[0.7rem] font-semibold",

            "text-[var(--fixora-foreground-muted)]",

            "transition-[background-color,color]",
            "duration-200",

            "hover:bg-[#4ead35]/10",

            "hover:text-[#318b22]",

            "focus-visible:outline-none",

            "focus-visible:ring-2",

            "focus-visible:ring-[#4ead35]",

            "disabled:cursor-not-allowed",

            "disabled:opacity-50",

            "dark:hover:text-[#6ac447]",

            "sm:text-xs",
          )}
        >
          <UserPlus
            aria-hidden="true"
            className="size-[14px]"
            strokeWidth={1.8}
          />

          {translations(
            "actions.register",
          )}
        </button>

        <button
          type="button"
          disabled={
            controlsDisabled
          }
          onClick={
            handleAdminSignInRequest
          }
          className={cn(
            "inline-flex items-center",
            "justify-center gap-2",

            "rounded-full px-3 py-1.5",

            "text-[0.7rem] font-semibold",

            "text-[var(--fixora-foreground-muted)]",

            "transition-[background-color,color]",
            "duration-200",

            "hover:bg-[#4ead35]/10",

            "hover:text-[#318b22]",

            "focus-visible:outline-none",

            "focus-visible:ring-2",

            "focus-visible:ring-[#4ead35]",

            "disabled:cursor-not-allowed",

            "disabled:opacity-50",

            "dark:hover:text-[#6ac447]",

            "sm:text-xs",
          )}
        >
          <ShieldCheck
            aria-hidden="true"
            className="size-[14px]"
            strokeWidth={1.8}
          />

          {translations(
            "actions.adminAccess",
          )}
        </button>
      </div>
    </form>
  );
}