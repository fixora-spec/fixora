export const ACCOUNT_ROLES = [
  "USER",
  "ADMIN",
] as const;

export type AccountRole =
  (typeof ACCOUNT_ROLES)[number];

export const ACCOUNT_STATUSES = [
  "PENDING_VERIFICATION",
  "ACTIVE",
  "DISABLED",
  "LOCKED",
] as const;

export type AccountStatus =
  (typeof ACCOUNT_STATUSES)[number];

export type AccountId = string;

export type AccountProfile = {
  id: AccountId;
  role: AccountRole;
  status: AccountStatus;

  firstNames: string;
  lastNames: string;

  username: string;
  email: string;

  avatarUrl: string | null;

  emailVerifiedAt: string | null;
  lastSignInAt: string | null;

  createdAt: string;
  updatedAt: string;
};

export type AccountIdentity = Pick<
  AccountProfile,
  | "id"
  | "role"
  | "status"
  | "firstNames"
  | "lastNames"
  | "username"
  | "email"
  | "avatarUrl"
  | "emailVerifiedAt"
>;

export type AccountHeaderIdentity = Pick<
  AccountProfile,
  | "id"
  | "role"
  | "username"
  | "avatarUrl"
>;

export type ActiveAccount = AccountProfile & {
  status: "ACTIVE";
  emailVerifiedAt: string;
};

export type PendingVerificationAccount =
  AccountProfile & {
    status: "PENDING_VERIFICATION";
    emailVerifiedAt: null;
  };

export function isAccountRole(
  value: unknown,
): value is AccountRole {
  return (
    typeof value === "string"
    && ACCOUNT_ROLES.includes(
      value as AccountRole,
    )
  );
}

export function isAccountStatus(
  value: unknown,
): value is AccountStatus {
  return (
    typeof value === "string"
    && ACCOUNT_STATUSES.includes(
      value as AccountStatus,
    )
  );
}

export function isActiveAccount(
  account: AccountProfile,
): account is ActiveAccount {
  return (
    account.status === "ACTIVE"
    && typeof account.emailVerifiedAt === "string"
  );
}