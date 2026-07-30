import type {
  RegisterUserResponseData,
  VerifyEmailResponseData,
} from "@/services/auth";

import type {
  Locale,
} from "@/types/locale";

export type EmailVerificationFormStatus =
  | "IDLE"
  | "VERIFYING"
  | "RESENDING"
  | "SUCCESS"
  | "ERROR";

export type EmailVerificationFormProps = {
  formId?: string;

  accountId: string;
  email: string;
  username?: string;

  verificationExpiresAt?: string | null;
  resendAvailableAt?: string | null;

  locale?: Locale;

  initialCode?: string;

  disabled?: boolean;

  onSuccess?: (
    result: VerifyEmailResponseData,
  ) => void;

  onResendSuccess?: (
    result: RegisterUserResponseData,
  ) => void;

  onRequestSignIn?: () => void;

  onRequestRegistration?: () => void;
};