import "server-only";

export {
  createPendingUserAccount,
  findAccountByEmail,
  findAccountById,
  findAccountByUsername,
  findPotentialUsernameConflicts,
  markAccountEmailAsVerified,
  recordSuccessfulSignIn,
  toAccountPublicRecord,
  updateAccountPassword,
  updateFailedSignInState,
} from "./account.repository";

export type {
  AccountPublicRecord,
  AccountRepositoryRecord,
  CreateUserAccountInput,
  UpdateFailedSignInInput,
  UsernameConflictRecord,
} from "./account.repository";

export {
  createAuthAuditEvent,
  tryCreateAuthAuditEvent,
} from "./audit";

export type {
  AuthAuditEventInput,
  AuthAuditEventRecord,
} from "./audit";

export {
  AuthServiceError,
  checkUsernameAvailability,
  isAuthServiceError,
  registerUser,
  requestPasswordReset,
  resendVerificationCode,
  resetPassword,
  signInAdmin,
  signInUser,
  verifyPasswordResetCode,
  verifyUserEmail,
} from "./auth.service";

export type {
  AuthRequestContext,
  AuthServiceErrorCode,
  PasswordResetCodeResult,
  PasswordResetRequestResult,
  PasswordResetResult,
  RegisterUserResult,
  SignInResult,
  UsernameAvailabilityResult,
  VerifyEmailResult,
} from "./auth.service";

export {
  countUnreadNotifications,
  createNotification,
  listAccountNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "./notification.repository";

export type {
  CreateNotificationInput,
  ListNotificationsInput,
  NotificationRepositoryRecord,
} from "./notification.repository";

export {
  PasswordValidationError,
  analyzePasswordStrength,
  assertValidPassword,
  hashPassword,
  needsPasswordRehash,
  validatePassword,
  verifyPassword,
} from "./password";

export type {
  PasswordValidationIssue,
  PasswordValidationResult,
} from "./password";

export {
  clearExpiredAuthRateLimits,
  consumeAuthRateLimitAttempt,
  consumeDefaultAuthRateLimit,
  getAuthRateLimitPolicy,
  resetAuthRateLimit,
} from "./rate-limit";

export type {
  AuthRateLimitAction,
  AuthRateLimitPolicy,
  ConsumeRateLimitInput,
  RateLimitResult,
} from "./rate-limit";

export {
  createAuthSession,
  createExpiredSessionCookieHeader,
  createSessionCookieHeader,
  createSessionTokenHash,
  findAuthSessionByToken,
  getRequestIpAddress,
  getRequestUserAgent,
  getSessionTokenFromRequest,
  revokeAllAccountSessions,
  revokeAuthSessionByToken,
  touchAuthSession,
  validateAuthSessionToken,
  verifySessionTokenHash,
} from "./session";

export type {
  AuthSessionRecord,
  CreatedAuthSession,
  CreateAuthSessionInput,
  SessionValidationResult,
} from "./session";

export {
  AuthValidationError,
  isAuthValidationError,
  normalizeEmail,
  normalizePersonName,
  normalizeVerificationCode,
  validateAccountRole,
  validateAuthLocale,
  validateEmailAddress,
  validateEmailVerificationRequest,
  validatePasswordChangeRequest,
  validatePasswordResetCodeRequest,
  validatePasswordResetRequest,
  validatePersonName,
  validateSignInRequest,
  validateUserRegistrationRequest,
  validateVerificationCode,
} from "./validation";

export {
  areUsernamesConfusinglySimilar,
  calculateLevenshteinDistance,
  calculateUsernameSimilarity,
  createUsernameComparisonSkeleton,
  generateUsernameCandidates,
  normalizeUsername,
  validateUsername,
} from "./username";

export type {
  UsernameCandidateInput,
  UsernameSimilarityResult,
  UsernameValidationIssue,
  UsernameValidationResult,
} from "./username";

export {
  canAttemptVerification,
  canResendVerificationCode,
  createVerificationCodeHash,
  generateAuthVerificationCode,
  getMaximumVerificationAttempts,
  getRemainingVerificationAttempts,
  getVerificationCodeRemainingSeconds,
  getVerificationCodeTtlMinutes,
  hasExceededVerificationAttempts,
  hasVerificationCodeBeenConsumed,
  hasVerificationCodeExpired,
  isVerificationCodeFormatValid,
  normalizeCode,
  verifyVerificationCodeHash,
} from "./verification-code";

export type {
  GeneratedVerificationCode,
  StoredVerificationCodeState,
} from "./verification-code";