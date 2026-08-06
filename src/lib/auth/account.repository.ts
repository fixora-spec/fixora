import "server-only";

import {
  DateTime2,
  Int,
  NVarChar,
  Request,
  Transaction,
  UniqueIdentifier,
  VarChar,
} from "mssql";

import {
  createSqlRequest,
  toDatabaseError,
} from "@/lib/database";

import {
  isAccountRole,
  isAccountStatus,
} from "@/types/account";

import type {
  AccountRole,
  AccountStatus,
} from "@/types/account";

export type AccountRepositoryRecord = {
  accountId: string;

  role: AccountRole;
  status: AccountStatus;

  firstNames: string;
  lastNames: string;

  username: string;
  usernameNormalized: string;
  usernameSkeleton: string;

  email: string;
  emailNormalized: string;

  passwordHash: string;

  emailVerifiedAt: Date | null;

  accessStartedAt: Date | null;
  accessExpiresAt: Date | null;

  failedSignInAttempts: number;
  lockedUntil: Date | null;

  createdAt: Date;
  updatedAt: Date;
  lastSignInAt: Date | null;
};

export type AccountPublicRecord = {
  accountId: string;

  role: AccountRole;
  status: AccountStatus;

  firstNames: string;
  lastNames: string;

  username: string;
  email: string;

  emailVerifiedAt: Date | null;

  accessStartedAt: Date | null;
  accessExpiresAt: Date | null;

  createdAt: Date;
  lastSignInAt: Date | null;
};

export type CreateUserAccountInput = {
  accountId: string;

  firstNames: string;
  lastNames: string;

  username: string;
  usernameNormalized: string;
  usernameSkeleton: string;

  email: string;
  emailNormalized: string;

  passwordHash: string;

  createdAt?: Date;
};

export type UsernameConflictRecord = {
  accountId: string;

  username: string;
  usernameNormalized: string;
  usernameSkeleton: string;
};

export type UpdateFailedSignInInput = {
  accountId: string;

  failedAttempts: number;
  lockedUntil: Date | null;

  updatedAt?: Date;
};

type AccountDatabaseRecord = {
  account_id: string;

  role: string;
  status: string;

  first_names: string;
  last_names: string;

  username: string;
  username_normalized: string;
  username_skeleton: string;

  email: string;
  email_normalized: string;

  password_hash: string;

  email_verified_at: Date | null;

  access_started_at: Date | null;
  access_expires_at: Date | null;

  failed_sign_in_attempts: number;
  locked_until: Date | null;

  created_at: Date;
  updated_at: Date;
  last_sign_in_at: Date | null;
};

type UsernameConflictDatabaseRecord = {
  account_id: string;
  username: string;
  username_normalized: string;
  username_skeleton: string;
};

const ACCOUNT_SELECT_COLUMNS = `
  account_id,
  role,
  status,
  first_names,
  last_names,
  username,
  username_normalized,
  username_skeleton,
  email,
  email_normalized,
  password_hash,
  email_verified_at,
  access_started_at,
  access_expires_at,
  failed_sign_in_attempts,
  locked_until,
  created_at,
  updated_at,
  last_sign_in_at
`;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const EMAIL_PATTERN =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

const PASSWORD_HASH_PATTERN =
  /^[A-Za-z0-9_$.-]+$/u;

const FORBIDDEN_CONTROL_CHARACTER_PATTERN =
  /[\u0000-\u001F\u007F]/u;

function validateUuid(
  value: string,
  fieldName: string,
): string {
  const normalizedValue = value.trim().toLowerCase();

  if (!UUID_PATTERN.test(normalizedValue)) {
    throw new Error(`${fieldName} no contiene un UUID válido.`);
  }

  return normalizedValue;
}

function validateDate(
  value: Date,
  fieldName: string,
): Date {
  const normalizedDate = new Date(value);

  if (
    Number.isNaN(normalizedDate.getTime())
    || normalizedDate.getUTCFullYear() < 1
    || normalizedDate.getUTCFullYear() > 9_999
  ) {
    throw new Error(`${fieldName} no contiene una fecha válida.`);
  }

  return normalizedDate;
}

