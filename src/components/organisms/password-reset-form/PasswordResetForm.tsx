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
  usePasswordStrength,
} from "@/hooks/use-password-strength";

import {
  useAuth,
} from "@/providers/auth-provider";

import {
  isAuthApiClientError,
  resetPassword,
} from "@/services/auth";

import type {
  AuthFieldError,
} from "@/types/auth";

import type {
  Locale,
} from "@/types/locale";

import type {
  PasswordResetFormFieldErrors,
  PasswordResetFormFieldName,
  PasswordResetFormProps,
  PasswordResetFormStatus,
  PasswordResetFormValues,
} from "./PasswordResetForm.types";

const EMPTY_FORM_VALUES:
  PasswordResetFormValues = {
  password:
    "",

  passwordConfirmation:
    "",
};

const PASSWORD_RESET_FIELDS =
  new Set<
    PasswordResetFormFieldName
  >([
    "password",
    "passwordConfirmation",
  ]);

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

function isPasswordResetFieldName(
  value: string,
): value is PasswordResetFormFieldName {
  return PASSWORD_RESET_FIELDS.has(
    value as PasswordResetFormFieldName,
  );
}

function createInitialValues(
  initialValues:
    PasswordResetFormProps[
      "initialValues"
    ],
): PasswordResetFormValues {
  return {
    ...EMPTY_FORM_VALUES,
    ...initialValues,
  };
}

function validateResetToken(
  resetToken: string,
): string {
  const normalizedToken =
    resetToken.trim();

  if (
    normalizedToken.length < 32
    || normalizedToken.length > 2_048
    || !/^[A-Za-z0-9._-]+$/u.test(
      normalizedToken,
    )
  ) {
    throw new Error(
      "El token de recuperación no es válido.",
    );
  }

  return normalizedToken;
}

