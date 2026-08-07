import type {
  InputHTMLAttributes,
  ReactNode,
} from "react";

export type VerificationCodeFieldStatus =
  | "EMPTY"
  | "INCOMPLETE"
  | "COMPLETE"
  | "INVALID";

export type VerificationCodeVisualState =
  | "IDLE"
  | "VERIFYING"
  | "SUCCESS"
  | "ERROR";

export type VerificationCodeFieldProps =
  Omit<
    InputHTMLAttributes<HTMLInputElement>,
    | "children"
    | "id"
    | "name"
    | "type"
    | "value"
    | "defaultValue"
    | "onChange"
    | "inputMode"
    | "pattern"
    | "minLength"
    | "maxLength"
    | "autoComplete"
  > & {
    fieldId?: string;

    name?: string;

    label:
      ReactNode;

    description?:
      ReactNode;

    errorMessage?:
      ReactNode;

    code:
      string;

    codeLength?: 6;

    visualState?:
      VerificationCodeVisualState;

    onCodeChange: (
      code: string,
    ) => void;

    onCodeComplete?: (
      code: string,
    ) => void;

    onStatusChange?: (
      status:
        VerificationCodeFieldStatus,
    ) => void;
  };