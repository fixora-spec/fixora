"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import type {
  FormEvent,
} from "react";

import {
  useLocale,
  useTranslations,
} from "next-intl";

import {
  isAuthApiClientError,
  signInUser,
} from "@/services/auth";

import {
  useAuth,
} from "@/providers/auth-provider";

import type {
  Locale,
} from "@/types/locale";

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
    error instanceof DOMException
    && error.name === "AbortError"
  );
}

function getSignInErrorMessage(
  error: unknown,
  fallbackMessage: string,
): string {
  if (
    isAuthApiClientError(error)
  ) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallbackMessage;
}

export function UserSignInForm({
  formId,
  locale,
  initialEmail = "",
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

  const emailInputId =
    `${resolvedFormId}-email`;

  const passwordInputId =
    `${resolvedFormId}-password`;

  const messageId =
    `${resolvedFormId}-message`;

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
    email,
    setEmail,
  ] = useState(
    initialEmail,
  );

  const [
    password,
    setPassword,
  ] = useState(
    "",
  );

  const [
    status,
    setStatus,
  ] = useState<
    UserSignInFormStatus
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

  const abortControllerReference =
    useRef<
      AbortController | null
    >(
      null,
    );

  const submitting =
    status === "SUBMITTING";

  const controlsDisabled =
    disabled
    || submitting;

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

  const handleSubmit =
    async (
      event:
        FormEvent<HTMLFormElement>,
    ): Promise<void> => {
      event.preventDefault();

      if (controlsDisabled) {
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

        setPassword(
          "",
        );

        setStatus(
          "SUCCESS",
        );

        onSuccess?.(
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

  return (
    <form
      id={resolvedFormId}
      onSubmit={handleSubmit}
      aria-busy={submitting}
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
      </header>

      <div>
        <label
          htmlFor={emailInputId}
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
            (event) => {
              setEmail(
                event.target.value,
              );

              if (
                status === "ERROR"
              ) {
                setStatus(
                  "IDLE",
                );

                setErrorMessage(
                  null,
                );
              }
            }
          }
        />
      </div>

      <div>
        <label
          htmlFor={
            passwordInputId
          }
        >
          {translations(
            "password.label",
          )}
        </label>

        <input
          id={passwordInputId}
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          disabled={
            controlsDisabled
          }
          required
          onChange={
            (event) => {
              setPassword(
                event.target.value,
              );

              if (
                status === "ERROR"
              ) {
                setStatus(
                  "IDLE",
                );

                setErrorMessage(
                  null,
                );
              }
            }
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
        {submitting
          ? translations(
              "actions.submitting",
            )
          : translations(
              "actions.submit",
            )}
      </button>

      <button
        type="button"
        disabled={
          controlsDisabled
        }
        onClick={
          handlePasswordRecoveryRequest
        }
      >
        {translations(
          "actions.forgotPassword",
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
      >
        {translations(
          "actions.adminAccess",
        )}
      </button>
    </form>
  );
}