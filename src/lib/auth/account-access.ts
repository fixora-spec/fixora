import "server-only";

import {
  isAccountRole,
} from "@/types/account";

import type {
  AccountRole,
} from "@/types/account";

const MINIMUM_ADMIN_ACCESS_YEARS = 1;
const MAXIMUM_ADMIN_ACCESS_YEARS = 10;
const MINIMUM_SUPPORTED_YEAR = 1;
const MAXIMUM_SUPPORTED_YEAR = 9_999;

export type AccountAccessState =
  | "ACTIVE"
  | "NOT_STARTED"
  | "EXPIRED"
  | "INVALID";

export type AccountAccessRecord = {
  role: AccountRole;
  accessStartedAt: Date | null;
  accessExpiresAt: Date | null;
};

export type AdministratorAccessWindow = {
  accessStartedAt: Date;
  accessExpiresAt: Date;
};

function tryNormalizeDate(value: Date | null): Date | null {
  if (value === null) {
    return null;
  }

  const normalizedDate = new Date(value);
  const year = normalizedDate.getUTCFullYear();

  if (
    Number.isNaN(normalizedDate.getTime())
    || year < MINIMUM_SUPPORTED_YEAR
    || year > MAXIMUM_SUPPORTED_YEAR
  ) {
    return null;
  }

  return normalizedDate;
}

function normalizeDate(value: Date, fieldName: string): Date {
  const normalizedDate = tryNormalizeDate(value);

  if (!normalizedDate) {
    throw new Error(`${fieldName} no contiene una fecha válida.`);
  }

  return normalizedDate;
}

function validateAccessYears(years: number): number {
  if (
    !Number.isSafeInteger(years)
    || years < MINIMUM_ADMIN_ACCESS_YEARS
    || years > MAXIMUM_ADMIN_ACCESS_YEARS
  ) {
    throw new Error(
      `La vigencia administrativa debe estar entre ${MINIMUM_ADMIN_ACCESS_YEARS} y ${MAXIMUM_ADMIN_ACCESS_YEARS} años.`,
    );
  }

  return years;
}

function addUtcYears(date: Date, years: number): Date {
  const sourceDate = normalizeDate(date, "date");
  const targetYear = sourceDate.getUTCFullYear() + years;

  if (targetYear > MAXIMUM_SUPPORTED_YEAR) {
    throw new Error(
      "La fecha final de la vigencia administrativa queda fuera del intervalo permitido.",
    );
  }

  const sourceMonth = sourceDate.getUTCMonth();
  const sourceDay = sourceDate.getUTCDate();
  const result = new Date(sourceDate);

  result.setUTCDate(1);
  result.setUTCFullYear(targetYear);
  result.setUTCMonth(sourceMonth);

  const finalDayOfMonth = new Date(
    Date.UTC(targetYear, sourceMonth + 1, 0),
  ).getUTCDate();

  result.setUTCDate(Math.min(sourceDay, finalDayOfMonth));

  return normalizeDate(result, "accessExpiresAt");
}

export function createAdministratorAccessWindow(
  years = 5,
  currentDate = new Date(),
): AdministratorAccessWindow {
  const validatedYears = validateAccessYears(years);
  const accessStartedAt = normalizeDate(currentDate, "currentDate");
  const accessExpiresAt = addUtcYears(accessStartedAt, validatedYears);

  return {
    accessStartedAt: new Date(accessStartedAt),
    accessExpiresAt: new Date(accessExpiresAt),
  };
}

export function resolveAccountAccessState(
  account: AccountAccessRecord,
  currentDate = new Date(),
): AccountAccessState {
  if (!account || typeof account !== "object" || !isAccountRole(account.role)) {
    return "INVALID";
  }

  if (account.role === "USER") {
    return (
      account.accessStartedAt === null
      && account.accessExpiresAt === null
    )
      ? "ACTIVE"
      : "INVALID";
  }

  if (
    account.accessStartedAt === null
    || account.accessExpiresAt === null
  ) {
    return "INVALID";
  }

  const normalizedCurrentDate = tryNormalizeDate(currentDate);
  const accessStartedAt = tryNormalizeDate(account.accessStartedAt);
  const accessExpiresAt = tryNormalizeDate(account.accessExpiresAt);

  if (
    !normalizedCurrentDate
    || !accessStartedAt
    || !accessExpiresAt
    || accessExpiresAt.getTime() <= accessStartedAt.getTime()
  ) {
    return "INVALID";
  }

  if (normalizedCurrentDate.getTime() < accessStartedAt.getTime()) {
    return "NOT_STARTED";
  }

  if (normalizedCurrentDate.getTime() >= accessExpiresAt.getTime()) {
    return "EXPIRED";
  }

  return "ACTIVE";
}

export function hasActiveAccountAccess(
  account: AccountAccessRecord,
  currentDate = new Date(),
): boolean {
  return resolveAccountAccessState(account, currentDate) === "ACTIVE";
}

export function getRemainingAccountAccessSeconds(
  account: AccountAccessRecord,
  currentDate = new Date(),
): number {
  if (
    resolveAccountAccessState(account, currentDate) !== "ACTIVE"
    || account.role !== "ADMIN"
    || account.accessExpiresAt === null
  ) {
    return 0;
  }

  const normalizedCurrentDate = tryNormalizeDate(currentDate);
  const accessExpiresAt = tryNormalizeDate(account.accessExpiresAt);

  if (!normalizedCurrentDate || !accessExpiresAt) {
    return 0;
  }

  return Math.max(
    0,
    Math.ceil(
      (accessExpiresAt.getTime() - normalizedCurrentDate.getTime()) / 1_000,
    ),
  );
}