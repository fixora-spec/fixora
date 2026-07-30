import type {
  SignInResponseData,
} from "@/services/auth";

import type {
  Locale,
} from "@/types/locale";

export type UserSignInFormStatus =
  | "IDLE"
  | "SUBMITTING"
  | "SUCCESS"
  | "ERROR";

export type UserSignInFormProps = {
  formId?: string;

  locale?: Locale;

  initialEmail?: string;

  disabled?: boolean;

  onSuccess?: (
    result: SignInResponseData,
  ) => void;

  onRequestRegistration?:
    () => void;

  onRequestPasswordRecovery?:
    () => void;

  onRequestAdminSignIn?:
    () => void;
};