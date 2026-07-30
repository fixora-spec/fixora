import "server-only";

import type {
  AccountRole,
} from "@/types/account";

const MINIMUM_ADMIN_ACCESS_YEARS =
  1;

const MAXIMUM_ADMIN_ACCESS_YEARS =
  10;

export type AccountAccessState =
  | "ACTIVE"
  | "NOT_STARTED"
  | "EXPIRED"
  | "INVALID";

export type AccountAccessRecord = {
  role:
    AccountRole;

  accessStartedAt:
    Date | null;

  accessExpiresAt:
    Date | null;
};

export type AdministratorAccessWindow = {
  accessStartedAt:
    Date;

  accessExpiresAt:
    Date;
};

function normalizeDate(
  value:
    Date,

  fieldName:
    string,
): Date {
  const normalizedDate =
    new Date(
      value,
    );

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

function validateAccessYears(
  years:
    number,
): number {
  if (
    !Number.isSafeInteger(
      years,
    )

    || years
      < MINIMUM_ADMIN_ACCESS_YEARS

    || years
      > MAXIMUM_ADMIN_ACCESS_YEARS
  ) {
    throw new Error(
      `La vigencia administrativa debe estar entre ${MINIMUM_ADMIN_ACCESS_YEARS} y ${MAXIMUM_ADMIN_ACCESS_YEARS} años.`,
    );
  }

  return years;
}

function addUtcYears(
  date:
    Date,

  years:
    number,
): Date {
  const sourceDate =
    normalizeDate(
      date,
      "date",
    );

  const targetYear =
    sourceDate.getUTCFullYear()
    + years;

  const sourceMonth =
    sourceDate.getUTCMonth();

  const sourceDay =
    sourceDate.getUTCDate();

  const result =
    new Date(
      sourceDate,
    );

  result.setUTCDate(
    1,
  );

  result.setUTCFullYear(
    targetYear,
  );

  result.setUTCMonth(
    sourceMonth,
  );

  const finalDayOfMonth =
    new Date(
      Date.UTC(
        targetYear,
        sourceMonth + 1,
        0,
      ),
    ).getUTCDate();

  result.setUTCDate(
    Math.min(
      sourceDay,
      finalDayOfMonth,
    ),
  );

  return result;
}

export function createAdministratorAccessWindow(
  years = 5,
  currentDate = new Date(),
): AdministratorAccessWindow {
  const validatedYears =
    validateAccessYears(
      years,
    );

  const accessStartedAt =
    normalizeDate(
      currentDate,
      "currentDate",
    );

  const accessExpiresAt =
    addUtcYears(
      accessStartedAt,
      validatedYears,
    );

  return {
    accessStartedAt,
    accessExpiresAt,
  };
}

export function resolveAccountAccessState(
  account:
    AccountAccessRecord,

  currentDate = new Date(),
): AccountAccessState {
  if (
    account.role === "USER"
  ) {
    return (
      account.accessStartedAt
        === null

      && account.accessExpiresAt
        === null
    )
      ? "ACTIVE"
      : "INVALID";
  }

  if (
    account.accessStartedAt
      === null

    || account.accessExpiresAt
      === null
  ) {
    return "INVALID";
  }

  const normalizedCurrentDate =
    normalizeDate(
      currentDate,
      "currentDate",
    );

  const accessStartedAt =
    normalizeDate(
      account.accessStartedAt,
      "accessStartedAt",
    );

  const accessExpiresAt =
    normalizeDate(
      account.accessExpiresAt,
      "accessExpiresAt",
    );

  if (
    accessExpiresAt.getTime()
      <= accessStartedAt.getTime()
  ) {
    return "INVALID";
  }

  if (
    normalizedCurrentDate.getTime()
      < accessStartedAt.getTime()
  ) {
    return "NOT_STARTED";
  }

  if (
    normalizedCurrentDate.getTime()
      >= accessExpiresAt.getTime()
  ) {
    return "EXPIRED";
  }

  return "ACTIVE";
}

export function hasActiveAccountAccess(
  account:
    AccountAccessRecord,

  currentDate = new Date(),
): boolean {
  return (
    resolveAccountAccessState(
      account,
      currentDate,
    )
    === "ACTIVE"
  );
}

export function getRemainingAccountAccessSeconds(
  account:
    AccountAccessRecord,

  currentDate = new Date(),
): number {
  if (
    resolveAccountAccessState(
      account,
      currentDate,
    )
    !== "ACTIVE"

    || account.role
      !== "ADMIN"

    || account.accessExpiresAt
      === null
  ) {
    return 0;
  }

  const normalizedCurrentDate =
    normalizeDate(
      currentDate,
      "currentDate",
    );

  const accessExpiresAt =
    normalizeDate(
      account.accessExpiresAt,
      "accessExpiresAt",
    );

  return Math.max(
    0,

    Math.ceil(
      (
        accessExpiresAt.getTime()
        - normalizedCurrentDate.getTime()
      ) / 1_000,
    ),
  );
}