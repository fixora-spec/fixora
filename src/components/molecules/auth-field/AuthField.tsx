"use client";

import {
  forwardRef,
  useId,
} from "react";

import type {
  AriaAttributes,
} from "react";

import type {
  AuthFieldProps,
} from "./AuthField.types";

function normalizeGeneratedId(
  value: string,
): string {
  return value.replace(
    /[^A-Za-z0-9_-]/gu,
    "",
  );
}

function combineDescriptionIds(
  ...values:
    Array<
      string
      | undefined
    >
): string | undefined {
  const identifiers =
    values
      .flatMap(
        (
          value,
        ) =>
          value
            ?.split(/\s+/u)
            .filter(Boolean)
          ?? [],
      );

  const uniqueIdentifiers =
    Array.from(
      new Set(
        identifiers,
      ),
    );

  return uniqueIdentifiers.length
    > 0
    ? uniqueIdentifiers.join(" ")
    : undefined;
}

function resolveAriaInvalid(
  errorMessage:
    AuthFieldProps[
      "errorMessage"
    ],
  providedValue:
    AriaAttributes[
      "aria-invalid"
    ],
): AriaAttributes[
  "aria-invalid"
] {
  if (
    errorMessage !== undefined
    && errorMessage !== null
    && errorMessage !== false
  ) {
    return true;
  }

  return providedValue;
}

export const AuthField =
  forwardRef<
    HTMLInputElement,
    AuthFieldProps
  >(
    function AuthField(
      {
        fieldId,
        name,
        type = "text",
        label,
        description,
        errorMessage,
        labelSuffix,
        containerProps,
        required,
        disabled,
        "aria-describedby":
          providedAriaDescribedBy,
        "aria-invalid":
          providedAriaInvalid,
        ...inputProperties
      },
      forwardedReference,
    ) {
      const generatedId =
        useId();

      const resolvedFieldId =
        fieldId
        ?? `auth-field-${normalizeGeneratedId(
          generatedId,
        )}`;

      const descriptionId =
        description !== undefined
        && description !== null
          ? `${resolvedFieldId}-description`
          : undefined;

      const errorMessageId =
        errorMessage !== undefined
        && errorMessage !== null
        && errorMessage !== false
          ? `${resolvedFieldId}-error`
          : undefined;

      const describedBy =
        combineDescriptionIds(
          providedAriaDescribedBy,
          descriptionId,
          errorMessageId,
        );

      const ariaInvalid =
        resolveAriaInvalid(
          errorMessage,
          providedAriaInvalid,
        );

      return (
        <div
          {...containerProps}
          data-auth-field=""
          data-auth-field-name={
            name
          }
          data-auth-field-invalid={
            ariaInvalid === true
            || ariaInvalid === "true"
              ? "true"
              : "false"
          }
          data-auth-field-disabled={
            disabled
              ? "true"
              : "false"
          }
        >
          <label
            htmlFor={
              resolvedFieldId
            }
          >
            <span>
              {label}
            </span>

            {labelSuffix ? (
              <span>
                {labelSuffix}
              </span>
            ) : null}
          </label>

          {description ? (
            <p
              id={
                descriptionId
              }
            >
              {description}
            </p>
          ) : null}

          <input
            {...inputProperties}
            ref={
              forwardedReference
            }
            id={
              resolvedFieldId
            }
            name={name}
            type={type}
            required={required}
            disabled={disabled}
            aria-describedby={
              describedBy
            }
            aria-invalid={
              ariaInvalid
            }
          />

          {errorMessage ? (
            <p
              id={
                errorMessageId
              }
              role="alert"
              aria-live="assertive"
            >
              {errorMessage}
            </p>
          ) : null}
        </div>
      );
    },
  );

AuthField.displayName =
  "AuthField";