function mapNullableDate(
  value: Date | null,
  fieldName: string,
): Date | null {
  return value === null
    ? null
    : validateDate(value, fieldName);
}

function normalizeRequiredText(
  value: string,
  fieldName: string,
  maximumLength: number,
): string {
  const normalizedValue = value.trim().normalize("NFC");

  if (
    normalizedValue.length === 0
    || normalizedValue.length > maximumLength
    || FORBIDDEN_CONTROL_CHARACTER_PATTERN.test(normalizedValue)
  ) {
    throw new Error(`${fieldName} no contiene un valor válido.`);
  }

  return normalizedValue;
}

function normalizeEmailValue(value: string): string {
  const normalizedEmail = value
    .trim()
    .normalize("NFC")
    .toLowerCase();

  const separatorIndex = normalizedEmail.lastIndexOf("@");

  if (
    normalizedEmail.length < 5
    || normalizedEmail.length > 320
    || separatorIndex <= 0
    || separatorIndex > 64
    || separatorIndex === normalizedEmail.length - 1
    || !EMAIL_PATTERN.test(normalizedEmail)
    || FORBIDDEN_CONTROL_CHARACTER_PATTERN.test(normalizedEmail)
  ) {
    throw new Error("El correo electrónico no es válido.");
  }

  return normalizedEmail;
}

function validatePasswordHash(value: string): string {
  if (
    value.length === 0
    || value.length > 512
    || !PASSWORD_HASH_PATTERN.test(value)
    || FORBIDDEN_CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    throw new Error("passwordHash no contiene un valor válido.");
  }

  // El hash se conserva exactamente como fue producido por password.ts.
  return value;
}

function validateFailedAttempts(value: number): number {
  if (
    !Number.isSafeInteger(value)
    || value < 0
    || value > 1_000
  ) {
    throw new Error(
      "La cantidad de intentos fallidos no es válida.",
    );
  }

  return value;
}

function validateAccountRole(value: string): AccountRole {
  if (!isAccountRole(value)) {
    throw new Error("SQL Server devolvió un rol de cuenta no válido.");
  }

  return value;
}

function validateAccountStatus(value: string): AccountStatus {
  if (!isAccountStatus(value)) {
    throw new Error("SQL Server devolvió un estado de cuenta no válido.");
  }

  return value;
}

function validateDatabaseText(
  value: string,
  fieldName: string,
  maximumLength: number,
): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > maximumLength
    || FORBIDDEN_CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    throw new Error(
      `SQL Server devolvió un valor no válido para ${fieldName}.`,
    );
  }

  return value;
}

function validateDatabaseFailedAttempts(value: number): number {
  if (
    !Number.isSafeInteger(value)
    || value < 0
    || value > 1_000
  ) {
    throw new Error(
      "SQL Server devolvió una cantidad de intentos fallidos no válida.",
    );
  }

  return value;
}

async function createRepositoryRequest(
  transaction?: Transaction,
): Promise<Request> {
  return transaction
    ? new Request(transaction)
    : createSqlRequest();
}

function getAccountsTableSource(transaction?: Transaction): string {
  return transaction
    ? "dbo.accounts WITH (UPDLOCK, HOLDLOCK, ROWLOCK)"
    : "dbo.accounts";
}

