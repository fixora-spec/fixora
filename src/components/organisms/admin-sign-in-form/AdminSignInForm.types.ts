import type {
  SignInResponseData,
} from "@/services/auth";

import type {
  Locale,
} from "@/types/locale";

export type AdminSignInFormStatus =
  | "IDLE"
  | "SUBMITTING"
  | "SUCCESS"
  | "ERROR";

export type AdminSignInFormValues = {
  email: string;
  password: string;
};

export type AdminSignInFormProps = {
  formId?: string;

  locale?: Locale;

  initialEmail?: string;

  disabled?: boolean;

  onSuccess?: (
    result: SignInResponseData,
  ) => void;

  onRequestUserSignIn?:
    () => void;

  onRequestPasswordRecovery?:
    () => void;
};