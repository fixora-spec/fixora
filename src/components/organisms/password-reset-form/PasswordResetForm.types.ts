import type {
  PasswordResetResponseData,
} from "@/services/auth";

import type {
  AccountRole,
} from "@/types/account";

import type {
  Locale,
} from "@/types/locale";

export type PasswordResetFormStatus =
  | "IDLE"
  | "SUBMITTING"
  | "SUCCESS"
  | "ERROR";

export type PasswordResetFormValues = {
  password: string;
  passwordConfirmation: string;
};

export type PasswordResetFormFieldName =
  keyof PasswordResetFormValues;

export type PasswordResetFormFieldErrors =
  Partial<
    Record<
      PasswordResetFormFieldName,
      string
    >
  >;

export type PasswordResetFormProps = {
  formId?: string;

  resetToken: string;

  locale?: Locale;

  accountRole?: AccountRole;

  disabled?: boolean;

  initialValues?: Partial<
    PasswordResetFormValues
  >;

  onSuccess?: (
    result: PasswordResetResponseData,
  ) => void;

  onRequestSignIn?: () => void;

  onRequestRecovery?: () => void;
};