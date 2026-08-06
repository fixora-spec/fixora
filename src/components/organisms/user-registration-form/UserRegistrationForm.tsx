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
  AtSign,
  Check,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ScanEye,
  UserRound,
  UsersRound,
} from "lucide-react";

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

import {
  cn,
} from "@/utils/cn";

import type {
  UserRegistrationFieldErrors,
  UserRegistrationFieldName,
  UserRegistrationFormProps,
  UserRegistrationFormStatus,
  UserRegistrationFormValues,
} from "./UserRegistrationForm.types";

const EMPTY_FORM_VALUES:
  UserRegistrationFormValues = {
  firstNames: "",
  lastNames: "",
  username: "",
  email: "",
  password: "",
  passwordConfirmation: "",
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
    error instanceof Error
    && error.name === "AbortError"
  );
}

const FIRST_NAMES_MAXIMUM_LENGTH = 100;
const LAST_NAMES_MAXIMUM_LENGTH = 150;
const USERNAME_MAXIMUM_LENGTH = 40;
const EMAIL_MAXIMUM_LENGTH = 320;
const PASSWORD_MAXIMUM_LENGTH = 128;

function isRegistrationFieldName(
  value: string,
): value is UserRegistrationFieldName {
  return REGISTRATION_FIELDS.has(
    value as UserRegistrationFieldName,
  );
}

