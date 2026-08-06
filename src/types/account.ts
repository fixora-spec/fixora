export const ACCOUNT_ROLES = Object.freeze([
  "USER",
  "ADMIN",
] as const);

export type AccountRole =
  (typeof ACCOUNT_ROLES)[number];

export const ACCOUNT_STATUSES = Object.freeze([
  "PENDING_VERIFICATION",
  "ACTIVE",
  "DISABLED",
  "LOCKED",
] as const);

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

const ACCOUNT_ROLE_SET: ReadonlySet<string> =
  new Set(ACCOUNT_ROLES);

const ACCOUNT_STATUS_SET: ReadonlySet<string> =
  new Set(ACCOUNT_STATUSES);

const ACCOUNT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function isValidIsoDateString(value: unknown): value is string {
  if (
    typeof value !== "string"
    || value.length < 20
    || value.length > 35
  ) {
    return false;
  }

  const time = Date.parse(value);

  return Number.isFinite(time);
}

export function isAccountId(
  value: unknown,
): value is AccountId {
  return (
    typeof value === "string"
    && ACCOUNT_ID_PATTERN.test(value)
  );
}

export function isAccountRole(
  value: unknown,
): value is AccountRole {
  return (
    typeof value === "string"
    && ACCOUNT_ROLE_SET.has(value)
  );
}

export function isAccountStatus(
  value: unknown,
): value is AccountStatus {
  return (
    typeof value === "string"
    && ACCOUNT_STATUS_SET.has(value)
  );
}

export function isActiveAccount(
  account: AccountProfile,
): account is ActiveAccount {
  return (
    account.status === "ACTIVE"
    && isValidIsoDateString(account.emailVerifiedAt)
  );
}