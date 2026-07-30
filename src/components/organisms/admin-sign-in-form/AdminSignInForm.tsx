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
  useAuth,
} from "@/providers/auth-provider";

import {
  isAuthApiClientError,
  signInAdmin,
} from "@/services/auth";

import type {
  Locale,
} from "@/types/locale";

import type {
  AdminSignInFormProps,
  AdminSignInFormStatus,
  AdminSignInFormValues,
} from "./AdminSignInForm.types";

const EMPTY_FORM_VALUES:
  AdminSignInFormValues = {
  email:
    "",

  password:
    "",
};

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

  if (error instanceof Error) {
    return error.message;
  }

  return fallbackMessage;
}

export function AdminSignInForm({
  formId,
  locale,
  initialEmail = "",
  disabled = false,
  onSuccess,
  onRequestUserSignIn,
  onRequestPasswordRecovery,
}: AdminSignInFormProps) {
  const translations =
    useTranslations(
      "auth.adminSignIn",
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
    ?? `admin-sign-in-form-${generatedFormId}`;

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
    values,
    setValues,
  ] = useState<
    AdminSignInFormValues
  >(
    () => ({
      ...EMPTY_FORM_VALUES,

      email:
        initialEmail,
    }),
  );

  const [
    status,
    setStatus,
  ] = useState<
    AdminSignInFormStatus
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

  const emailInputId =
    `${resolvedFormId}-email`;

  const passwordInputId =
    `${resolvedFormId}-password`;

  const messageId =
    `${resolvedFormId}-message`;

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
      if (errorMessage !== null) {
        setErrorMessage(
          null,
        );
      }

      if (
        status === "ERROR"
        || status === "SUCCESS"
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
      setValues(
        (
          currentValues,
        ) => ({
          ...currentValues,

          email:
            event.target.value,
        }),
      );

      clearError();
    };

  const handlePasswordChange =
    (
      event:
        ChangeEvent<HTMLInputElement>,
    ): void => {
      setValues(
        (
          currentValues,
        ) => ({
          ...currentValues,

          password:
            event.target.value,
        }),
      );

      clearError();
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

      const normalizedEmail =
        normalizeEmail(
          values.email,
        );

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
        values.password.length === 0
      ) {
        setStatus(
          "ERROR",
        );

        setErrorMessage(
          translations(
            "errors.passwordRequired",
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
          await signInAdmin(
            {
              email:
                normalizedEmail,

              password:
                values.password,

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

        setValues(
          (
            currentValues,
          ) => ({
            ...currentValues,

            password:
              "",
          }),
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

  const handleUserSignInRequest =
    (): void => {
      if (
        onRequestUserSignIn
      ) {
        onRequestUserSignIn();
        return;
      }

      setAuthenticationView(
        "USER_SIGN_IN",
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
          autoComplete="username"
          value={
            values.email
          }
          disabled={
            controlsDisabled
          }
          required
          onChange={
            handleEmailChange
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
          value={
            values.password
          }
          disabled={
            controlsDisabled
          }
          required
          onChange={
            handlePasswordChange
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
          handleUserSignInRequest
        }
      >
        {translations(
          "actions.userAccess",
        )}
      </button>

      <p>
        {translations(
          "securityNotice",
        )}
      </p>
    </form>
  );
}