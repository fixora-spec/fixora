import type {
  RegisterUserResponseData,
} from "@/services/auth";

import type {
  Locale,
} from "@/types/locale";

export type UserRegistrationFormStatus =
  | "IDLE"
  | "CHECKING_USERNAME"
  | "SUBMITTING"
  | "SUCCESS"
  | "ERROR";

export type UserRegistrationFormValues = {
  firstNames: string;
  lastNames: string;
  username: string;
  email: string;
  password: string;
  passwordConfirmation: string;
};

export type UserRegistrationFieldName =
  keyof UserRegistrationFormValues;

export type UserRegistrationFieldErrors =
  Partial<
    Record<
      UserRegistrationFieldName,
      string
    >
  >;

export type UserRegistrationFormProps = {
  formId?: string;

  locale?: Locale;

  initialValues?:
    Partial<
      UserRegistrationFormValues
    >;

  disabled?: boolean;

  onSuccess?: (
    result:
      RegisterUserResponseData,
  ) => void;

  onRequestSignIn?:
    () => void;

  onRequestEmailVerification?: (
    result:
      RegisterUserResponseData,
  ) => void;
};