function mapAccountRecord(
  record: AccountDatabaseRecord,
): AccountRepositoryRecord {
  const accountId = validateUuid(record.account_id, "account_id");
  const role = validateAccountRole(record.role);
  const status = validateAccountStatus(record.status);

  const email = validateDatabaseText(record.email, "email", 320);
  const emailNormalized = normalizeEmailValue(record.email_normalized);

  if (normalizeEmailValue(email) !== emailNormalized) {
    throw new Error(
      "SQL Server devolvió valores de correo inconsistentes.",
    );
  }

  return {
    accountId,
    role,
    status,
    firstNames: validateDatabaseText(
      record.first_names,
      "first_names",
      100,
    ),
    lastNames: validateDatabaseText(
      record.last_names,
      "last_names",
      150,
    ),
    username: validateDatabaseText(record.username, "username", 40),
    usernameNormalized: validateDatabaseText(
      record.username_normalized,
      "username_normalized",
      40,
    ).toLowerCase(),
    usernameSkeleton: validateDatabaseText(
      record.username_skeleton,
      "username_skeleton",
      40,
    ).toLowerCase(),
    email,
    emailNormalized,
    passwordHash: validatePasswordHash(record.password_hash),
    emailVerifiedAt: mapNullableDate(
      record.email_verified_at,
      "email_verified_at",
    ),
    accessStartedAt: mapNullableDate(
      record.access_started_at,
      "access_started_at",
    ),
    accessExpiresAt: mapNullableDate(
      record.access_expires_at,
      "access_expires_at",
    ),
    failedSignInAttempts: validateDatabaseFailedAttempts(
      record.failed_sign_in_attempts,
    ),
    lockedUntil: mapNullableDate(record.locked_until, "locked_until"),
    createdAt: validateDate(record.created_at, "created_at"),
    updatedAt: validateDate(record.updated_at, "updated_at"),
    lastSignInAt: mapNullableDate(
      record.last_sign_in_at,
      "last_sign_in_at",
    ),
  };
}

export function toAccountPublicRecord(
  account: AccountRepositoryRecord,
): AccountPublicRecord {
  return {
    accountId: account.accountId,
    role: account.role,
    status: account.status,
    firstNames: account.firstNames,
    lastNames: account.lastNames,
    username: account.username,
    email: account.email,
    emailVerifiedAt: account.emailVerifiedAt,
    accessStartedAt: account.accessStartedAt,
    accessExpiresAt: account.accessExpiresAt,
    createdAt: account.createdAt,
    lastSignInAt: account.lastSignInAt,
  };
}

export async function findAccountById(
  accountId: string,
  transaction?: Transaction,
): Promise<AccountRepositoryRecord | null> {
  const normalizedAccountId = validateUuid(accountId, "accountId");

  try {
    const request = await createRepositoryRequest(transaction);

    request.input("accountId", UniqueIdentifier, normalizedAccountId);

    const result = await request.query<AccountDatabaseRecord>(`
      SELECT TOP (1)
        ${ACCOUNT_SELECT_COLUMNS}
      FROM ${getAccountsTableSource(transaction)}
      WHERE account_id = @accountId;
    `);

    const record = result.recordset[0];

    return record ? mapAccountRecord(record) : null;
  } catch (error) {
    throw toDatabaseError(error, "QUERY_FAILED");
  }
}

export async function findAccountByEmail(
  email: string,
  role?: AccountRole,
  transaction?: Transaction,
): Promise<AccountRepositoryRecord | null> {
  const emailNormalized = normalizeEmailValue(email);

  if (typeof role !== "undefined" && !isAccountRole(role)) {
    throw new Error("role no contiene un rol de cuenta válido.");
  }

  try {
    const request = await createRepositoryRequest(transaction);

    request.input("emailNormalized", NVarChar(320), emailNormalized);
    request.input("role", VarChar(20), role ?? null);

    const result = await request.query<AccountDatabaseRecord>(`
      SELECT TOP (1)
        ${ACCOUNT_SELECT_COLUMNS}
      FROM ${getAccountsTableSource(transaction)}
      WHERE
        email_normalized = @emailNormalized
        AND (
          @role IS NULL
          OR role = @role
        );
    `);

    const record = result.recordset[0];

    return record ? mapAccountRecord(record) : null;
  } catch (error) {
    throw toDatabaseError(error, "QUERY_FAILED");
  }
}

export async function findAccountByUsername(
  usernameNormalized: string,
  transaction?: Transaction,
): Promise<AccountRepositoryRecord | null> {
  const normalizedUsername = normalizeRequiredText(
    usernameNormalized,
    "usernameNormalized",
    40,
  ).toLowerCase();

  try {
    const request = await createRepositoryRequest(transaction);

    request.input(
      "usernameNormalized",
      NVarChar(40),
      normalizedUsername,
    );

    const result = await request.query<AccountDatabaseRecord>(`
      SELECT TOP (1)
        ${ACCOUNT_SELECT_COLUMNS}
      FROM ${getAccountsTableSource(transaction)}
      WHERE username_normalized = @usernameNormalized;
    `);

    const record = result.recordset[0];

    return record ? mapAccountRecord(record) : null;
  } catch (error) {
    throw toDatabaseError(error, "QUERY_FAILED");
  }
}

