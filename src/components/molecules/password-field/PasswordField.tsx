"use client";

import {
  useId,
  useState,
} from "react";

import type {
  MouseEvent,
} from "react";

import {
  AuthField,
} from "@/components/molecules/auth-field";

import type {
  PasswordFieldProps,
} from "./PasswordField.types";

function normalizeGeneratedId(
  value: string,
): string {
  return value.replace(
    /[^A-Za-z0-9_-]/gu,
    "",
  );
}

export function PasswordField({
  fieldId,
  passwordVisible,
  defaultPasswordVisible = false,
  showVisibilityControl = true,
  showPasswordLabel,
  hidePasswordLabel,
  visibilityContent,
  visibilityButtonProps,
  onPasswordVisibilityChange,
  disabled,
  ...authFieldProperties
}: PasswordFieldProps) {
  const generatedId =
    useId();

  const resolvedFieldId =
    fieldId
    ?? `password-field-${normalizeGeneratedId(
      generatedId,
    )}`;

  const [
    internalPasswordVisible,
    setInternalPasswordVisible,
  ] = useState<boolean>(
    defaultPasswordVisible,
  );

  const controlled =
    typeof passwordVisible
      === "boolean";

  const resolvedPasswordVisible =
    controlled
      ? passwordVisible
      : internalPasswordVisible;

  const visibilityLabel =
    resolvedPasswordVisible
      ? hidePasswordLabel
      : showPasswordLabel;

  const visibilityButtonDisabled =
    disabled
    || visibilityButtonProps
      ?.disabled;

  const resolvedVisibilityContent =
    typeof visibilityContent
      === "function"
      ? visibilityContent(
          resolvedPasswordVisible,
        )
      : visibilityContent
        ?? visibilityLabel;

  const handleVisibilityToggle =
    (
      event:
        MouseEvent<HTMLButtonElement>,
    ): void => {
      event.preventDefault();

      if (
        visibilityButtonDisabled
      ) {
        return;
      }

      const nextPasswordVisible =
        !resolvedPasswordVisible;

      if (!controlled) {
        setInternalPasswordVisible(
          nextPasswordVisible,
        );
      }

      onPasswordVisibilityChange?.(
        nextPasswordVisible,
      );
    };

  return (
    <div
      data-password-field=""
      data-password-visible={
        resolvedPasswordVisible
          ? "true"
          : "false"
      }
    >
      <AuthField
        {...authFieldProperties}
        fieldId={
          resolvedFieldId
        }
        type={
          resolvedPasswordVisible
            ? "text"
            : "password"
        }
        disabled={disabled}
      />

      {showVisibilityControl ? (
        <button
          {...visibilityButtonProps}
          type="button"
          disabled={
            visibilityButtonDisabled
          }
          aria-label={
            visibilityLabel
          }
          aria-controls={
            resolvedFieldId
          }
          aria-pressed={
            resolvedPasswordVisible
          }
          data-password-visibility-control=""
          onClick={
            handleVisibilityToggle
          }
        >
          {
            resolvedVisibilityContent
          }
        </button>
      ) : null}
    </div>
  );
}