function createInitialValues(
  initialValues:
    UserRegistrationFormProps["initialValues"],
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
    .replace(
      /\s+/gu,
      " ",
    )
    .normalize(
      "NFC",
    );
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

  const mountedReference =
    useRef(false);

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
    values,
    setValues,
  ] = useState<UserRegistrationFormValues>(
    () =>
      createInitialValues(
        initialValues,
      ),
  );

  const [
    passwordVisible,
    setPasswordVisible,
  ] = useState(
    false,
  );

  const [
    passwordConfirmationVisible,
    setPasswordConfirmationVisible,
  ] = useState(
    false,
  );

  const [
    status,
    setStatus,
  ] = useState<UserRegistrationFormStatus>(
    "IDLE",
  );

  const [
    fieldErrors,
    setFieldErrors,
  ] = useState<UserRegistrationFieldErrors>(
    {},
  );

  const [
    formError,
    setFormError,
  ] = useState<string | null>(
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
    values.passwordConfirmation.length > 0
    && values.password
      === values.passwordConfirmation;

  const showPasswordLabel =
    resolvedLocale === "es"
      ? "Mostrar contraseña"
      : "Show password";

  const hidePasswordLabel =
    resolvedLocale === "es"
      ? "Ocultar contraseña"
      : "Hide password";

  const showConfirmationLabel =
    resolvedLocale === "es"
      ? "Mostrar confirmación de contraseña"
      : "Show password confirmation";

  const hideConfirmationLabel =
    resolvedLocale === "es"
      ? "Ocultar confirmación de contraseña"
      : "Hide password confirmation";

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
              usernameAvailability.errorMessage
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
        usernameAvailability.errorMessage,
        usernameAvailability.reason,
        usernameAvailability.status,
      ],
    );

  useEffect(
    () => {
      mountedReference.current = true;

      return () => {
        mountedReference.current = false;

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
        || normalizePersonName(
          values.firstNames,
        ).length > FIRST_NAMES_MAXIMUM_LENGTH
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
        || normalizePersonName(
          values.lastNames,
        ).length > LAST_NAMES_MAXIMUM_LENGTH
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
        || values.username.trim().length > USERNAME_MAXIMUM_LENGTH
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
        normalizedEmail.length > EMAIL_MAXIMUM_LENGTH
        || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u
          .test(
            normalizedEmail,
          )
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
        values.passwordConfirmation.length
          === 0
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
      error: unknown,
    ): boolean => {
      if (
        !isAuthApiClientError(
          error,
        )
        || error.fieldErrors.length
          === 0
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

      if (
        controlsDisabled
      ) {
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
                  .normalize(
                    "NFC",
                  ),

              email:
                normalizeEmail(
                  values.email,
                ),

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

        if (
          !mountedReference.current
          || abortControllerReference.current !== abortController
          || abortController.signal.aborted
        ) {
          return;
        }

        setStatus(
          "SUCCESS",
        );

        setPasswordVisible(
          false,
        );

        setPasswordConfirmationVisible(
          false,
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
        if (
          isAbortError(
            error,
          )
          || !mountedReference.current
          || abortControllerReference.current !== abortController
        ) {
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

  const formMessageId =
    `${resolvedFormId}-message`;

  const inputClassName =
    cn(
      "h-10 w-full rounded-full",

      "border border-black/15",

      "bg-[var(--fixora-surface-muted)]",

      "pl-10",

      "text-[0.75rem]",

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

      "aria-[invalid=true]:border-red-500/55",

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

      "sm:h-11",

      "sm:text-[0.8rem]",

      "xl:h-12",

      "xl:text-sm",
    );

  const fieldErrorClassName =
    cn(
      "px-2.5",
      "text-[0.64rem]",
      "font-medium",
      "leading-4",
      "text-red-700",
      "dark:text-red-300",
    );

  const visibilityButtonClassName =
    cn(
      "absolute top-1/2 right-2 z-20",

      "inline-flex size-7",

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

      "sm:size-8",
    );

  return (
    <form
      id={
        resolvedFormId
      }
      onSubmit={
        handleSubmit
      }
      autoComplete="on"
      aria-busy={
        submitting
      }
      aria-describedby={
        formError
          ? formMessageId
          : undefined
      }
      noValidate
      className="grid w-full gap-2 sm:gap-2.5"
    >
      <header className="text-center">
        <h1
          className={cn(
            "text-xl font-bold",
            "tracking-[-0.04em]",
            "text-[var(--fixora-foreground)]",
            "min-[380px]:text-2xl",
            "sm:text-[1.65rem]",
            "xl:text-3xl",
          )}
        >
          {translations(
            "title",
          )}
        </h1>

        <p
          className={cn(
            "mx-auto mt-1",
            "max-w-sm",
            "text-[0.68rem] leading-4",
            "text-[var(--fixora-foreground-muted)]",
            "sm:mt-1.5",
            "sm:text-[0.74rem]",
            "xl:text-[0.8rem]",
          )}
        >
          {translations(
            "description",
          )}
        </p>
      </header>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-1">
          <div className="relative">
            <label
              htmlFor={
                firstNamesInputId
              }
              className="sr-only"
            >
              {translations(
                "firstNames.label",
              )}
            </label>

            <UserRound
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute",
                "top-1/2 left-3.5 z-10",
                "size-[14px]",
                "-translate-y-1/2",
                "text-[var(--fixora-foreground-muted)]",
              )}
              strokeWidth={1.7}
            />

            <input
              id={
                firstNamesInputId
              }
              name="firstNames"
              type="text"
              autoComplete="given-name"
              maxLength={FIRST_NAMES_MAXIMUM_LENGTH}
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
              placeholder={
                translations(
                  "firstNames.placeholder",
                )
              }
              className={cn(
                inputClassName,
                "pr-3.5",
              )}
              onChange={
                handleFieldChange(
                  "firstNames",
                )
              }
            />
          </div>

          {fieldErrors.firstNames ? (
            <p
              role="alert"
              className={
                fieldErrorClassName
              }
            >
              {fieldErrors.firstNames}
            </p>
          ) : null}
        </div>

        <div className="grid gap-1">
          <div className="relative">
            <label
              htmlFor={
                lastNamesInputId
              }
              className="sr-only"
            >
              {translations(
                "lastNames.label",
              )}
            </label>

            <UsersRound
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute",
                "top-1/2 left-3.5 z-10",
                "size-[14px]",
                "-translate-y-1/2",
                "text-[var(--fixora-foreground-muted)]",
              )}
              strokeWidth={1.7}
            />

            <input
              id={
                lastNamesInputId
              }
              name="lastNames"
              type="text"
              autoComplete="family-name"
              maxLength={LAST_NAMES_MAXIMUM_LENGTH}
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
              placeholder={
                translations(
                  "lastNames.placeholder",
                )
              }
              className={cn(
                inputClassName,
                "pr-3.5",
              )}
              onChange={
                handleFieldChange(
                  "lastNames",
                )
              }
            />
          </div>

          {fieldErrors.lastNames ? (
            <p
              role="alert"
              className={
                fieldErrorClassName
              }
            >
              {fieldErrors.lastNames}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-1">
        <div className="relative">
          <label
            htmlFor={
              usernameInputId
            }
            className="sr-only"
          >
            {translations(
              "username.label",
            )}
          </label>

          <AtSign
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute",
              "top-1/2 left-3.5 z-10",
              "size-[14px]",
              "-translate-y-1/2",
              "text-[var(--fixora-foreground-muted)]",
            )}
            strokeWidth={1.7}
          />

          <input
            id={
              usernameInputId
            }
            name="username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={USERNAME_MAXIMUM_LENGTH}
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
            placeholder={
              translations(
                "username.placeholder",
              )
            }
            className={cn(
              inputClassName,
              "pr-3.5",
            )}
            onChange={
              handleFieldChange(
                "username",
              )
            }
          />
        </div>

        {usernameStatusMessage ? (
          <p
            id={
              usernameStatusId
            }
            aria-live="polite"
            className={cn(
              "px-2.5",
              "text-[0.62rem]",
              "font-medium",

              usernameAvailability.status
                === "AVAILABLE"
                ? "text-[#318b22] dark:text-[#6ac447]"
                : "text-[var(--fixora-foreground-muted)]",
            )}
          >
            {usernameStatusMessage}
          </p>
        ) : null}

        {fieldErrors.username ? (
          <p
            role="alert"
            className={
              fieldErrorClassName
            }
          >
            {fieldErrors.username}
          </p>
        ) : null}

        {usernameAvailability
          .suggestions
          .length > 0 ? (
          <div
            className={cn(
              "flex flex-wrap items-center gap-1.5",

              "rounded-xl border border-black/10",

              "bg-[var(--fixora-surface-muted)]/75",

              "p-2",

              "shadow-[inset_5px_6px_12px_rgba(42,49,42,0.14),inset_-4px_-4px_10px_rgba(255,255,255,0.7)]",

              "dark:border-white/10",

              "dark:shadow-[inset_6px_7px_14px_rgba(0,0,0,0.48),inset_-3px_-3px_8px_rgba(255,255,255,0.018)]",
            )}
          >
            <p
              className={cn(
                "w-full",
                "text-[0.62rem]",
                "font-semibold",
                "text-[var(--fixora-foreground-muted)]",
              )}
            >
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
                    className={cn(
                      "rounded-full border",

                      "border-[#4ead35]/35",

                      "bg-[var(--fixora-surface)]",

                      "px-2.5 py-1",

                      "text-[0.62rem]",

                      "font-semibold",

                      "text-[var(--fixora-foreground)]",

                      "shadow-[inset_3px_3px_7px_rgba(42,49,42,0.1),inset_-3px_-3px_7px_rgba(255,255,255,0.7)]",

                      "transition-[border-color,background-color,color]",

                      "duration-200",

                      "hover:border-[#4ead35]",

                      "hover:bg-[#4ead35]/10",

                      "hover:text-[#318b22]",

                      "focus-visible:outline-none",

                      "focus-visible:ring-2",

                      "focus-visible:ring-[#4ead35]",

                      "disabled:cursor-not-allowed",

                      "disabled:opacity-50",

                      "dark:shadow-[inset_4px_4px_8px_rgba(0,0,0,0.44)]",

                      "dark:hover:text-[#6ac447]",
                    )}
                  >
                    {suggestion}
                  </button>
                ),
              )}
          </div>
        ) : null}
      </div>

      <div className="grid gap-1">
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
              "size-[14px]",
              "-translate-y-1/2",
              "text-[var(--fixora-foreground-muted)]",
            )}
            strokeWidth={1.7}
          />

          <input
            id={
              emailInputId
            }
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={EMAIL_MAXIMUM_LENGTH}
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
            placeholder={
              translations(
                "email.placeholder",
              )
            }
            className={cn(
              inputClassName,
              "pr-3.5",
            )}
            onChange={
              handleFieldChange(
                "email",
              )
            }
          />
        </div>

        {fieldErrors.email ? (
          <p
            role="alert"
            className={
              fieldErrorClassName
            }
          >
            {fieldErrors.email}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-1">
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
                "size-[14px]",
                "-translate-y-1/2",
                "text-[var(--fixora-foreground-muted)]",
              )}
              strokeWidth={1.7}
            />

            <input
              id={
                passwordInputId
              }
              name="password"
              type={
                passwordVisible
                  ? "text"
                  : "password"
              }
              autoComplete="new-password"
              maxLength={PASSWORD_MAXIMUM_LENGTH}
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
              placeholder={
                translations(
                  "password.placeholder",
                )
              }
              className={cn(
                inputClassName,
                "pr-11",
              )}
              onChange={
                handleFieldChange(
                  "password",
                )
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
                  );

                }
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
              className={
                visibilityButtonClassName
              }
            >
              <ScanEye
                aria-hidden="true"
                className="size-[15px]"
                strokeWidth={1.8}
              />

              <span
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute",
                  "h-px w-[1.15rem]",
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

          <p
            id={
              passwordStatusId
            }
            aria-live="polite"
            className={cn(
              "flex items-center gap-1",
              "px-2.5",
              "text-[0.62rem]",
              "font-medium",

              passwordStrength.level
                === "STRONG"
                ? "text-[#318b22] dark:text-[#6ac447]"
                : "text-[var(--fixora-foreground-muted)]",
            )}
          >
            {passwordStrength.level
              === "STRONG" ? (
              <Check
                aria-hidden="true"
                className="size-3"
                strokeWidth={2.2}
              />
            ) : null}

            {translations(
              `password.strength.${passwordStrength.level.toLowerCase()}`,
            )}
          </p>

          {fieldErrors.password ? (
            <p
              role="alert"
              className={
                fieldErrorClassName
              }
            >
              {fieldErrors.password}
            </p>
          ) : null}
        </div>

        <div className="grid content-start gap-1">
          <div className="relative h-fit">
            <label
              htmlFor={
                passwordConfirmationInputId
              }
              className="sr-only"
            >
              {translations(
                "passwordConfirmation.label",
              )}
            </label>

            <LockKeyhole
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute",
                "top-1/2 left-3.5 z-10",
                "size-[14px]",
                "-translate-y-1/2",
                "text-[var(--fixora-foreground-muted)]",
              )}
              strokeWidth={1.7}
            />

            <input
              id={
                passwordConfirmationInputId
              }
              name="passwordConfirmation"
              type={
                passwordConfirmationVisible
                  ? "text"
                  : "password"
              }
              autoComplete="new-password"
              maxLength={PASSWORD_MAXIMUM_LENGTH}
              value={
                values.passwordConfirmation
              }
              disabled={
                controlsDisabled
              }
              aria-invalid={
                Boolean(
                  fieldErrors.passwordConfirmation,
                )
              }
              required
              placeholder={
                translations(
                  "passwordConfirmation.placeholder",
                )
              }
              className={cn(
                inputClassName,
                "pr-11",
              )}
              onChange={
                handleFieldChange(
                  "passwordConfirmation",
                )
              }
            />

            <button
              type="button"
              disabled={
                controlsDisabled
              }
              onClick={
                () => {
                  setPasswordConfirmationVisible(
                    (
                      currentValue,
                    ) =>
                      !currentValue,
                  );

                }
              }
              aria-pressed={
                passwordConfirmationVisible
              }
              aria-label={
                passwordConfirmationVisible
                  ? hideConfirmationLabel
                  : showConfirmationLabel
              }
              title={
                passwordConfirmationVisible
                  ? hideConfirmationLabel
                  : showConfirmationLabel
              }
              className={
                visibilityButtonClassName
              }
            >
              <ScanEye
                aria-hidden="true"
                className="size-[15px]"
                strokeWidth={1.8}
              />

              <span
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute",
                  "h-px w-[1.15rem]",
                  "rotate-45 rounded-full",
                  "bg-current",

                  "transition-[opacity,transform]",
                  "duration-200",

                  passwordConfirmationVisible
                    ? "scale-100 opacity-100"
                    : "scale-75 opacity-0",
                )}
              />
            </button>
          </div>

          {passwordsMatch ? (
            <p
              className={cn(
                "flex items-center gap-1",
                "px-2.5",
                "text-[0.62rem]",
                "font-medium",
                "text-[#318b22]",
                "dark:text-[#6ac447]",
              )}
            >
              <Check
                aria-hidden="true"
                className="size-3"
                strokeWidth={2.2}
              />

              {resolvedLocale === "es"
                ? "Las contraseñas coinciden"
                : "Passwords match"}
            </p>
          ) : null}

          {fieldErrors
            .passwordConfirmation ? (
            <p
              role="alert"
              className={
                fieldErrorClassName
              }
            >
              {
                fieldErrors
                  .passwordConfirmation
              }
            </p>
          ) : null}
        </div>
      </div>

      {formError ? (
        <p
          id={
            formMessageId
          }
          role="alert"
          aria-live="assertive"
          className={cn(
            "rounded-xl border",
            "border-red-500/20",
            "bg-red-500/8",
            "px-3 py-2",
            "text-center",
            "text-[0.64rem]",
            "font-medium",
            "text-red-700",

            "shadow-[inset_4px_4px_9px_rgba(90,20,20,0.08),inset_-3px_-3px_7px_rgba(255,255,255,0.6)]",

            "dark:text-red-300",

            "dark:shadow-[inset_4px_4px_9px_rgba(0,0,0,0.35)]",
          )}
        >
          {formError}
        </p>
      ) : null}

      {status === "SUCCESS" ? (
        <p
          role="status"
          aria-live="polite"
          className={cn(
            "rounded-xl border",
            "border-[#4ead35]/25",
            "bg-[#4ead35]/8",
            "px-3 py-2",
            "text-center",
            "text-[0.64rem]",
            "font-medium",
            "text-[#318b22]",

            "shadow-[inset_4px_4px_9px_rgba(42,90,42,0.08),inset_-3px_-3px_7px_rgba(255,255,255,0.6)]",

            "dark:text-[#6ac447]",

            "dark:shadow-[inset_4px_4px_9px_rgba(0,0,0,0.35)]",
          )}
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
        className={cn(
          "inline-flex h-10 w-full",

          "items-center justify-center gap-2",

          "rounded-full",

          "border border-[#4ead35]",

          "bg-[#4ead35]",

          "px-6",

          "text-[0.66rem] font-bold",

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

          "sm:h-11",

          "sm:text-[0.7rem]",

          "xl:h-12",

          "xl:text-xs",
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

      <button
        type="button"
        disabled={
          controlsDisabled
        }
        onClick={
          onRequestSignIn
        }
        className={cn(
          "mx-auto rounded-full",

          "px-3 py-1",

          "text-[0.66rem] font-semibold",

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

          "sm:text-[0.7rem]",
        )}
      >
        {translations(
          "actions.signIn",
        )}
      </button>
    </form>
  );
}