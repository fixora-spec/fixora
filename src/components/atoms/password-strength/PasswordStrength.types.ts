import type {
  HTMLAttributes,
  ReactNode,
} from "react";

import type {
  usePasswordStrength,
} from "@/hooks/use-password-strength";

export type PasswordStrengthResult =
  ReturnType<
    typeof usePasswordStrength
  >;

export type PasswordStrengthLevel =
  PasswordStrengthResult[
    "level"
  ];

export type PasswordStrengthValidity =
  PasswordStrengthResult[
    "isValid"
  ];

export type PasswordStrengthRequirement = {
  requirementId: string;

  label:
    ReactNode;

  satisfied:
    boolean;
};

export type PasswordStrengthProps =
  Omit<
    HTMLAttributes<HTMLDivElement>,
    "children"
  > & {
    strengthId?:
      string;

    level:
      PasswordStrengthLevel;

    isValid:
      PasswordStrengthValidity;

    label?:
      ReactNode;

    description?:
      ReactNode;

    requirements?:
      readonly PasswordStrengthRequirement[];

    announceChanges?:
      boolean;

    hidden?:
      boolean;
  };