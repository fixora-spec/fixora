import type {
  AccountRole,
} from "@/types/account";

import type {
  Locale,
} from "@/types/locale";

import type {
  PasswordResetCodeResponseData,
  PasswordResetRequestResponseData,
} from "@/services/auth";

export type PasswordRecoveryFormStep =
  | "REQUEST_CODE"
  | "VERIFY_CODE";

export type PasswordRecoveryFormStatus =
  | "IDLE"
  | "REQUESTING_CODE"
  | "CODE_SENT"
  | "VERIFYING_CODE"
  | "CODE_VERIFIED"
  | "ERROR";

export type PasswordRecoveryFormValues = {
  email: string;
  code: string;
};

export type PasswordRecoveryFormProps = {
  formId?: string;

  locale?: Locale;

  accountRole?: AccountRole;

  initialEmail?: string;
  initialCode?: string;

  initialStep?:
    PasswordRecoveryFormStep;

  disabled?: boolean;

  onCodeRequested?: (
    result:
      PasswordResetRequestResponseData,
  ) => void;

  onCodeVerified?: (
    result:
      PasswordResetCodeResponseData,
  ) => void;

  onRequestPasswordReset?: (
    result:
      PasswordResetCodeResponseData,
  ) => void;

  onRequestSignIn?: () => void;
};