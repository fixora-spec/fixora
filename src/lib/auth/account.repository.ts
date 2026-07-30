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

function validateUuid(
  value: string,
  fieldName: string,
): string {
  const normalizedValue =
    value.trim();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
      .test(normalizedValue)
  ) {
    throw new Error(
      `${fieldName} no contiene un UUID válido.`,
    );
  }

  return normalizedValue;
}

function validateDate(
  value: Date,
  fieldName: string,
): Date {
  const normalizedDate =
    new Date(value);

  if (
    Number.isNaN(
      normalizedDate.getTime(),
    )
  ) {
    throw new Error(
      `${fieldName} no contiene una fecha válida.`,
    );
  }

  return normalizedDate;
}

function normalizeRequiredText(
  value: string,
  fieldName: string,
  maximumLength: number,
): string {
  const normalizedValue =
    value
      .trim()
      .normalize("NFC");

  if (
    normalizedValue.length === 0
    || normalizedValue.length
      > maximumLength
  ) {
    throw new Error(
      `${fieldName} no contiene un valor válido.`,
    );
  }

  return normalizedValue;
}

function normalizeEmailValue(
  value: string,
): string {
  const normalizedEmail =
    value
      .trim()
      .normalize("NFC")
      .toLowerCase();

  if (
    normalizedEmail.length < 5
    || normalizedEmail.length > 320
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u
      .test(normalizedEmail)
  ) {
    throw new Error(
      "El correo electrónico no es válido.",
    );
  }

  return normalizedEmail;
}

