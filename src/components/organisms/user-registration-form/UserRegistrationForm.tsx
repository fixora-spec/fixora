"use client";

import {
  useEffect,
  useId,
  useMemo,
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
  useUsernameAvailability,
} from "@/hooks/use-username-availability";

import {
  isAuthApiClientError,
  registerUser,
} from "@/services/auth";

import type {
  Locale,
} from "@/types/locale";

import type {
  UserRegistrationFieldErrors,
  UserRegistrationFieldName,
  UserRegistrationFormProps,
  UserRegistrationFormStatus,
  UserRegistrationFormValues,
} from "./UserRegistrationForm.types";

const EMPTY_FORM_VALUES:
  UserRegistrationFormValues = {
  firstNames:
    "",

  lastNames:
    "",

  username:
    "",

  email:
    "",

  password:
    "",

  passwordConfirmation:
    "",
};

const REGISTRATION_FIELDS =
  new Set<UserRegistrationFieldName>([
    "firstNames",
    "lastNames",
    "username",
    "email",
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

function isRegistrationFieldName(
  value: string,
): value is UserRegistrationFieldName {
  return REGISTRATION_FIELDS.has(
    value as UserRegistrationFieldName,
  );
}

function createInitialValues(
  initialValues:
    UserRegistrationFormProps[
      "initialValues"
    ],
): UserRegistrationFormValues {
  return {
    ...EMPTY_FORM_VALUES,
    ...initialValues,
  };
}

function normalizeEmail(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase();
}

function normalizePersonName(
  value: string,
): string {
  return value
    .trim()
    .replace(/\s+/gu, " ")
    .normalize("NFC");
}

export function UserRegistrationForm({
  formId,
  locale,
  initialValues,
  disabled = false,
  onSuccess,
  onRequestSignIn,
  onRequestEmailVerification,
}: UserRegistrationFormProps) {
  const translations =
    useTranslations(
      "auth.userRegistration",
    );

  const currentLocale =
    useLocale();

  const generatedFormId =
    useId();

  const resolvedFormId =
    formId
    ?? `user-registration-form-${generatedFormId}`;

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
    UserRegistrationFormValues
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
    UserRegistrationFormStatus
  >(
    "IDLE",
  );

  const [
    fieldErrors,
    setFieldErrors,
  ] = useState<
    UserRegistrationFieldErrors
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

  const usernameAvailability =
    useUsernameAvailability({
      username:
        values.username,

      enabled:
        !disabled
        && status !== "SUBMITTING",

      debounceMilliseconds:
        400,
    });

  const passwordStrength =
    usePasswordStrength({
      password:
        values.password,

      accountRole:
        "USER",
    });

  const submitting =
    status === "SUBMITTING";

  const controlsDisabled =
    disabled
    || submitting;

  const passwordsMatch =
    values.passwordConfirmation
      .length > 0
    && values.password
      === values.passwordConfirmation;

  const usernameStatusMessage =
    useMemo(
      (): string | null => {
        switch (
          usernameAvailability.status
        ) {
          case "CHECKING":
            return translations(
              "username.status.checking",
            );

          case "AVAILABLE":
            return translations(
              "username.status.available",
            );

          case "UNAVAILABLE":
            return usernameAvailability.reason
              === "TOO_SIMILAR"
              ? translations(
                  "username.status.tooSimilar",
                )
              : translations(
                  "username.status.taken",
                );

          case "INVALID":
            return translations(
              "username.status.invalid",
            );

          case "ERROR":
            return (
              usernameAvailability
                .errorMessage
              ?? translations(
                "errors.unknown",
              )
            );

          default:
            return null;
        }
      },
      [
        translations,
        usernameAvailability
          .errorMessage,
        usernameAvailability.reason,
        usernameAvailability.status,
      ],
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

  const clearFieldError =
    (
      field:
        UserRegistrationFieldName,
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
        UserRegistrationFieldName,
    ) =>
    (
      event:
        ChangeEvent<HTMLInputElement>,
    ): void => {
      const nextValue =
        event.target.value;

      setValues(
        (
          currentValues,
        ) => ({
          ...currentValues,

          [field]:
            nextValue,
        }),
      );

      clearFieldError(
        field,
      );

      if (
        formError !== null
      ) {
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
    (): UserRegistrationFieldErrors => {
      const errors:
        UserRegistrationFieldErrors = {};

      if (
        normalizePersonName(
          values.firstNames,
        ).length < 2
      ) {
        errors.firstNames =
          translations(
            "errors.invalidFirstNames",
          );
      }

      if (
        normalizePersonName(
          values.lastNames,
        ).length < 2
      ) {
        errors.lastNames =
          translations(
            "errors.invalidLastNames",
          );
      }

      if (
        values.username
          .trim()
          .length < 3
      ) {
        errors.username =
          translations(
            "errors.invalidUsername",
          );
      } else if (
        usernameAvailability.status
        === "CHECKING"
      ) {
        errors.username =
          translations(
            "errors.usernameChecking",
          );
      } else if (
        usernameAvailability.status
          === "UNAVAILABLE"
        || usernameAvailability.status
          === "INVALID"
      ) {
        errors.username =
          translations(
            "errors.usernameUnavailable",
          );
      }

      const normalizedEmail =
        normalizeEmail(
          values.email,
        );

      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u
          .test(normalizedEmail)
      ) {
        errors.email =
          translations(
            "errors.invalidEmail",
          );
      }

      if (
        !passwordStrength.isValid
      ) {
        errors.password =
          translations(
            "errors.invalidPassword",
          );
      }

      if (
        values.passwordConfirmation
          .length === 0
        || !passwordsMatch
      ) {
        errors.passwordConfirmation =
          translations(
            "errors.passwordsDoNotMatch",
          );
      }

      return errors;
    };

  const applyApiFieldErrors =
    (
      error:
        Parameters<
          typeof isAuthApiClientError
        >[0],
    ): boolean => {
      if (
        !isAuthApiClientError(error)
        || error.fieldErrors
          .length === 0
      ) {
        return false;
      }

      const nextFieldErrors:
        UserRegistrationFieldErrors = {};

      for (
        const fieldError
        of error.fieldErrors
      ) {
        if (
          !isRegistrationFieldName(
            fieldError.field,
          )
        ) {
          continue;
        }

        nextFieldErrors[
          fieldError.field
        ] =
          translations(
            "errors.invalidField",
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
          await registerUser(
            {
              firstNames:
                normalizePersonName(
                  values.firstNames,
                ),

              lastNames:
                normalizePersonName(
                  values.lastNames,
                ),

              username:
                values.username
                  .trim()
                  .normalize("NFC"),

              email:
                normalizeEmail(
                  values.email,
                ),

              password:
                values.password,

              passwordConfirmation:
                values
                  .passwordConfirmation,

              locale:
                resolvedLocale,
            },
            {
              signal:
                abortController.signal,
            },
          );

        setStatus(
          "SUCCESS",
        );

        setValues(
          (
            currentValues,
          ) => ({
            ...currentValues,

            password:
              "",

            passwordConfirmation:
              "",
          }),
        );

        onSuccess?.(
          result,
        );

        onRequestEmailVerification?.(
          result,
        );
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }

        setStatus(
          "ERROR",
        );

        const fieldErrorApplied =
          applyApiFieldErrors(
            error,
          );

        if (
          !fieldErrorApplied
        ) {
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
      onRequestSignIn?.();
    };

  const formMessageId =
    `${resolvedFormId}-message`;

  const firstNamesInputId =
    `${resolvedFormId}-first-names`;

  const lastNamesInputId =
    `${resolvedFormId}-last-names`;

  const usernameInputId =
    `${resolvedFormId}-username`;

  const usernameStatusId =
    `${resolvedFormId}-username-status`;

  const emailInputId =
    `${resolvedFormId}-email`;

  const passwordInputId =
    `${resolvedFormId}-password`;

  const passwordStatusId =
    `${resolvedFormId}-password-status`;

  const passwordConfirmationInputId =
    `${resolvedFormId}-password-confirmation`;

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
            firstNamesInputId
          }
        >
          {translations(
            "firstNames.label",
          )}
        </label>

        <input
          id={firstNamesInputId}
          name="firstNames"
          type="text"
          autoComplete="given-name"
          value={
            values.firstNames
          }
          disabled={
            controlsDisabled
          }
          aria-invalid={
            Boolean(
              fieldErrors.firstNames,
            )
          }
          required
          onChange={
            handleFieldChange(
              "firstNames",
            )
          }
        />

        {fieldErrors.firstNames ? (
          <p role="alert">
            {fieldErrors.firstNames}
          </p>
        ) : null}
      </div>

      <div>
        <label
          htmlFor={
            lastNamesInputId
          }
        >
          {translations(
            "lastNames.label",
          )}
        </label>

        <input
          id={lastNamesInputId}
          name="lastNames"
          type="text"
          autoComplete="family-name"
          value={
            values.lastNames
          }
          disabled={
            controlsDisabled
          }
          aria-invalid={
            Boolean(
              fieldErrors.lastNames,
            )
          }
          required
          onChange={
            handleFieldChange(
              "lastNames",
            )
          }
        />

        {fieldErrors.lastNames ? (
          <p role="alert">
            {fieldErrors.lastNames}
          </p>
        ) : null}
      </div>

      <div>
        <label
          htmlFor={
            usernameInputId
          }
        >
          {translations(
            "username.label",
          )}
        </label>

        <input
          id={usernameInputId}
          name="username"
          type="text"
          autoComplete="username"
          value={
            values.username
          }
          disabled={
            controlsDisabled
          }
          aria-invalid={
            Boolean(
              fieldErrors.username,
            )
          }
          aria-describedby={
            usernameStatusMessage
              ? usernameStatusId
              : undefined
          }
          required
          onChange={
            handleFieldChange(
              "username",
            )
          }
        />

        {usernameStatusMessage ? (
          <p
            id={
              usernameStatusId
            }
            aria-live="polite"
          >
            {usernameStatusMessage}
          </p>
        ) : null}

        {fieldErrors.username ? (
          <p role="alert">
            {fieldErrors.username}
          </p>
        ) : null}

        {usernameAvailability
          .suggestions
          .length > 0 ? (
          <div>
            <p>
              {translations(
                "username.suggestions",
              )}
            </p>

            {usernameAvailability
              .suggestions
              .map(
                (
                  suggestion,
                ) => (
                  <button
                    key={
                      suggestion
                    }
                    type="button"
                    disabled={
                      controlsDisabled
                    }
                    onClick={
                      () => {
                        setValues(
                          (
                            currentValues,
                          ) => ({
                            ...currentValues,

                            username:
                              suggestion,
                          }),
                        );

                        clearFieldError(
                          "username",
                        );
                      }
                    }
                  >
                    {suggestion}
                  </button>
                ),
              )}
          </div>
        ) : null}
      </div>

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
          value={
            values.email
          }
          disabled={
            controlsDisabled
          }
          aria-invalid={
            Boolean(
              fieldErrors.email,
            )
          }
          required
          onChange={
            handleFieldChange(
              "email",
            )
          }
        />

        {fieldErrors.email ? (
          <p role="alert">
            {fieldErrors.email}
          </p>
        ) : null}
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
            passwordStatusId
          }
          required
          onChange={
            handleFieldChange(
              "password",
            )
          }
        />

        <p
          id={
            passwordStatusId
          }
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