export async function findPotentialUsernameConflicts(
  usernameNormalized: string,
  usernameSkeleton: string,
  maximumResults = 100,
  transaction?: Transaction,
): Promise<readonly UsernameConflictRecord[]> {
  const normalizedUsername = normalizeRequiredText(
    usernameNormalized,
    "usernameNormalized",
    40,
  ).toLowerCase();

  const normalizedSkeleton = normalizeRequiredText(
    usernameSkeleton,
    "usernameSkeleton",
    40,
  ).toLowerCase();

  if (
    !Number.isSafeInteger(maximumResults)
    || maximumResults < 1
    || maximumResults > 500
  ) {
    throw new Error("maximumResults debe estar entre 1 y 500.");
  }

  const skeletonPrefix = normalizedSkeleton.slice(
    0,
    Math.min(3, normalizedSkeleton.length),
  );

  try {
    const request = await createRepositoryRequest(transaction);

    request.input("maximumResults", Int, maximumResults);
    request.input(
      "usernameNormalized",
      NVarChar(40),
      normalizedUsername,
    );
    request.input(
      "usernameSkeleton",
      NVarChar(40),
      normalizedSkeleton,
    );
    request.input("skeletonPrefix", NVarChar(3), skeletonPrefix);

    const result = await request.query<UsernameConflictDatabaseRecord>(`
      SELECT TOP (@maximumResults)
        account_id,
        username,
        username_normalized,
        username_skeleton
      FROM ${getAccountsTableSource(transaction)}
      WHERE
        username_normalized = @usernameNormalized
        OR username_skeleton = @usernameSkeleton
        OR (
          @skeletonPrefix <> N''
          AND LEFT(
            username_skeleton,
            LEN(@skeletonPrefix)
          ) = @skeletonPrefix
        )
      ORDER BY created_at ASC;
    `);

    return result.recordset.map((record) => ({
      accountId: validateUuid(record.account_id, "account_id"),
      username: validateDatabaseText(record.username, "username", 40),
      usernameNormalized: validateDatabaseText(
        record.username_normalized,
        "username_normalized",
        40,
      ).toLowerCase(),
      usernameSkeleton: validateDatabaseText(
        record.username_skeleton,
        "username_skeleton",
        40,
      ).toLowerCase(),
    }));
  } catch (error) {
    throw toDatabaseError(error, "QUERY_FAILED");
  }
}

