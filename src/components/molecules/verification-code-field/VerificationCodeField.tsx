"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
} from "react";

import type {
  ChangeEvent,
} from "react";

import {
  AuthField,
} from "@/components/molecules/auth-field";

import type {
  VerificationCodeFieldProps,
  VerificationCodeFieldStatus,
} from "./VerificationCodeField.types";

const DEFAULT_CODE_LENGTH = 6;

const ALPHANUMERIC_PATTERN =
  /^[A-Z0-9]*$/u;

function normalizeGeneratedId(
  value: string,
): string {
  return value.replace(
    /[^A-Za-z0-9_-]/gu,
    "",
  );
}

function normalizeCode(
  value: string,
  codeLength: number,
): string {
  return value
    .toUpperCase()
    .replace(
      /[^A-Z0-9]/gu,
      "",
    )
    .slice(
      0,
      codeLength,
    );
}

function getCodeStatus(
  originalCode: string,
  normalizedCode: string,
  codeLength: number,
): VerificationCodeFieldStatus {
  const uppercaseOriginalCode =
    originalCode.toUpperCase();

  const containsInvalidCharacters =
    !ALPHANUMERIC_PATTERN.test(
      uppercaseOriginalCode,
    );

  const exceedsMaximumLength =
    Array.from(
      uppercaseOriginalCode,
    ).length > codeLength;

  if (
    containsInvalidCharacters
    || exceedsMaximumLength
  ) {
    return "INVALID";
  }

  if (
    normalizedCode.length === 0
  ) {
    return "EMPTY";
  }

  if (
    normalizedCode.length
    === codeLength
  ) {
    return "COMPLETE";
  }

  return "INCOMPLETE";
}

export function VerificationCodeField({
  fieldId,
  name = "verificationCode",
  label,
  description,
  errorMessage,
  code,
  codeLength = DEFAULT_CODE_LENGTH,
  onCodeChange,
  onCodeComplete,
  onStatusChange,
  disabled,
  required = true,
  "aria-describedby":
    providedAriaDescribedBy,
  "aria-invalid":
    providedAriaInvalid,
  ...inputProperties
}: VerificationCodeFieldProps) {
  const generatedId =
    useId();

  const resolvedFieldId =
    fieldId
    ?? `verification-code-field-${normalizeGeneratedId(
      generatedId,
    )}`;

  const normalizedCode =
    useMemo(
      () =>
        normalizeCode(
          code,
          codeLength,
        ),
      [
        code,
        codeLength,
      ],
    );

  const status =
    useMemo(
      () =>
        getCodeStatus(
          code,
          normalizedCode,
          codeLength,
        ),
      [
        code,
        normalizedCode,
        codeLength,
      ],
    );

  const lastCompletedCodeReference =
    useRef<string | null>(
      null,
    );

  useEffect(
    () => {
      onStatusChange?.(
        status,
      );
    },
    [
      status,
      onStatusChange,
    ],
  );

  useEffect(
    () => {
      if (
        status !== "COMPLETE"
      ) {
        lastCompletedCodeReference.current =
          null;

        return;
      }

      if (
        lastCompletedCodeReference.current
        === normalizedCode
      ) {
        return;
      }

      lastCompletedCodeReference.current =
        normalizedCode;

      onCodeComplete?.(
        normalizedCode,
      );
    },
    [
      status,
      normalizedCode,
      onCodeComplete,
    ],
  );

  const handleChange =
    (
      event:
        ChangeEvent<HTMLInputElement>,
    ): void => {
      const nextCode =
        normalizeCode(
          event.target.value,
          codeLength,
        );

      onCodeChange(
        nextCode,
      );
    };

  const invalid =
    status === "INVALID"
    || Boolean(
      errorMessage,
    )
    || providedAriaInvalid === true
    || providedAriaInvalid === "true";

  return (
    <div
      data-verification-code-field=""
      data-verification-code-status={
        status.toLowerCase()
      }
      data-verification-code-complete={
        status === "COMPLETE"
          ? "true"
          : "false"
      }
    >
      <AuthField
        {...inputProperties}
        fieldId={
          resolvedFieldId
        }
        name={name}
        type="text"
        label={label}
        description={
          description
        }
        errorMessage={
          errorMessage
        }
        value={
          normalizedCode
        }
        inputMode="text"
        pattern="[A-Z0-9]{6}"
        minLength={
          codeLength
        }
        maxLength={
          codeLength
        }
        autoComplete="one-time-code"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        disabled={disabled}
        required={required}
        aria-describedby={
          providedAriaDescribedBy
        }
        aria-invalid={
          invalid
        }
        onChange={
          handleChange
        }
      />
    </div>
  );
}