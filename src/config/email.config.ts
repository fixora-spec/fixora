import "server-only";

export const EMAIL_MODES = [
  "console",
  "smtp",
] as const;

export type EmailMode =
  (typeof EMAIL_MODES)[number];

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

const DEFAULT_SMTP_PORT =
  587;

const DEFAULT_SMTP_CONNECTION_TIMEOUT_MS =
  15_000;

const DEFAULT_SMTP_GREETING_TIMEOUT_MS =
  10_000;

const DEFAULT_SMTP_SOCKET_TIMEOUT_MS =
  30_000;

const MINIMUM_SMTP_TIMEOUT_MS =
  1_000;

const MAXIMUM_SMTP_TIMEOUT_MS =
  120_000;

let cachedEmailConfiguration:
  | EmailConfiguration
  | null = null;

function readRequiredEnvironmentValue(
  name: string,
): string {
  const value =
    process.env[name]?.trim();

  if (
    !value
  ) {
    throw new Error(
      `Falta la variable de entorno obligatoria ${name}.`,
    );
  }

  if (
    /\r|\n|\0/u.test(
      value,
    )
  ) {
    throw new Error(
      `${name} contiene caracteres de control no permitidos.`,
    );
  }

  return value;
}

function readOptionalEnvironmentValue(
  name: string,
): string | null {
  const value =
    process.env[name]?.trim();

  if (
    !value
  ) {
    return null;
  }

  if (
    /\r|\n|\0/u.test(
      value,
    )
  ) {
    throw new Error(
      `${name} contiene caracteres de control no permitidos.`,
    );
  }

  return value;
}

function readEmailMode():
  EmailMode {
  const value =
    readRequiredEnvironmentValue(
      "AUTH_EMAIL_MODE",
    ).toLowerCase();

  if (
    !EMAIL_MODES.includes(
      value as EmailMode,
    )
  ) {
    throw new Error(
      "AUTH_EMAIL_MODE debe tener el valor console o smtp.",
    );
  }

  const mode =
    value as EmailMode;

  if (
    mode === "console"
    && process.env.NODE_ENV
      === "production"
  ) {
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
  const value =
    readOptionalEnvironmentValue(
      name,
    );

  if (
    value === null
  ) {
    return defaultValue;
  }

  const normalizedValue =
    value.toLowerCase();

  if (
    normalizedValue === "true"
  ) {
    return true;
  }

  if (
    normalizedValue === "false"
  ) {
    return false;
  }

  throw new Error(
    `${name} debe tener el valor true o false.`,
  );
}

function readIntegerEnvironmentValue(
  name: string,
  defaultValue: number,
  minimum: number,
  maximum: number,
): number {
  const value =
    readOptionalEnvironmentValue(
      name,
    );

  if (
    value === null
  ) {
    return defaultValue;
  }

  if (
    !/^\d+$/u.test(
      value,
    )
  ) {
    throw new Error(
      `${name} debe contener un número entero válido.`,
    );
  }

  const parsedValue =
    Number.parseInt(
      value,
      10,
    );

  if (
    !Number.isSafeInteger(
      parsedValue,
    )
    || parsedValue < minimum
    || parsedValue > maximum
  ) {
    throw new Error(
      `${name} debe estar entre ${minimum} y ${maximum}.`,
    );
  }

  return parsedValue;
}

function validateEmailFrom(
  value: string,
): string {
  if (
    value.length > 500
    || /\r|\n|\0/u.test(
      value,
    )
  ) {
    throw new Error(
      "AUTH_EMAIL_FROM contiene un valor no permitido.",
    );
  }

  const emailMatch =
    value.match(
      /<([^<>]+)>$/u,
    );

  const emailAddress =
    emailMatch?.[1]?.trim()
    ?? value.trim();

  if (
    emailAddress.length > 320
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(
      emailAddress,
    )
  ) {
    throw new Error(
      "AUTH_EMAIL_FROM debe contener una dirección de correo válida.",
    );
  }

  return value.trim();
}

function validateSmtpHost(
  value: string,
): string {
  const host =
    value.toLowerCase();

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

function createEmailConfiguration():
  EmailConfiguration {
  const mode =
    readEmailMode();

  const from =
    validateEmailFrom(
      readRequiredEnvironmentValue(
        "AUTH_EMAIL_FROM",
      ),
    );

  if (
    mode === "console"
  ) {
    return {
      mode,
      from,
    };
  }

  const secure =
    readBooleanEnvironmentValue(
      "SMTP_SECURE",
      false,
    );

  return {
    mode,
    from,

    smtp: {
      host:
        validateSmtpHost(
          readRequiredEnvironmentValue(
            "SMTP_HOST",
          ),
        ),

      port:
        readIntegerEnvironmentValue(
          "SMTP_PORT",
          DEFAULT_SMTP_PORT,
          1,
          65_535,
        ),

      secure,

      requireTls:
        readBooleanEnvironmentValue(
          "SMTP_REQUIRE_TLS",
          !secure,
        ),

      user:
        readRequiredEnvironmentValue(
          "SMTP_USER",
        ),

      password:
        readRequiredEnvironmentValue(
          "SMTP_PASSWORD",
        ),

      connectionTimeoutMs:
        readIntegerEnvironmentValue(
          "SMTP_CONNECTION_TIMEOUT_MS",
          DEFAULT_SMTP_CONNECTION_TIMEOUT_MS,
          MINIMUM_SMTP_TIMEOUT_MS,
          MAXIMUM_SMTP_TIMEOUT_MS,
        ),

      greetingTimeoutMs:
        readIntegerEnvironmentValue(
          "SMTP_GREETING_TIMEOUT_MS",
          DEFAULT_SMTP_GREETING_TIMEOUT_MS,
          MINIMUM_SMTP_TIMEOUT_MS,
          MAXIMUM_SMTP_TIMEOUT_MS,
        ),

      socketTimeoutMs:
        readIntegerEnvironmentValue(
          "SMTP_SOCKET_TIMEOUT_MS",
          DEFAULT_SMTP_SOCKET_TIMEOUT_MS,
          MINIMUM_SMTP_TIMEOUT_MS,
          MAXIMUM_SMTP_TIMEOUT_MS,
        ),
    },
  };
}

export function getEmailConfiguration():
  EmailConfiguration {
  if (
    cachedEmailConfiguration
  ) {
    return cachedEmailConfiguration;
  }

  cachedEmailConfiguration =
    createEmailConfiguration();

  return cachedEmailConfiguration;
}

export function clearEmailConfigurationCache():
  void {
  cachedEmailConfiguration =
    null;
}