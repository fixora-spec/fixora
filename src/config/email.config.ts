import "server-only";

export const EMAIL_MODES = [
  "console",
  "smtp",
] as const;

export type EmailMode = (typeof EMAIL_MODES)[number];

export type ConsoleEmailConfiguration = {
  mode: "console";
  from: string;
};

export type SmtpEmailConfiguration = {
  mode: "smtp";
  from: string;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    requireTls: boolean;
    user: string;
    password: string;
    connectionTimeoutMs: number;
    greetingTimeoutMs: number;
    socketTimeoutMs: number;
  };
};

export type EmailConfiguration =
  | ConsoleEmailConfiguration
  | SmtpEmailConfiguration;

const DEFAULT_SMTP_PORT = 587;
const DEFAULT_SMTP_CONNECTION_TIMEOUT_MS = 15_000;
const DEFAULT_SMTP_GREETING_TIMEOUT_MS = 10_000;
const DEFAULT_SMTP_SOCKET_TIMEOUT_MS = 30_000;
const MINIMUM_SMTP_TIMEOUT_MS = 1_000;
const MAXIMUM_SMTP_TIMEOUT_MS = 120_000;
const MAXIMUM_STANDARD_VALUE_LENGTH = 500;
const MAXIMUM_SECRET_LENGTH = 1_024;

let cachedEmailConfiguration: EmailConfiguration | null = null;

function containsForbiddenControlCharacters(value: string): boolean {
  return /\r|\n|\0/u.test(value);
}

