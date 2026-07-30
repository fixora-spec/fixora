export const USERNAME_RULES = {
  minimumLength: 3,
  maximumLength: 40,

  allowedPattern:
    /^[\p{L}\p{N}._-]+$/u,

  normalizationPattern:
    /[\s._-]+/gu,
} as const;

export const PERSON_NAME_RULES = {
  minimumLength: 2,

  firstNamesMaximumLength: 100,
  lastNamesMaximumLength: 150,

  allowedPattern:
    /^[\p{L}\p{M}' -]+$/u,
} as const;

export const EMAIL_RULES = {
  minimumLength: 5,
  maximumLength: 320,

  formatPattern:
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/u,
} as const;

export const USER_PASSWORD_RULES = {
  minimumLength: 8,
  maximumLength: 128,

  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSymbol: true,

  allowWhitespace: false,
} as const;

export const ADMIN_PASSWORD_RULES = {
  ...USER_PASSWORD_RULES,

  minimumLength: 12,
} as const;

export const ASSISTANT_PASSWORD_RULES = {
  minimumLength: 8,
  maximumLength: 30,

  generatedPasswordCount: 5,
} as const;

export const VERIFICATION_CODE_RULES = {
  length: 6,

  alphabet:
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",

  formatPattern:
    /^[A-Z0-9]{6}$/u,
} as const;

export const AUTH_SESSION_RULES = {
  defaultTimeToLiveHours: 168,

  cookieNameFallback:
    "fixora_session",

  cookieSameSite:
    "lax" as const,

  cookiePath:
    "/",
} as const;

export const AUTH_ATTEMPT_RULES = {
  maximumSignInAttempts: 5,

  accountLockMinutes: 15,

  maximumVerificationAttempts: 5,

  verificationResendCooldownSeconds: 60,
} as const;

export const AUTH_REQUEST_LIMITS = {
  maximumJsonBodyBytes:
    32 * 1024,

  maximumUserAgentLength: 512,

  maximumIpAddressLength: 45,
} as const;

export const AUTH_AUTOMATIC_OPEN_RULES = {
  storageKey:
    "fixora:auth:auto-opened",

  eventName:
    "fixora:preloader-completed",
} as const;

export const AUTH_RATE_LIMIT_ACTIONS = {
  userRegistration:
    "USER_REGISTRATION",

  userSignIn:
    "USER_SIGN_IN",

  adminSignIn:
    "ADMIN_SIGN_IN",

  emailVerification:
    "EMAIL_VERIFICATION",

  verificationResend:
    "VERIFICATION_RESEND",

  passwordResetRequest:
    "PASSWORD_RESET_REQUEST",

  passwordResetVerification:
    "PASSWORD_RESET_VERIFICATION",

  passwordResetCompletion:
    "PASSWORD_RESET_COMPLETION",

  usernameAvailability:
    "USERNAME_AVAILABILITY",
} as const;

export const AUTH_AUDIT_EVENTS = {
  userRegistered:
    "USER_REGISTERED",

  emailVerified:
    "EMAIL_VERIFIED",

  userSignInSucceeded:
    "USER_SIGN_IN_SUCCEEDED",

  userSignInFailed:
    "USER_SIGN_IN_FAILED",

  adminSignInSucceeded:
    "ADMIN_SIGN_IN_SUCCEEDED",

  adminSignInFailed:
    "ADMIN_SIGN_IN_FAILED",

  passwordResetRequested:
    "PASSWORD_RESET_REQUESTED",

  passwordResetCompleted:
    "PASSWORD_RESET_COMPLETED",

  sessionCreated:
    "SESSION_CREATED",

  sessionRevoked:
    "SESSION_REVOKED",

  administratorProvisioned:
    "ADMIN_ACCOUNT_PROVISIONED",
} as const;

export const AUTH_NOTIFICATION_KEYS = {
  userAccountCreated: {
    type: "USER_ACCOUNT_CREATED",
    title:
      "auth.notifications.accountCreated.title",
    message:
      "auth.notifications.accountCreated.message",
  },

  adminAccountActivated: {
    type: "ADMIN_ACCOUNT_ACTIVATED",
    title:
      "auth.notifications.adminActivated.title",
    message:
      "auth.notifications.adminActivated.message",
  },

  passwordChanged: {
    type: "PASSWORD_CHANGED",
    title:
      "auth.notifications.passwordChanged.title",
    message:
      "auth.notifications.passwordChanged.message",
  },
} as const;

export const AUTH_CONFIG = {
  username:
    USERNAME_RULES,

  personName:
    PERSON_NAME_RULES,

  email:
    EMAIL_RULES,

  userPassword:
    USER_PASSWORD_RULES,

  adminPassword:
    ADMIN_PASSWORD_RULES,

  assistantPassword:
    ASSISTANT_PASSWORD_RULES,

  verificationCode:
    VERIFICATION_CODE_RULES,

  session:
    AUTH_SESSION_RULES,

  attempts:
    AUTH_ATTEMPT_RULES,

  requestLimits:
    AUTH_REQUEST_LIMITS,

  automaticOpen:
    AUTH_AUTOMATIC_OPEN_RULES,

  rateLimitActions:
    AUTH_RATE_LIMIT_ACTIONS,

  auditEvents:
    AUTH_AUDIT_EVENTS,

  notificationKeys:
    AUTH_NOTIFICATION_KEYS,
} as const;