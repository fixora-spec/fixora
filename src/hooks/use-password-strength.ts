"use client";

import {
  useMemo,
} from "react";

import {
  ADMIN_PASSWORD_RULES,
  USER_PASSWORD_RULES,
} from "@/config/auth.config";

import type {
  AccountRole,
} from "@/types/account";

import type {
  PasswordStrengthLevel,
  PasswordStrengthResult,
} from "@/types/auth";

type PasswordRules = {
  minimumLength: number;
  maximumLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
  allowWhitespace: boolean;
};

export type UsePasswordStrengthOptions = {
  password: string;
  accountRole?: AccountRole;
};

function getPasswordRules(
  accountRole: AccountRole,
): PasswordRules {
  return accountRole === "ADMIN"
    ? ADMIN_PASSWORD_RULES
    : USER_PASSWORD_RULES;
}

function calculateStrengthLevel(
  password: string,
  score: number,
  valid: boolean,
): PasswordStrengthLevel {
  if (password.length === 0) {
    return "EMPTY";
  }

  if (
    score <= 2
    || password.length < 8
  ) {
    return "WEAK";
  }

  if (
    score <= 4
    || !valid
    || password.length < 12
  ) {
    return "MEDIUM";
  }

  return "STRONG";
}

export function calculateClientPasswordStrength(
  password: string,
  accountRole: AccountRole = "USER",
): PasswordStrengthResult {
  const rules =
    getPasswordRules(
      accountRole,
    );

  const hasMinimumLength =
    password.length
    >= rules.minimumLength;

  const hasUppercase =
    /[A-Z]/u.test(
      password,
    );

  const hasLowercase =
    /[a-z]/u.test(
      password,
    );

  const hasNumber =
    /\d/u.test(
      password,
    );

  const hasSymbol =
    /[^\p{L}\p{N}\s]/u.test(
      password,
    );

  const hasWhitespace =
    /\s/u.test(
      password,
    );

  const isWithinMaximumLength =
    password.length
    <= rules.maximumLength;

  const requirements = [
    hasMinimumLength,

    !rules.requireUppercase
      || hasUppercase,

    !rules.requireLowercase
      || hasLowercase,

    !rules.requireNumber
      || hasNumber,

    !rules.requireSymbol
      || hasSymbol,

    rules.allowWhitespace
      || !hasWhitespace,

    isWithinMaximumLength,
  ];

  let score =
    requirements.filter(
      Boolean,
    ).length;

  if (password.length >= 12) {
    score += 1;
  }

  if (password.length >= 16) {
    score += 1;
  }

  score =
    Math.min(
      score,
      7,
    );

  const isValid =
    password.length > 0
    && requirements.every(
      Boolean,
    );

  return {
    level:
      calculateStrengthLevel(
        password,
        score,
        isValid,
      ),

    score,

    hasMinimumLength,
    hasUppercase,
    hasLowercase,
    hasNumber,
    hasSymbol,
    hasWhitespace,

    isValid,
  };
}

export function usePasswordStrength({
  password,
  accountRole = "USER",
}: UsePasswordStrengthOptions):
  PasswordStrengthResult {
  return useMemo(
    () =>
      calculateClientPasswordStrength(
        password,
        accountRole,
      ),
    [
      password,
      accountRole,
    ],
  );
}