export function PasswordResetForm({
  formId,
  resetToken,
  locale,
  accountRole = "USER",
  disabled = false,
  initialValues,
  onSuccess,
  onRequestSignIn,
  onRequestRecovery,
}: PasswordResetFormProps) {
  const translations =
    useTranslations(
      "auth.passwordReset",
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
    ?? `password-reset-form-${generatedFormId}`;

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

  const normalizedResetToken =
    validateResetToken(
      resetToken,
    );

  const [
    values,
    setValues,
  ] = useState<
    PasswordResetFormValues
  >(
    () =>
      createInitialValues(
        initialValues,
      ),
  );

  const [
    status,
    setStatus,
  ] = useState<
    PasswordResetFormStatus
  >(
    "IDLE",
  );

  const [
    fieldErrors,
    setFieldErrors,
  ] = useState<
    PasswordResetFormFieldErrors
  >(
    {},
  );

  const [
    formError,
    setFormError,
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

  const passwordStrength =
    usePasswordStrength({
      password:
        values.password,

      accountRole,
    });

  const submitting =
    status === "SUBMITTING";

  const controlsDisabled =
    disabled
    || submitting;

  const passwordsMatch =
    values.password.length > 0
    && values.passwordConfirmation
      .length > 0
    && values.password
      === values.passwordConfirmation;

  const passwordInputId =
    `${resolvedFormId}-password`;

  const passwordConfirmationInputId =
    `${resolvedFormId}-password-confirmation`;

  const passwordStrengthId =
    `${resolvedFormId}-password-strength`;

  const formMessageId =
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

  const clearFieldError =
    (
      field:
        PasswordResetFormFieldName,
    ): void => {
      setFieldErrors(
        (
          currentFieldErrors,
        ) => {
          if (
            !currentFieldErrors[
              field
            ]
          ) {
            return currentFieldErrors;
          }

          const nextFieldErrors = {
            ...currentFieldErrors,
          };

          delete nextFieldErrors[
            field
          ];

          return nextFieldErrors;
        },
      );
    };

  const handleFieldChange =
    (
      field:
        PasswordResetFormFieldName,
    ) =>
    (
      event:
        ChangeEvent<HTMLInputElement>,
    ): void => {
      setValues(
        (
          currentValues,
        ) => ({
          ...currentValues,

          [field]:
            event.target.value,
        }),
      );

      clearFieldError(
        field,
      );

      if (formError) {
        setFormError(
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

  const validateForm =
    (): PasswordResetFormFieldErrors => {
      const errors:
        PasswordResetFormFieldErrors = {};

      if (
        !passwordStrength.isValid
      ) {
        errors.password =
          translations(
            "errors.invalidPassword",
          );
      }

      if (!passwordsMatch) {
        errors.passwordConfirmation =
          translations(
            "errors.passwordsDoNotMatch",
          );
      }

      return errors;
    };

  const getFieldErrorMessage =
    (
      fieldError:
        AuthFieldError,
    ): string => {
      switch (
        fieldError.field
      ) {
        case "password":
          return translations(
            "errors.invalidPassword",
          );

        case "passwordConfirmation":
          return translations(
            "errors.passwordsDoNotMatch",
          );

        default:
          return translations(
            "errors.invalidField",
          );
      }
    };

  const applyApiFieldErrors =
    (
      error: unknown,
    ): boolean => {
      if (
        !isAuthApiClientError(
          error,
        )
        || error.fieldErrors
          .length === 0
      ) {
        return false;
      }

      const nextFieldErrors:
        PasswordResetFormFieldErrors = {};

      for (
        const fieldError
        of error.fieldErrors
      ) {
        if (
          !isPasswordResetFieldName(
            fieldError.field,
          )
        ) {
          continue;
        }

        nextFieldErrors[
          fieldError.field
        ] =
          getFieldErrorMessage(
            fieldError,
          );
      }

      if (
        Object.keys(
          nextFieldErrors,
        ).length === 0
      ) {
        return false;
      }

      setFieldErrors(
        nextFieldErrors,
      );

      return true;
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

      const validationErrors =
        validateForm();

      if (
        Object.keys(
          validationErrors,
        ).length > 0
      ) {
        setFieldErrors(
          validationErrors,
        );

        setStatus(
          "ERROR",
        );

        setFormError(
          translations(
            "errors.reviewFields",
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

      setFieldErrors(
        {},
      );

      setFormError(
        null,
      );

      try {
        const result =
          await resetPassword(
            {
              resetToken:
                normalizedResetToken,

              password:
                values.password,

              passwordConfirmation:
                values.passwordConfirmation,

              locale:
                resolvedLocale,
            },
            {
              signal:
                abortController.signal,
            },
          );

        setValues(
          EMPTY_FORM_VALUES,
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

        const fieldErrorsApplied =
          applyApiFieldErrors(
            error,
          );

        if (!fieldErrorsApplied) {
          setFormError(
            isAuthApiClientError(
              error,
            )
              ? error.message
              : error instanceof Error
                ? error.message
                : translations(
                    "errors.unknown",
                  ),
          );
        }
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

  const handleRecoveryRequest =
    (): void => {
      if (onRequestRecovery) {
        onRequestRecovery();
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
        formError
          ? formMessageId
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
          autoComplete="new-password"
          value={
            values.password
          }
          disabled={
            controlsDisabled
          }
          aria-invalid={
            Boolean(
              fieldErrors.password,
            )
          }
          aria-describedby={
            passwordStrengthId
          }
          required
          onChange={
            handleFieldChange(
              "password",
            )
          }
        />

        <p
          id={passwordStrengthId}
          aria-live="polite"
        >
          {translations(
            `password.strength.${passwordStrength.level.toLowerCase()}`,
          )}
        </p>

        {fieldErrors.password ? (
          <p role="alert">
            {fieldErrors.password}
          </p>
        ) : null}
      </div>

      <div>
        <label
          htmlFor={
            passwordConfirmationInputId
          }
        >
          {translations(
            "passwordConfirmation.label",
          )}
        </label>

        <input
          id={
            passwordConfirmationInputId
          }
          name="passwordConfirmation"
          type="password"
          autoComplete="new-password"
          value={
            values
              .passwordConfirmation
          }
          disabled={
            controlsDisabled
          }
          aria-invalid={
            Boolean(
              fieldErrors
                .passwordConfirmation,
            )
          }
          required
          onChange={
            handleFieldChange(
              "passwordConfirmation",
            )
          }
        />

        {fieldErrors
          .passwordConfirmation ? (
          <p role="alert">
            {
              fieldErrors
                .passwordConfirmation
            }
          </p>
        ) : null}
      </div>

      {formError ? (
        <p
          id={formMessageId}
          role="alert"
          aria-live="assertive"
        >
          {formError}
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

      {status === "SUCCESS" ? (
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
      ) : null}

      <button
        type="button"
        disabled={
          controlsDisabled
        }
        onClick={
          handleRecoveryRequest
        }
      >
        {translations(
          "actions.requestAnotherCode",
        )}
      </button>
    </form>
  );
}