export async function createPendingUserAccount(
  input: CreateUserAccountInput,
  transaction?: Transaction,
): Promise<AccountRepositoryRecord> {
  const accountId = validateUuid(input.accountId, "accountId");
  const firstNames = normalizeRequiredText(
    input.firstNames,
    "firstNames",
    100,
  );
  const lastNames = normalizeRequiredText(
    input.lastNames,
    "lastNames",
    150,
  );
  const username = normalizeRequiredText(input.username, "username", 40);
  const usernameNormalized = normalizeRequiredText(
    input.usernameNormalized,
    "usernameNormalized",
    40,
  ).toLowerCase();
  const usernameSkeleton = normalizeRequiredText(
    input.usernameSkeleton,
    "usernameSkeleton",
    40,
  ).toLowerCase();
  const email = normalizeEmailValue(input.email);
  const emailNormalized = normalizeEmailValue(input.emailNormalized);
  const passwordHash = validatePasswordHash(input.passwordHash);
  const createdAt = validateDate(input.createdAt ?? new Date(), "createdAt");

  if (email !== emailNormalized) {
    throw new Error("email y emailNormalized no coinciden.");
  }

  try {
    const request = await createRepositoryRequest(transaction);

    request.input("accountId", UniqueIdentifier, accountId);
    request.input("firstNames", NVarChar(100), firstNames);
    request.input("lastNames", NVarChar(150), lastNames);
    request.input("username", NVarChar(40), username);
    request.input(
      "usernameNormalized",
      NVarChar(40),
      usernameNormalized,
    );
    request.input(
      "usernameSkeleton",
      NVarChar(40),
      usernameSkeleton,
    );
    request.input("email", NVarChar(320), email);
    request.input("emailNormalized", NVarChar(320), emailNormalized);
    request.input("passwordHash", VarChar(512), passwordHash);
    request.input("createdAt", DateTime2, createdAt);

    const result = await request.query<AccountDatabaseRecord>(`
      INSERT INTO dbo.accounts (
        account_id,
        role,
        status,
        first_names,
        last_names,
        username,
        username_normalized,
        username_skeleton,
        email,
        email_normalized,
        password_hash,
        email_verified_at,
        access_started_at,
        access_expires_at,
        failed_sign_in_attempts,
        locked_until,
        created_at,
        updated_at,
        last_sign_in_at
      )
      OUTPUT
        inserted.account_id,
        inserted.role,
        inserted.status,
        inserted.first_names,
        inserted.last_names,
        inserted.username,
        inserted.username_normalized,
        inserted.username_skeleton,
        inserted.email,
        inserted.email_normalized,
        inserted.password_hash,
        inserted.email_verified_at,
        inserted.access_started_at,
        inserted.access_expires_at,
        inserted.failed_sign_in_attempts,
        inserted.locked_until,
        inserted.created_at,
        inserted.updated_at,
        inserted.last_sign_in_at
      VALUES (
        @accountId,
        'USER',
        'PENDING_VERIFICATION',
        @firstNames,
        @lastNames,
        @username,
        @usernameNormalized,
        @usernameSkeleton,
        @email,
        @emailNormalized,
        @passwordHash,
        NULL,
        NULL,
        NULL,
        0,
        NULL,
        @createdAt,
        @createdAt,
        NULL
      );
    `);

    const record = result.recordset[0];

    if (!record) {
      throw new Error("SQL Server no devolvió la cuenta creada.");
    }

    return mapAccountRecord(record);
  } catch (error) {
    throw toDatabaseError(error, "QUERY_FAILED");
  }
}

export async function markAccountEmailAsVerified(
  accountId: string,
  verifiedAt = new Date(),
  transaction?: Transaction,
): Promise<AccountRepositoryRecord | null> {
  const normalizedAccountId = validateUuid(accountId, "accountId");
  const normalizedVerifiedAt = validateDate(verifiedAt, "verifiedAt");

  try {
    const request = await createRepositoryRequest(transaction);

    request.input("accountId", UniqueIdentifier, normalizedAccountId);
    request.input("verifiedAt", DateTime2, normalizedVerifiedAt);

    const result = await request.query<AccountDatabaseRecord>(`
      UPDATE dbo.accounts WITH (UPDLOCK, ROWLOCK)
      SET
        status = 'ACTIVE',
        email_verified_at = COALESCE(email_verified_at, @verifiedAt),
        failed_sign_in_attempts = 0,
        locked_until = NULL,
        updated_at = @verifiedAt
      OUTPUT
        inserted.account_id,
        inserted.role,
        inserted.status,
        inserted.first_names,
        inserted.last_names,
        inserted.username,
        inserted.username_normalized,
        inserted.username_skeleton,
        inserted.email,
        inserted.email_normalized,
        inserted.password_hash,
        inserted.email_verified_at,
        inserted.access_started_at,
        inserted.access_expires_at,
        inserted.failed_sign_in_attempts,
        inserted.locked_until,
        inserted.created_at,
        inserted.updated_at,
        inserted.last_sign_in_at
      WHERE
        account_id = @accountId
        AND role = 'USER'
        AND status = 'PENDING_VERIFICATION'
        AND email_verified_at IS NULL;
    `);

    const record = result.recordset[0];

    return record ? mapAccountRecord(record) : null;
  } catch (error) {
    throw toDatabaseError(error, "QUERY_FAILED");
  }
}