function readRequiredEnvironmentValue(
  name: string,
  maximumLength = MAXIMUM_STANDARD_VALUE_LENGTH,
): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Falta la variable de entorno obligatoria ${name}.`,
    );
  }

  if (
    value.length > maximumLength
    || containsForbiddenControlCharacters(value)
  ) {
    throw new Error(`${name} contiene un valor no permitido.`);
  }

  return value;
}

function readRequiredSecretEnvironmentValue(name: string): string {
  const value = process.env[name];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(
      `Falta la variable de entorno obligatoria ${name}.`,
    );
  }

  if (
    value.length > MAXIMUM_SECRET_LENGTH
    || containsForbiddenControlCharacters(value)
  ) {
    throw new Error(`${name} contiene un valor no permitido.`);
  }

  // La contraseña SMTP se conserva exactamente como fue configurada.
  return value;
}

function readOptionalEnvironmentValue(
  name: string,
  maximumLength = MAXIMUM_STANDARD_VALUE_LENGTH,
): string | null {
  const rawValue = process.env[name];

  if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
    return null;
  }

  const value = rawValue.trim();

  if (
    value.length > maximumLength
    || containsForbiddenControlCharacters(value)
  ) {
    throw new Error(`${name} contiene un valor no permitido.`);
  }

  return value;
}

function readEmailMode(): EmailMode {
  const value = readRequiredEnvironmentValue(
    "AUTH_EMAIL_MODE",
    20,
  ).toLowerCase();

  if (!EMAIL_MODES.includes(value as EmailMode)) {
    throw new Error(
      "AUTH_EMAIL_MODE debe tener el valor console o smtp.",
    );
  }

  const mode = value as EmailMode;

  if (mode === "console" && process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_EMAIL_MODE no puede usar console en producción porque expondría códigos de autenticación en la terminal.",
    );
  }

  return mode;
}

function readBooleanEnvironmentValue(
  name: string,
  defaultValue: boolean,
): boolean {
  const value = readOptionalEnvironmentValue(name, 5);

  if (value === null) {
    return defaultValue;
  }

  const normalizedValue = value.toLowerCase();

  if (normalizedValue === "true") {
    return true;
  }

  if (normalizedValue === "false") {
    return false;
  }

  throw new Error(`${name} debe tener el valor true o false.`);
}

function readIntegerEnvironmentValue(
  name: string,
  defaultValue: number,
  minimum: number,
  maximum: number,
): number {
  const value = readOptionalEnvironmentValue(name, 20);

  if (value === null) {
    return defaultValue;
  }

  if (!/^\d+$/u.test(value)) {
    throw new Error(`${name} debe contener un número entero válido.`);
  }

  const parsedValue = Number.parseInt(value, 10);

  if (
    !Number.isSafeInteger(parsedValue)
    || parsedValue < minimum
    || parsedValue > maximum
  ) {
    throw new Error(
      `${name} debe estar entre ${minimum} y ${maximum}.`,
    );
  }

  return parsedValue;
}

function isValidEmailAddress(value: string): boolean {
  if (
    value.length < 5
    || value.length > 320
    || containsForbiddenControlCharacters(value)
  ) {
    return false;
  }

  const separatorIndex = value.lastIndexOf("@");

  if (
    separatorIndex <= 0
    || separatorIndex > 64
    || separatorIndex === value.length - 1
  ) {
    return false;
  }

  const localPart = value.slice(0, separatorIndex);
  const domain = value.slice(separatorIndex + 1).toLowerCase();

return (
  localPart.length <= 64
  && domain.length <= 255
  && !/\s/u.test(value)
  && /^[^<>(),:;"\[\]\\]+$/u.test(localPart)
  && /^(?=.{1,255}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))+$/u.test(
    domain,
  )
);
}

function validateEmailAddress(
  value: string,
  variableName: string,
): string {
  const normalizedValue = value.trim();

  if (!isValidEmailAddress(normalizedValue)) {
    throw new Error(
      `${variableName} debe contener una dirección de correo válida.`,
    );
  }

  return normalizedValue;
}

function validateEmailFrom(value: string): string {
  const normalizedValue = value.trim();

  if (
    normalizedValue.length > 500
    || containsForbiddenControlCharacters(normalizedValue)
  ) {
    throw new Error(
      "AUTH_EMAIL_FROM contiene un valor no permitido.",
    );
  }

  const bracketMatch = /^([^<>]*)<([^<>]+)>$/u.exec(
    normalizedValue,
  );

  if (
    (normalizedValue.includes("<") || normalizedValue.includes(">"))
    && !bracketMatch
  ) {
    throw new Error(
      "AUTH_EMAIL_FROM debe usar el formato Nombre <correo@dominio.com> o solamente correo@dominio.com.",
    );
  }

  const displayName = bracketMatch?.[1]?.trim() ?? "";
  const emailAddress = bracketMatch?.[2]?.trim() ?? normalizedValue;

  if (displayName.length > 150) {
    throw new Error(
      "El nombre visible de AUTH_EMAIL_FROM es demasiado largo.",
    );
  }

  validateEmailAddress(emailAddress, "AUTH_EMAIL_FROM");

  return normalizedValue;
}

function validateSmtpHost(value: string): string {
  const host = value.toLowerCase();

  if (
    host.length > 253
    || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/u.test(
      host,
    )
  ) {
    throw new Error(
      "SMTP_HOST debe contener un nombre de servidor válido.",
    );
  }

  return host;
}

function validateSmtpTransportSecurity(
  port: number,
  secure: boolean,
  requireTls: boolean,
): void {
  if (port === 465 && !secure) {
    throw new Error(
      "SMTP_SECURE debe ser true cuando SMTP_PORT es 465.",
    );
  }

  if (port === 587 && secure) {
    throw new Error(
      "SMTP_SECURE debe ser false cuando SMTP_PORT es 587; use SMTP_REQUIRE_TLS=true para STARTTLS.",
    );
  }

  if (port === 587 && !requireTls) {
    throw new Error(
      "SMTP_REQUIRE_TLS debe ser true cuando SMTP_PORT es 587.",
    );
  }

  if (
    process.env.NODE_ENV === "production"
    && !secure
    && !requireTls
  ) {
    throw new Error(
      "La conexión SMTP debe utilizar TLS en producción.",
    );
  }
}

function createEmailConfiguration(): EmailConfiguration {
  const mode = readEmailMode();

  const from = validateEmailFrom(
    readRequiredEnvironmentValue("AUTH_EMAIL_FROM"),
  );

  if (mode === "console") {
    return Object.freeze({
      mode,
      from,
    });
  }

  const port = readIntegerEnvironmentValue(
    "SMTP_PORT",
    DEFAULT_SMTP_PORT,
    1,
    65_535,
  );

  const secure = readBooleanEnvironmentValue(
    "SMTP_SECURE",
    port === 465,
  );

  const requireTls = readBooleanEnvironmentValue(
    "SMTP_REQUIRE_TLS",
    !secure,
  );

  validateSmtpTransportSecurity(port, secure, requireTls);

  const smtp = Object.freeze({
    host: validateSmtpHost(
      readRequiredEnvironmentValue("SMTP_HOST", 253),
    ),
    port,
    secure,
    requireTls,
    user: validateEmailAddress(
      readRequiredEnvironmentValue("SMTP_USER", 320),
      "SMTP_USER",
    ),
    password: readRequiredSecretEnvironmentValue("SMTP_PASSWORD"),
    connectionTimeoutMs: readIntegerEnvironmentValue(
      "SMTP_CONNECTION_TIMEOUT_MS",
      DEFAULT_SMTP_CONNECTION_TIMEOUT_MS,
      MINIMUM_SMTP_TIMEOUT_MS,
      MAXIMUM_SMTP_TIMEOUT_MS,
    ),
    greetingTimeoutMs: readIntegerEnvironmentValue(
      "SMTP_GREETING_TIMEOUT_MS",
      DEFAULT_SMTP_GREETING_TIMEOUT_MS,
      MINIMUM_SMTP_TIMEOUT_MS,
      MAXIMUM_SMTP_TIMEOUT_MS,
    ),
    socketTimeoutMs: readIntegerEnvironmentValue(
      "SMTP_SOCKET_TIMEOUT_MS",
      DEFAULT_SMTP_SOCKET_TIMEOUT_MS,
      MINIMUM_SMTP_TIMEOUT_MS,
      MAXIMUM_SMTP_TIMEOUT_MS,
    ),
  });

  return Object.freeze({
    mode,
    from,
    smtp,
  });
}

export function getEmailConfiguration(): EmailConfiguration {
  if (cachedEmailConfiguration) {
    return cachedEmailConfiguration;
  }

  const configuration = createEmailConfiguration();
  cachedEmailConfiguration = configuration;

  return configuration;
}

export function clearEmailConfigurationCache(): void {
  cachedEmailConfiguration = null;
}