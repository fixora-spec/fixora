import type {
  AccountRole,
  AccountStatus,
} from "@/types/account";

import type {
  Locale,
} from "@/types/locale";

export const AUTH_VIEWS = [
  "USER_SIGN_IN",
  "USER_REGISTRATION",
  "EMAIL_VERIFICATION",
  "PASSWORD_RECOVERY",
  "PASSWORD_RESET",
  "ADMIN_SIGN_IN",
] as const;

export type AuthView =
  (typeof AUTH_VIEWS)[number];

export const PASSWORD_STRENGTH_LEVELS = [
  "EMPTY",
  "WEAK",
  "MEDIUM",
  "STRONG",
] as const;

export type PasswordStrengthLevel =
  (typeof PASSWORD_STRENGTH_LEVELS)[number];

export type PasswordStrengthResult = {
  level: PasswordStrengthLevel;
  score: number;

  hasMinimumLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSymbol: boolean;
  hasWhitespace: boolean;

  isValid: boolean;
};

export type AuthRequestContext = {
  locale: Locale;
  ipAddress: string | null;
  userAgent: string | null;
};

export type AuthAccountIdentity = {
  accountId: string;

  role: AccountRole;
  status: AccountStatus;

  firstNames: string;
  lastNames: string;

  username: string;
  email: string;

  emailVerifiedAt: string | null;
  createdAt: string;
  lastSignInAt: string | null;
};

export type UserRegistrationRequest = {
  firstNames: string;
  lastNames: string;
  username: string;
  email: string;
  password: string;
  passwordConfirmation: string;
  locale: Locale;
};

export type UserRegistrationResult = {
  accountId: string;
  email: string;
  username: string;

  verificationExpiresAt: string;
  resendAvailableAt: string;
};

export type EmailVerificationRequest = {
  accountId: string;
  code: string;
  locale: Locale;
};

export type EmailVerificationResult = {
  account: AuthAccountIdentity;
};

export type SignInRequest = {
  email: string;
  password: string;
  locale: Locale;
};

export type UserSignInRequest =
  SignInRequest;

export type AdminSignInRequest =
  SignInRequest;

export type SignInResult = {
  account: AuthAccountIdentity;

  session: {
    expiresAt: string;
  };
};

export type UsernameAvailabilityRequest = {
  username: string;
};

export type UsernameAvailabilityReason =
  | "TAKEN"
  | "TOO_SIMILAR"
  | "INVALID"
  | null;

export type UsernameAvailabilityResult = {
  username: string;
  normalizedUsername: string;

  available: boolean;
  reason: UsernameAvailabilityReason;
  suggestions: readonly string[];
};

export type UsernameSuggestionsRequest = {
  firstNames?: string;
  requestedUsername: string;
};

export type UsernameSuggestion = {
  value: string;
  available: boolean;
};

export type UsernameSuggestionsResult = {
  suggestions: readonly string[];
};

export type VerificationPurpose =
  | "EMAIL_VERIFICATION"
  | "PASSWORD_RESET"
  | "ADMIN_ACTIVATION";

export type ResendVerificationRequest = {
  accountId: string;
  purpose: VerificationPurpose;
  locale: Locale;
};

export type ResendVerificationResult = {
  accountId: string;
  username: string;
  email: string;

  verificationExpiresAt: string;
  resendAvailableAt: string;
};

export type PasswordResetRequest = {
  email: string;
  accountRole: AccountRole;
  locale: Locale;
};

export type PasswordResetRequestResult = {
  accepted: true;
  expiresAt: string | null;
  resendAvailableAt: string | null;
};

export type PasswordResetCodeVerificationRequest = {
  email: string;
  accountRole: AccountRole;
  code: string;
  locale: Locale;
};

export type PasswordResetCodeVerificationResult = {
  resetToken: string;
  expiresAt: string;
};

export type PasswordChangeRequest = {
  resetToken: string;
  password: string;
  passwordConfirmation: string;
  locale: Locale;
};

export type PasswordChangeResult = {
  accountId: string;
};

export type SignOutResult = {
  signedOut: true;
  message?: string;
};

export type AuthenticatedSession = {
  authenticated: true;
  account: AuthAccountIdentity;
  expiresAt: string;
};