export async function updateAccountPassword(
  accountId: string,
  passwordHash: string,
  updatedAt = new Date(),
  transaction?: Transaction,
): Promise<boolean> {
  const normalizedAccountId = validateUuid(accountId, "accountId");
  const normalizedPasswordHash = validatePasswordHash(passwordHash);
  const normalizedUpdatedAt = validateDate(updatedAt, "updatedAt");

  try {
    const request = await createRepositoryRequest(transaction);

    request.input("accountId", UniqueIdentifier, normalizedAccountId);
    request.input("passwordHash", VarChar(512), normalizedPasswordHash);
    request.input("updatedAt", DateTime2, normalizedUpdatedAt);

    const result = await request.query(`
      UPDATE dbo.accounts WITH (UPDLOCK, ROWLOCK)
      SET
        password_hash = @passwordHash,
        failed_sign_in_attempts = 0,
        locked_until = NULL,
        updated_at = @updatedAt
      WHERE account_id = @accountId;
    `);

    return (result.rowsAffected[0] ?? 0) > 0;
  } catch (error) {
    throw toDatabaseError(error, "QUERY_FAILED");
  }
}

export async function updateFailedSignInState(
  input: UpdateFailedSignInInput,
  transaction?: Transaction,
): Promise<boolean> {
  const accountId = validateUuid(input.accountId, "accountId");
  const failedAttempts = validateFailedAttempts(input.failedAttempts);
  const lockedUntil = input.lockedUntil
    ? validateDate(input.lockedUntil, "lockedUntil")
    : null;
  const updatedAt = validateDate(input.updatedAt ?? new Date(), "updatedAt");

  try {
    const request = await createRepositoryRequest(transaction);

    request.input("accountId", UniqueIdentifier, accountId);
    request.input("failedAttempts", Int, failedAttempts);
    request.input("lockedUntil", DateTime2, lockedUntil);
    request.input("updatedAt", DateTime2, updatedAt);

    const result = await request.query(`
      UPDATE dbo.accounts WITH (UPDLOCK, ROWLOCK)
      SET
        failed_sign_in_attempts =
          CASE
            WHEN failed_sign_in_attempts > @failedAttempts
              THEN failed_sign_in_attempts
            ELSE @failedAttempts
          END,
        locked_until =
          CASE
            WHEN locked_until IS NOT NULL
              AND locked_until > @updatedAt
              AND (
                @lockedUntil IS NULL
                OR locked_until > @lockedUntil
              )
              THEN locked_until
            ELSE @lockedUntil
          END,
        updated_at =
          CASE
            WHEN updated_at > @updatedAt
              THEN updated_at
            ELSE @updatedAt
          END
      WHERE
        account_id = @accountId
        AND status = 'ACTIVE'
        AND email_verified_at IS NOT NULL;
    `);

    return (result.rowsAffected[0] ?? 0) > 0;
  } catch (error) {
    throw toDatabaseError(error, "QUERY_FAILED");
  }
}

export async function recordSuccessfulSignIn(
  accountId: string,
  signedInAt = new Date(),
  transaction?: Transaction,
): Promise<boolean> {
  const normalizedAccountId = validateUuid(accountId, "accountId");
  const normalizedSignedInAt = validateDate(signedInAt, "signedInAt");

  try {
    const request = await createRepositoryRequest(transaction);

    request.input("accountId", UniqueIdentifier, normalizedAccountId);
    request.input("signedInAt", DateTime2, normalizedSignedInAt);

    const result = await request.query(`
      UPDATE dbo.accounts WITH (UPDLOCK, ROWLOCK)
      SET
        failed_sign_in_attempts = 0,
        locked_until = NULL,
        last_sign_in_at = @signedInAt,
        updated_at = @signedInAt
      WHERE
        account_id = @accountId
        AND status = 'ACTIVE'
        AND email_verified_at IS NOT NULL;
    `);

    return (result.rowsAffected[0] ?? 0) > 0;
  } catch (error) {
    throw toDatabaseError(error, "QUERY_FAILED");
  }
}