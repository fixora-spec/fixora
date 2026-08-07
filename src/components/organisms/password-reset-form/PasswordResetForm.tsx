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
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
} from "lucide-react";

import {
  ADMIN_PASSWORD_RULES,
  USER_PASSWORD_RULES,
} from "@/config/auth.config";

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
  password: "",
  passwordConfirmation: "",
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
    error instanceof Error
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

function normalizeResetToken(
  resetToken: string,
): string | null {
  const normalizedToken =
    resetToken;

  if (
    normalizedToken.length < 32
    || normalizedToken.length > 2_048
    || !/^[A-Za-z0-9._-]+$/u.test(
      normalizedToken,
    )
  ) {
    return null;
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
    normalizeResetToken(
      resetToken,
    );

  const passwordRules =
    accountRole === "ADMIN"
      ? ADMIN_PASSWORD_RULES
      : USER_PASSWORD_RULES;

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

  const [
    showPassword,
    setShowPassword,
  ] = useState(false);

  const [
    showPasswordConfirmation,
    setShowPasswordConfirmation,
  ] = useState(false);

  const mountedReference =
    useRef(false);

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

  const formControlsDisabled =
    disabled
    || submitting
    || status === "SUCCESS"
    || normalizedResetToken === null;

  const navigationControlsDisabled =
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

  const passwordHasValue =
    values.password.length > 0;

  const requirements = [
    {
      id: "minimum-length",
      label: translations(
        "requirements.minimumLength",
        {
          count:
            passwordRules.minimumLength,
        },
      ),
      satisfied:
        passwordStrength.hasMinimumLength,
    },
    {
      id: "uppercase",
      label: translations(
        "requirements.uppercase",
      ),
      satisfied:
        passwordStrength.hasUppercase,
    },
    {
      id: "lowercase",
      label: translations(
        "requirements.lowercase",
      ),
      satisfied:
        passwordStrength.hasLowercase,
    },
    {
      id: "number",
      label: translations(
        "requirements.number",
      ),
      satisfied:
        passwordStrength.hasNumber,
    },
    {
      id: "symbol",
      label: translations(
        "requirements.symbol",
      ),
      satisfied:
        passwordStrength.hasSymbol,
    },
    {
      id: "whitespace",
      label: translations(
        "requirements.noWhitespace",
      ),
      satisfied:
        passwordHasValue
        && !passwordStrength.hasWhitespace,
    },
  ] as const;

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

      if (
        disabled
        || submitting
        || status === "SUCCESS"
      ) {
        return;
      }

      if (
        normalizedResetToken === null
      ) {
        setStatus(
          "ERROR",
        );

        setFormError(
          translations(
            "errors.unknown",
          ),
        );

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

        if (
          !mountedReference.current
          || abortControllerReference.current !== abortController
          || abortController.signal.aborted
        ) {
          return;
        }

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
        if (
          isAbortError(error)
          || !mountedReference.current
          || abortControllerReference.current !== abortController
        ) {
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
      className={[
        "relative mx-auto flex w-[min(100%,24rem)] max-h-[calc(100dvh-1rem)] flex-col overflow-x-hidden overflow-y-auto overscroll-contain",
        "rounded-[1.55rem] border border-[var(--fixora-otp-card-border)]",
        "bg-[var(--fixora-otp-card)] text-[var(--fixora-foreground)]",
        "px-[clamp(0.95rem,4vw,1.75rem)] py-[clamp(1rem,3vw,1.4rem)]",
        "shadow-[var(--fixora-otp-card-shadow)]",
      ].join(" ")}
    >
      <span
        aria-hidden="true"
        className={[
          "pointer-events-none absolute -top-[3.75rem] -right-[3.6rem]",
          "size-[7.7rem] rounded-full",
          "border border-[var(--fixora-otp-decoration-border)]",
          "bg-[var(--fixora-otp-card)]",
          "shadow-[var(--fixora-otp-decoration-shadow)]",
        ].join(" ")}
      />

      <span
        aria-hidden="true"
        className={[
          "pointer-events-none absolute -bottom-[4.5rem] -left-[4.45rem]",
          "size-[8.7rem] rounded-full",
          "border border-[var(--fixora-otp-decoration-border)]",
          "bg-[var(--fixora-otp-card)]",
          "shadow-[var(--fixora-otp-decoration-shadow)]",
        ].join(" ")}
      />

      <header className="relative z-10 text-center">
        <span
          aria-hidden="true"
          className={[
            "mx-auto flex size-[2.55rem] items-center justify-center rounded-full",
            "border border-[var(--fixora-otp-card-border)]",
            "bg-[var(--fixora-otp-surface-muted)]",
            "text-[var(--fixora-green)] shadow-[var(--fixora-otp-box-shadow)]",
          ].join(" ")}
        >
          <LockKeyhole
            className="size-[1.08rem]"
            strokeWidth={1.8}
          />
        </span>

        <h1 className="mt-3 text-[clamp(1.08rem,4.4vw,1.36rem)] font-black tracking-[-0.035em]">
          {translations(
            "title",
          )}
        </h1>

        <p className="mx-auto mt-2 max-w-[18.5rem] text-[clamp(0.72rem,2.8vw,0.82rem)] leading-[1.5] text-[var(--fixora-foreground-muted)]">
          {translations(
            "description",
          )}
        </p>
      </header>

      <div className="relative z-10 mt-[clamp(1rem,4vw,1.35rem)] space-y-2.5">
        <div>
          <label
            htmlFor={passwordInputId}
            className="sr-only"
          >
            {translations(
              "password.label",
            )}
          </label>

          <div className="relative">
            <LockKeyhole
              aria-hidden="true"
              className={[
                "pointer-events-none absolute top-1/2 left-3.5 z-10 size-[0.95rem] -translate-y-1/2",
                fieldErrors.password
                  ? "text-[var(--fixora-danger)]"
                  : passwordStrength.isValid
                    ? "text-[var(--fixora-green)]"
                    : "text-[var(--fixora-foreground-muted)]",
              ].join(" ")}
              strokeWidth={1.8}
            />

            <input
              id={passwordInputId}
              name="password"
              type={
                showPassword
                  ? "text"
                  : "password"
              }
              autoComplete="new-password"
              maxLength={
                passwordRules.maximumLength
              }
              value={values.password}
              placeholder={translations(
                "password.placeholder",
              )}
              disabled={formControlsDisabled}
              aria-invalid={
                Boolean(
                  fieldErrors.password,
                )
              }
              aria-describedby={passwordStrengthId}
              required
              onChange={
                handleFieldChange(
                  "password",
                )
              }
              className={[
                "fixora-auth-password-input h-[2.8rem] w-full rounded-[0.85rem] border",
                "bg-[var(--fixora-otp-box)] pr-11 pl-10 text-[0.8rem] outline-none",
                "shadow-[var(--fixora-otp-box-shadow)]",
                "transition-[border-color,box-shadow,background-color] duration-200",
                "placeholder:text-[var(--fixora-auth-email-placeholder)]",
                "focus:border-[var(--fixora-otp-active-border)] focus:shadow-[var(--fixora-otp-active-shadow)]",
                "disabled:cursor-not-allowed disabled:opacity-55",
                fieldErrors.password
                  ? "border-[var(--fixora-otp-error-border)] shadow-[var(--fixora-otp-error-button-shadow)]"
                  : passwordStrength.isValid
                    ? "border-[var(--fixora-otp-active-border)]"
                    : "border-[var(--fixora-otp-border)]",
              ].join(" ")}
            />

            <button
              type="button"
              disabled={formControlsDisabled}
              onClick={() => {
                setShowPassword(
                  (current) => !current,
                );
              }}
              aria-label={
                showPassword
                  ? translations(
                      "password.hide",
                    )
                  : translations(
                      "password.show",
                    )
              }
              title={
                showPassword
                  ? translations(
                      "password.hide",
                    )
                  : translations(
                      "password.show",
                    )
              }
              className={[
                "absolute top-1/2 right-2.5 z-20 flex size-7 -translate-y-1/2 items-center justify-center rounded-full",
                "text-[var(--fixora-foreground-muted)] transition-[color,background-color,transform] duration-150",
                "hover:bg-[var(--fixora-otp-surface-muted)] hover:text-[var(--fixora-green)]",
                "active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fixora-green)]/35",
                "disabled:pointer-events-none disabled:opacity-40",
              ].join(" ")}
            >
              {showPassword ? (
                <EyeOff
                  aria-hidden="true"
                  className="size-[0.95rem]"
                  strokeWidth={1.8}
                />
              ) : (
                <Eye
                  aria-hidden="true"
                  className="size-[0.95rem]"
                  strokeWidth={1.8}
                />
              )}
            </button>
          </div>

          <p
            id={passwordStrengthId}
            role="status"
            aria-live="polite"
            className="sr-only"
          >
            {translations(
              `password.strength.${passwordStrength.level.toLowerCase()}`,
            )}
          </p>

          {fieldErrors.password ? (
            <p
              role="alert"
              className="mt-1.5 flex items-start gap-1.5 text-[0.64rem] leading-relaxed font-medium text-[var(--fixora-danger)]"
            >
              <CircleAlert
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0"
                strokeWidth={1.9}
              />
              <span>
                {fieldErrors.password}
              </span>
            </p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor={passwordConfirmationInputId}
            className="sr-only"
          >
            {translations(
              "passwordConfirmation.label",
            )}
          </label>

          <div className="relative">
            <LockKeyhole
              aria-hidden="true"
              className={[
                "pointer-events-none absolute top-1/2 left-3.5 z-10 size-[0.95rem] -translate-y-1/2",
                fieldErrors.passwordConfirmation
                  ? "text-[var(--fixora-danger)]"
                  : passwordsMatch
                    ? "text-[var(--fixora-green)]"
                    : "text-[var(--fixora-foreground-muted)]",
              ].join(" ")}
              strokeWidth={1.8}
            />

            <input
              id={passwordConfirmationInputId}
              name="passwordConfirmation"
              type={
                showPasswordConfirmation
                  ? "text"
                  : "password"
              }
              autoComplete="new-password"
              maxLength={
                passwordRules.maximumLength
              }
              value={
                values.passwordConfirmation
              }
              placeholder={translations(
                "passwordConfirmation.placeholder",
              )}
              disabled={formControlsDisabled}
              aria-invalid={
                Boolean(
                  fieldErrors.passwordConfirmation,
                )
              }
              required
              onChange={
                handleFieldChange(
                  "passwordConfirmation",
                )
              }
              className={[
                "fixora-auth-password-input h-[2.8rem] w-full rounded-[0.85rem] border",
                "bg-[var(--fixora-otp-box)] pr-11 pl-10 text-[0.8rem] outline-none",
                "shadow-[var(--fixora-otp-box-shadow)]",
                "transition-[border-color,box-shadow,background-color] duration-200",
                "placeholder:text-[var(--fixora-auth-email-placeholder)]",
                "focus:border-[var(--fixora-otp-active-border)] focus:shadow-[var(--fixora-otp-active-shadow)]",
                "disabled:cursor-not-allowed disabled:opacity-55",
                fieldErrors.passwordConfirmation
                  ? "border-[var(--fixora-otp-error-border)] shadow-[var(--fixora-otp-error-button-shadow)]"
                  : passwordsMatch
                    ? "border-[var(--fixora-otp-active-border)]"
                    : "border-[var(--fixora-otp-border)]",
              ].join(" ")}
            />

            <button
              type="button"
              disabled={formControlsDisabled}
              onClick={() => {
                setShowPasswordConfirmation(
                  (current) => !current,
                );
              }}
              aria-label={
                showPasswordConfirmation
                  ? translations(
                      "password.hide",
                    )
                  : translations(
                      "password.show",
                    )
              }
              title={
                showPasswordConfirmation
                  ? translations(
                      "password.hide",
                    )
                  : translations(
                      "password.show",
                    )
              }
              className={[
                "absolute top-1/2 right-2.5 z-20 flex size-7 -translate-y-1/2 items-center justify-center rounded-full",
                "text-[var(--fixora-foreground-muted)] transition-[color,background-color,transform] duration-150",
                "hover:bg-[var(--fixora-otp-surface-muted)] hover:text-[var(--fixora-green)]",
                "active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fixora-green)]/35",
                "disabled:pointer-events-none disabled:opacity-40",
              ].join(" ")}
            >
              {showPasswordConfirmation ? (
                <EyeOff
                  aria-hidden="true"
                  className="size-[0.95rem]"
                  strokeWidth={1.8}
                />
              ) : (
                <Eye
                  aria-hidden="true"
                  className="size-[0.95rem]"
                  strokeWidth={1.8}
                />
              )}
            </button>
          </div>

          {fieldErrors.passwordConfirmation ? (
            <p
              role="alert"
              className="mt-1.5 flex items-start gap-1.5 text-[0.64rem] leading-relaxed font-medium text-[var(--fixora-danger)]"
            >
              <CircleAlert
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0"
                strokeWidth={1.9}
              />
              <span>
                {fieldErrors.passwordConfirmation}
              </span>
            </p>
          ) : null}
        </div>
      </div>

      <section
        aria-labelledby={`${passwordStrengthId}-requirements-title`}
        className="relative z-10 mx-auto mt-3.5 w-full max-w-[20rem]"
      >
        <h2
          id={`${passwordStrengthId}-requirements-title`}
          className="text-[0.7rem] font-bold text-[var(--fixora-foreground)]"
        >
          {translations(
            "requirements.title",
          )}
        </h2>

        <ul className="mt-2 space-y-1">
          {requirements.map(
            (requirement) => (
              <li
                key={requirement.id}
                className={[
                  "flex items-center gap-1.75 text-[0.64rem] leading-[1.35] transition-colors duration-200",
                  requirement.satisfied
                    ? "text-[var(--fixora-green)]"
                    : "text-[var(--fixora-foreground-muted)]",
                ].join(" ")}
              >
                <span
                  aria-hidden="true"
                  className={[
                    "flex size-3.5 shrink-0 items-center justify-center rounded-full border",
                    requirement.satisfied
                      ? "border-[var(--fixora-green)] bg-[var(--fixora-green)] text-white shadow-[0_0_8px_var(--fixora-otp-glow)]"
                      : "border-[var(--fixora-otp-border)] bg-[var(--fixora-otp-surface-muted)]",
                  ].join(" ")}
                >
                  {requirement.satisfied ? (
                    <Check
                      className="size-2.25"
                      strokeWidth={2.8}
                    />
                  ) : null}
                </span>

                <span>
                  {requirement.label}
                </span>
              </li>
            ),
          )}
        </ul>
      </section>

      {formError ? (
        <p
          id={formMessageId}
          role="alert"
          aria-live="assertive"
          className="relative z-10 mt-3 flex items-start justify-center gap-2 text-center text-[0.67rem] leading-relaxed font-medium text-[var(--fixora-danger)]"
        >
          <CircleAlert
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0"
            strokeWidth={1.9}
          />
          <span>{formError}</span>
        </p>
      ) : null}

      {status === "SUCCESS" ? (
        <p
          role="status"
          aria-live="polite"
          className="relative z-10 mt-3 flex items-center justify-center gap-2 text-center text-[0.69rem] font-semibold text-[var(--fixora-green)]"
        >
          <span className="flex size-5 items-center justify-center rounded-full bg-[var(--fixora-green)] text-white shadow-[0_0_10px_var(--fixora-otp-glow)]">
            <Check
              aria-hidden="true"
              className="size-3"
              strokeWidth={2.8}
            />
          </span>
          <span>
            {translations(
              "success",
            )}
          </span>
        </p>
      ) : null}

      {status !== "SUCCESS" ? (
        <button
          type="submit"
          disabled={formControlsDisabled}
          className={[
            "relative z-10 mt-[clamp(0.9rem,3.5vw,1.15rem)] flex h-[2.85rem] w-full items-center justify-center gap-2",
            "rounded-[0.9rem] border border-[var(--fixora-otp-button-border)]",
            passwordStrength.isValid
            && passwordsMatch
            && !submitting
              ? "bg-[linear-gradient(145deg,var(--fixora-green-light),var(--fixora-green-dark))] text-white shadow-[var(--fixora-otp-success-button-shadow)]"
              : "bg-[var(--fixora-otp-button)] text-[var(--fixora-foreground)] shadow-[var(--fixora-otp-button-shadow)]",
            "text-[0.82rem] font-semibold",
            "transition-[transform,box-shadow,opacity] duration-200",
            "hover:-translate-y-px active:translate-y-0 active:scale-[0.99]",
            "disabled:pointer-events-none disabled:opacity-55",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fixora-green)]/40",
            "motion-reduce:transition-none motion-reduce:hover:translate-y-0",
          ].join(" ")}
        >
          {submitting ? (
            <LoaderCircle
              aria-hidden="true"
              className="size-4 animate-spin motion-reduce:animate-none"
              strokeWidth={2}
            />
          ) : passwordStrength.isValid
            && passwordsMatch ? (
            <LockKeyhole
              aria-hidden="true"
              className="size-4"
              strokeWidth={2}
            />
          ) : null}

          <span>
            {submitting
              ? translations(
                  "actions.submitting",
                )
              : translations(
                  "actions.submit",
                )}
          </span>
        </button>
      ) : null}

      {status === "SUCCESS" ? (
        <button
          type="button"
          disabled={navigationControlsDisabled}
          onClick={handleSignInRequest}
          className={[
            "relative z-10 mt-3.5 flex h-[2.85rem] w-full items-center justify-center gap-2",
            "rounded-[0.9rem] border border-[var(--fixora-otp-button-border)]",
            "bg-[linear-gradient(145deg,var(--fixora-green-light),var(--fixora-green-dark))]",
            "text-[0.82rem] font-semibold text-white shadow-[var(--fixora-otp-success-button-shadow)]",
            "transition-[transform,box-shadow,opacity] duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[0.99]",
            "disabled:pointer-events-none disabled:opacity-55",
          ].join(" ")}
        >
          <Check
            aria-hidden="true"
            className="size-4"
            strokeWidth={2.3}
          />
          <span>
            {translations(
              "actions.signIn",
            )}
          </span>
        </button>
      ) : null}

      <button
        type="button"
        disabled={navigationControlsDisabled}
        onClick={handleRecoveryRequest}
        className={[
          "relative z-10 mx-auto mt-2.5 text-[0.66rem] font-medium",
          "text-[var(--fixora-foreground-muted)] transition-colors duration-150",
          "hover:text-[var(--fixora-green)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fixora-green)]/30",
          "disabled:pointer-events-none disabled:opacity-40",
        ].join(" ")}
      >
        {translations(
          "actions.requestAnotherCode",
        )}
      </button>
    </form>
  );
}