export type AnonymousSession = {
  authenticated: false;
  account: null;
  expiresAt: null;
};

export type AuthSession =
  | AuthenticatedSession
  | AnonymousSession;

export const AUTH_ERROR_CODES = [
  "INVALID_REQUEST",
  "INVALID_ORIGIN",
  "INVALID_JSON",
  "BODY_TOO_LARGE",

  "VALIDATION_ERROR",
  "FIELD_REQUIRED",
  "INVALID_NAME",
  "INVALID_USERNAME",
  "USERNAME_UNAVAILABLE",
  "USERNAME_TOO_SIMILAR",
  "INVALID_EMAIL",
  "EMAIL_ALREADY_REGISTERED",

  "INVALID_PASSWORD",
  "PASSWORDS_DO_NOT_MATCH",

  "ACCOUNT_NOT_FOUND",
  "ACCOUNT_NOT_VERIFIED",
  "ACCOUNT_DISABLED",
  "ACCOUNT_LOCKED",
  "INVALID_CREDENTIALS",
  "ROLE_NOT_ALLOWED",

  "INVALID_VERIFICATION_CODE",
  "VERIFICATION_CODE_EXPIRED",
  "VERIFICATION_CODE_CONSUMED",
  "VERIFICATION_ATTEMPTS_EXCEEDED",
  "VERIFICATION_RESEND_BLOCKED",

  "INVALID_RESET_TOKEN",
  "RESET_TOKEN_EXPIRED",

  "RATE_LIMITED",
  "DATABASE_UNAVAILABLE",
  "EMAIL_DELIVERY_FAILED",
  "INTERNAL_ERROR",
] as const;

export type AuthErrorCode =
  (typeof AUTH_ERROR_CODES)[number];

export type AuthFieldName =
  | "firstNames"
  | "lastNames"
  | "username"
  | "email"
  | "password"
  | "passwordConfirmation"
  | "code"
  | "accountId"
  | "accountRole"
  | "locale"
  | "resetToken";

export type AuthFieldError = {
  field: AuthFieldName;
  code: AuthErrorCode;
};

export type AuthApiError = {
  success: false;

  error: {
    code: AuthErrorCode;
    message: string;

    fieldErrors?: readonly AuthFieldError[];
    retryAfterSeconds?: number;
  };
};

export type AuthApiSuccess<TData> = {
  success: true;
  data: TData;
};

export type AuthApiResponse<TData> =
  | AuthApiSuccess<TData>
  | AuthApiError;

/*
 * Tipos heredados del primer proveedor de autenticación. Se conservan para
 * compatibilidad, pero el token de recuperación debe permanecer solamente en
 * memoria y nunca persistirse en localStorage o sessionStorage.
 */
export type AuthPanelState = {
  isOpen: boolean;
  view: AuthView;

  pendingAccountId: string | null;
  pendingEmail: string | null;
  pendingAccountRole: AccountRole | null;
  passwordResetToken: string | null;
};

export type AuthState = {
  isInitializing: boolean;
  isSubmitting: boolean;

  session: AuthSession;
  panel: AuthPanelState;

  error: AuthApiError["error"] | null;
};

export type OpenAuthOptions = {
  view?: AuthView;
  email?: string;
  accountRole?: AccountRole;
};

export type AuthContextValue =
  AuthState & {
    openAuth: (
      options?: OpenAuthOptions,
    ) => void;

    closeAuth: () => void;

    changeAuthView: (
      view: AuthView,
    ) => void;

    refreshSession: () => Promise<void>;

    signOut: () => Promise<void>;

    clearAuthError: () => void;

    setPendingVerification: (
      accountId: string,
      email: string,
    ) => void;

    setPasswordResetToken: (
      resetToken: string,
    ) => void;
  };

export function isAuthView(
  value: unknown,
): value is AuthView {
  return (
    typeof value === "string"
    && AUTH_VIEWS.includes(
      value as AuthView,
    )
  );
}

export function isAuthErrorCode(
  value: unknown,
): value is AuthErrorCode {
  return (
    typeof value === "string"
    && AUTH_ERROR_CODES.includes(
      value as AuthErrorCode,
    )
  );
}