function validateFailedAttempts(
  value: number,
): number {
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

async function createRepositoryRequest(
  transaction?: Transaction,
): Promise<Request> {
  if (transaction) {
    return new Request(
      transaction,
    );
  }

  return createSqlRequest();
}

function mapAccountRecord(
  record: AccountDatabaseRecord,
): AccountRepositoryRecord {
  return {
    accountId:
      record.account_id,

    role:
      record.role as AccountRole,

    status:
      record.status as AccountStatus,

    firstNames:
      record.first_names,

    lastNames:
      record.last_names,

    username:
      record.username,

    usernameNormalized:
      record.username_normalized,

    usernameSkeleton:
      record.username_skeleton,

    email:
      record.email,

    emailNormalized:
      record.email_normalized,

    passwordHash:
      record.password_hash,

    emailVerifiedAt:
      record.email_verified_at
        ? new Date(
            record.email_verified_at,
          )
        : null,

    accessStartedAt:
      record.access_started_at
        ? new Date(
            record.access_started_at,
          )
        : null,

    accessExpiresAt:
      record.access_expires_at
        ? new Date(
            record.access_expires_at,
          )
        : null,

    failedSignInAttempts:
      record.failed_sign_in_attempts,

    lockedUntil:
      record.locked_until
        ? new Date(
            record.locked_until,
          )
        : null,

    createdAt:
      new Date(
        record.created_at,
      ),

    updatedAt:
      new Date(
        record.updated_at,
      ),

    lastSignInAt:
      record.last_sign_in_at
        ? new Date(
            record.last_sign_in_at,
          )
        : null,
  };
}

export function toAccountPublicRecord(
  account: AccountRepositoryRecord,
): AccountPublicRecord {
  return {
    accountId:
      account.accountId,

    role:
      account.role,

    status:
      account.status,

    firstNames:
      account.firstNames,

    lastNames:
      account.lastNames,

    username:
      account.username,

    email:
      account.email,

    emailVerifiedAt:
      account.emailVerifiedAt,

    accessStartedAt:
      account.accessStartedAt,

    accessExpiresAt:
      account.accessExpiresAt,

    createdAt:
      account.createdAt,

    lastSignInAt:
      account.lastSignInAt,
  };
}

export async function findAccountById(
  accountId: string,
  transaction?: Transaction,
): Promise<AccountRepositoryRecord | null> {
  const normalizedAccountId =
    validateUuid(
      accountId,
      "accountId",
    );

  try {
    const request =
      await createRepositoryRequest(
        transaction,
      );

    request.input(
      "accountId",
      UniqueIdentifier,
      normalizedAccountId,
    );

    const result =
      await request.query<
        AccountDatabaseRecord
      >(`
        SELECT TOP (1)
          ${ACCOUNT_SELECT_COLUMNS}
        FROM dbo.accounts
        WHERE account_id = @accountId;
      `);

    const record =
      result.recordset[0];

    return record
      ? mapAccountRecord(record)
      : null;
  } catch (error) {
    throw toDatabaseError(
      error,
      "QUERY_FAILED",
    );
  }
}

export async function findAccountByEmail(
  email: string,
  role?: AccountRole,
  transaction?: Transaction,
): Promise<AccountRepositoryRecord | null> {
  const emailNormalized =
    normalizeEmailValue(email);

  try {
    const request =
      await createRepositoryRequest(
        transaction,
      );

    request.input(
      "emailNormalized",
      NVarChar(320),
      emailNormalized,
    );

    request.input(
      "role",
      VarChar(20),
      role ?? null,
    );

    const result =
      await request.query<
        AccountDatabaseRecord
      >(`
        SELECT TOP (1)
          ${ACCOUNT_SELECT_COLUMNS}
        FROM dbo.accounts
        WHERE
          email_normalized = @emailNormalized
          AND (
            @role IS NULL
            OR role = @role
          );
      `);

    const record =
      result.recordset[0];

    return record
      ? mapAccountRecord(record)
      : null;
  } catch (error) {
    throw toDatabaseError(
      error,
      "QUERY_FAILED",
    );
  }
}

export async function findAccountByUsername(
  usernameNormalized: string,
  transaction?: Transaction,
): Promise<AccountRepositoryRecord | null> {
  const normalizedUsername =
    normalizeRequiredText(
      usernameNormalized,
      "usernameNormalized",
      40,
    ).toLowerCase();

  try {
    const request =
      await createRepositoryRequest(
        transaction,
      );

    request.input(
      "usernameNormalized",
      NVarChar(40),
      normalizedUsername,
    );

    const result =
      await request.query<
        AccountDatabaseRecord
      >(`
        SELECT TOP (1)
          ${ACCOUNT_SELECT_COLUMNS}
        FROM dbo.accounts
        WHERE
          username_normalized
          = @usernameNormalized;
      `);

    const record =
      result.recordset[0];

    return record
      ? mapAccountRecord(record)
      : null;
  } catch (error) {
    throw toDatabaseError(
      error,
      "QUERY_FAILED",
    );
  }
}

export async function findPotentialUsernameConflicts(
  usernameNormalized: string,
  usernameSkeleton: string,
  maximumResults = 100,
  transaction?: Transaction,
): Promise<
  readonly UsernameConflictRecord[]
> {
  const normalizedUsername =
    normalizeRequiredText(
      usernameNormalized,
      "usernameNormalized",
      40,
    ).toLowerCase();

  const normalizedSkeleton =
    normalizeRequiredText(
      usernameSkeleton,
      "usernameSkeleton",
      40,
    ).toLowerCase();

  if (
    !Number.isSafeInteger(
      maximumResults,
    )
    || maximumResults < 1
    || maximumResults > 500
  ) {
    throw new Error(
      "maximumResults debe estar entre 1 y 500.",
    );
  }

  const skeletonPrefix =
    normalizedSkeleton.slice(
      0,
      Math.min(
        3,
        normalizedSkeleton.length,
      ),
    );

  try {
    const request =
      await createRepositoryRequest(
        transaction,
      );

    request.input(
      "maximumResults",
      Int,
      maximumResults,
    );

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

    request.input(
      "skeletonPrefix",
      NVarChar(3),
      skeletonPrefix,
    );

    const result =
      await request.query<
        UsernameConflictDatabaseRecord
      >(`
        SELECT TOP (@maximumResults)
          account_id,
          username,
          username_normalized,
          username_skeleton
        FROM dbo.accounts
        WHERE
          username_normalized
            = @usernameNormalized

          OR username_skeleton
            = @usernameSkeleton

          OR (
            @skeletonPrefix <> N''
            AND LEFT(
              username_skeleton,
              LEN(@skeletonPrefix)
            ) = @skeletonPrefix
          )
        ORDER BY created_at ASC;
      `);

    return result.recordset.map(
      (record) => ({
        accountId:
          record.account_id,

        username:
          record.username,

        usernameNormalized:
          record.username_normalized,

        usernameSkeleton:
          record.username_skeleton,
      }),
    );
  } catch (error) {
    throw toDatabaseError(
      error,
      "QUERY_FAILED",
    );
  }
}

export async function createPendingUserAccount(
  input: CreateUserAccountInput,
  transaction?: Transaction,
): Promise<AccountRepositoryRecord> {
  const accountId =
    validateUuid(
      input.accountId,
      "accountId",
    );

  const firstNames =
    normalizeRequiredText(
      input.firstNames,
      "firstNames",
      100,
    );

  const lastNames =
    normalizeRequiredText(
      input.lastNames,
      "lastNames",
      150,
    );

  const username =
    normalizeRequiredText(
      input.username,
      "username",
      40,
    );

  const usernameNormalized =
    normalizeRequiredText(
      input.usernameNormalized,
      "usernameNormalized",
      40,
    ).toLowerCase();

  const usernameSkeleton =
    normalizeRequiredText(
      input.usernameSkeleton,
      "usernameSkeleton",
      40,
    ).toLowerCase();

  const email =
    normalizeEmailValue(
      input.email,
    );

  const emailNormalized =
    normalizeEmailValue(
      input.emailNormalized,
    );

  const passwordHash =
    normalizeRequiredText(
      input.passwordHash,
      "passwordHash",
      512,
    );

  const createdAt =
    validateDate(
      input.createdAt
        ?? new Date(),
      "createdAt",
    );

  try {
    const request =
      await createRepositoryRequest(
        transaction,
      );

    request.input(
      "accountId",
      UniqueIdentifier,
      accountId,
    );

    request.input(
      "firstNames",
      NVarChar(100),
      firstNames,
    );

    request.input(
      "lastNames",
      NVarChar(150),
      lastNames,
    );

    request.input(
      "username",
      NVarChar(40),
      username,
    );

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

    request.input(
      "email",
      NVarChar(320),
      email,
    );

    request.input(
      "emailNormalized",
      NVarChar(320),
      emailNormalized,
    );

    request.input(
      "passwordHash",
      VarChar(512),
      passwordHash,
    );

    request.input(
      "createdAt",
      DateTime2,
      createdAt,
    );

    const result =
      await request.query<
        AccountDatabaseRecord
      >(`
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

    const record =
      result.recordset[0];

    if (!record) {
      throw new Error(
        "SQL Server no devolvió la cuenta creada.",
      );
    }

    return mapAccountRecord(
      record,
    );
  } catch (error) {
    throw toDatabaseError(
      error,
      "QUERY_FAILED",
    );
  }
}

export async function markAccountEmailAsVerified(
  accountId: string,
  verifiedAt = new Date(),
  transaction?: Transaction,
): Promise<AccountRepositoryRecord | null> {
  const normalizedAccountId =
    validateUuid(
      accountId,
      "accountId",
    );

  const normalizedVerifiedAt =
    validateDate(
      verifiedAt,
      "verifiedAt",
    );

  try {
    const request =
      await createRepositoryRequest(
        transaction,
      );

    request.input(
      "accountId",
      UniqueIdentifier,
      normalizedAccountId,
    );

    request.input(
      "verifiedAt",
      DateTime2,
      normalizedVerifiedAt,
    );

    const result =
      await request.query<
        AccountDatabaseRecord
      >(`
        UPDATE dbo.accounts
        SET
          status = 'ACTIVE',
          email_verified_at =
            COALESCE(
              email_verified_at,
              @verifiedAt
            ),
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
          AND status = 'PENDING_VERIFICATION';
      `);

    const record =
      result.recordset[0];

    return record
      ? mapAccountRecord(record)
      : null;
  } catch (error) {
    throw toDatabaseError(
      error,
      "QUERY_FAILED",
    );
  }
}

export async function updateAccountPassword(
  accountId: string,
  passwordHash: string,
  updatedAt = new Date(),
  transaction?: Transaction,
): Promise<boolean> {
  const normalizedAccountId =
    validateUuid(
      accountId,
      "accountId",
    );

  const normalizedPasswordHash =
    normalizeRequiredText(
      passwordHash,
      "passwordHash",
      512,
    );

  const normalizedUpdatedAt =
    validateDate(
      updatedAt,
      "updatedAt",
    );

  try {
    const request =
      await createRepositoryRequest(
        transaction,
      );

    request.input(
      "accountId",
      UniqueIdentifier,
      normalizedAccountId,
    );

    request.input(
      "passwordHash",
      VarChar(512),
      normalizedPasswordHash,
    );

    request.input(
      "updatedAt",
      DateTime2,
      normalizedUpdatedAt,
    );

    const result =
      await request.query(`
        UPDATE dbo.accounts
        SET
          password_hash = @passwordHash,
          failed_sign_in_attempts = 0,
          locked_until = NULL,
          updated_at = @updatedAt
        WHERE account_id = @accountId;
      `);

    return (
      result.rowsAffected[0]
      ?? 0
    ) > 0;
  } catch (error) {
    throw toDatabaseError(
      error,
      "QUERY_FAILED",
    );
  }
}

export async function updateFailedSignInState(
  input: UpdateFailedSignInInput,
  transaction?: Transaction,
): Promise<boolean> {
  const accountId =
    validateUuid(
      input.accountId,
      "accountId",
    );

  const failedAttempts =
    validateFailedAttempts(
      input.failedAttempts,
    );

  const lockedUntil =
    input.lockedUntil
      ? validateDate(
          input.lockedUntil,
          "lockedUntil",
        )
      : null;

  const updatedAt =
    validateDate(
      input.updatedAt
        ?? new Date(),
      "updatedAt",
    );

  try {
    const request =
      await createRepositoryRequest(
        transaction,
      );

    request.input(
      "accountId",
      UniqueIdentifier,
      accountId,
    );

    request.input(
      "failedAttempts",
      Int,
      failedAttempts,
    );

    request.input(
      "lockedUntil",
      DateTime2,
      lockedUntil,
    );

    request.input(
      "updatedAt",
      DateTime2,
      updatedAt,
    );

    const result =
      await request.query(`
        UPDATE dbo.accounts
        SET
          failed_sign_in_attempts =
            @failedAttempts,
          locked_until =
            @lockedUntil,
          updated_at =
            @updatedAt
        WHERE account_id = @accountId;
      `);

    return (
      result.rowsAffected[0]
      ?? 0
    ) > 0;
  } catch (error) {
    throw toDatabaseError(
      error,
      "QUERY_FAILED",
    );
  }
}

export async function recordSuccessfulSignIn(
  accountId: string,
  signedInAt = new Date(),
  transaction?: Transaction,
): Promise<boolean> {
  const normalizedAccountId =
    validateUuid(
      accountId,
      "accountId",
    );

  const normalizedSignedInAt =
    validateDate(
      signedInAt,
      "signedInAt",
    );

  try {
    const request =
      await createRepositoryRequest(
        transaction,
      );

    request.input(
      "accountId",
      UniqueIdentifier,
      normalizedAccountId,
    );

    request.input(
      "signedInAt",
      DateTime2,
      normalizedSignedInAt,
    );

    const result =
      await request.query(`
        UPDATE dbo.accounts
        SET
          failed_sign_in_attempts = 0,
          locked_until = NULL,
          last_sign_in_at = @signedInAt,
          updated_at = @signedInAt
        WHERE account_id = @accountId;
      `);

    return (
      result.rowsAffected[0]
      ?? 0
    ) > 0;
  } catch (error) {
    throw toDatabaseError(
      error,
      "QUERY_FAILED",
    );
  }
}