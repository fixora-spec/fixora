import {
  existsSync,
  readFileSync,
} from "node:fs";

import {
  resolve,
} from "node:path";

import process from "node:process";

const projectRoot =
  process.cwd();

const originalEnvironmentKeys =
  new Set(
    Object.keys(
      process.env,
    ),
  );

const MINIMUM_SECRET_LENGTH =
  32;

const MINIMUM_SQL_PASSWORD_LENGTH =
  16;

function parseEnvironmentLine(
  line,
) {
  const trimmedLine =
    line.trim();

  if (
    trimmedLine.length === 0
    || trimmedLine.startsWith(
      "#",
    )
  ) {
    return null;
  }

  const separatorIndex =
    trimmedLine.indexOf(
      "=",
    );

  if (
    separatorIndex <= 0
  ) {
    return null;
  }

  const key =
    trimmedLine
      .slice(
        0,
        separatorIndex,
      )
      .trim();

  let value =
    trimmedLine
      .slice(
        separatorIndex + 1,
      )
      .trim();

  if (
    (
      value.startsWith(
        "\"",
      )
      && value.endsWith(
        "\"",
      )
    )
    || (
      value.startsWith(
        "'",
      )
      && value.endsWith(
        "'",
      )
    )
  ) {
    const quote =
      value[0];

    value =
      value.slice(
        1,
        -1,
      );

    if (
      quote === "\""
    ) {
      value =
        value
          .replaceAll(
            "\\n",
            "\n",
          )
          .replaceAll(
            "\\r",
            "\r",
          )
          .replaceAll(
            "\\t",
            "\t",
          )
          .replaceAll(
            "\\\"",
            "\"",
          );
    }
  }

  return {
    key,
    value,
  };
}

function loadEnvironmentFile(
  fileName,
  allowOverride,
) {
  const filePath =
    resolve(
      projectRoot,
      fileName,
    );

  if (
    !existsSync(
      filePath,
    )
  ) {
    return false;
  }

  const content =
    readFileSync(
      filePath,
      "utf8",
    ).replace(
      /^\uFEFF/u,
      "",
    );

  for (
    const line
    of content.split(
      /\r?\n/u,
    )
  ) {
    const parsedLine =
      parseEnvironmentLine(
        line,
      );

    if (
      !parsedLine
    ) {
      continue;
    }

    const {
      key,
      value,
    } = parsedLine;

    if (
      originalEnvironmentKeys.has(
        key,
      )
    ) {
      continue;
    }

    if (
      allowOverride
      || typeof process.env[key]
        === "undefined"
    ) {
      process.env[key] =
        value;
    }
  }

  return true;
}

function containsControlCharacters(
  value,
) {
  return /\r|\n|\0/u.test(
    value,
  );
}

function containsPlaceholder(
  value,
) {
  const normalizedValue =
    value.toUpperCase();

  return [
    "CHANGE_ME",
    "REPLACE_ME",
    "YOUR_",
    "EXAMPLE_",
    "TODO",
  ].some(
    (
      placeholder,
    ) =>
      normalizedValue.includes(
        placeholder,
      ),
  );
}

function readRequiredValue(
  name,
  errors,
) {
  const value =
    process.env[name]
      ?.trim();

  if (
    !value
  ) {
    errors.push(
      `Falta la variable obligatoria ${name}.`,
    );

    return "";
  }

  if (
    containsControlCharacters(
      value,
    )
  ) {
    errors.push(
      `${name} contiene caracteres de control no permitidos.`,
    );
  }

  return value;
}

function readOptionalValue(
  name,
  errors,
) {
  const value =
    process.env[name]
      ?.trim();

  if (
    !value
  ) {
    return "";
  }

  if (
    containsControlCharacters(
      value,
    )
  ) {
    errors.push(
      `${name} contiene caracteres de control no permitidos.`,
    );
  }

  return value;
}

function readInteger(
  name,
  defaultValue,
  minimum,
  maximum,
  errors,
) {
  const rawValue =
    process.env[name]
      ?.trim();

  if (
    !rawValue
  ) {
    return defaultValue;
  }

  if (
    !/^\d+$/u.test(
      rawValue,
    )
  ) {
    errors.push(
      `${name} debe contener un número entero válido.`,
    );

    return defaultValue;
  }

  const parsedValue =
    Number.parseInt(
      rawValue,
      10,
    );

  if (
    !Number.isSafeInteger(
      parsedValue,
    )
    || parsedValue < minimum
    || parsedValue > maximum
  ) {
    errors.push(
      `${name} debe estar entre ${minimum} y ${maximum}.`,
    );

    return defaultValue;
  }

  return parsedValue;
}

function readBoolean(
  name,
  defaultValue,
  errors,
) {
  const rawValue =
    process.env[name]
      ?.trim()
      .toLowerCase();

  if (
    !rawValue
  ) {
    return defaultValue;
  }

  if (
    rawValue === "true"
  ) {
    return true;
  }

  if (
    rawValue === "false"
  ) {
    return false;
  }

  errors.push(
    `${name} debe tener el valor true o false.`,
  );

  return defaultValue;
}

function validateSecret(
  name,
  value,
  errors,
) {
  if (
    !value
  ) {
    return;
  }

  if (
    value.length
      < MINIMUM_SECRET_LENGTH
    || containsPlaceholder(
      value,
    )
  ) {
    errors.push(
      `${name} debe ser un secreto real y aleatorio de al menos ${MINIMUM_SECRET_LENGTH} caracteres.`,
    );
  }
}

function normalizeOrigin(
  value,
) {
  try {
    const url =
      new URL(
        value,
      );

    if (
      url.protocol !== "http:"
      && url.protocol !== "https:"
    ) {
      return null;
    }

    if (
      url.username
      || url.password
      || url.search
      || url.hash
      || url.pathname !== "/"
    ) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

function validateOriginList(
  name,
  value,
  errors,
) {
  if (
    !value
  ) {
    return [];
  }

  const origins =
    [];

  for (
    const rawOrigin
    of value.split(
      ",",
    )
  ) {
    const trimmedOrigin =
      rawOrigin.trim();

    if (
      !trimmedOrigin
    ) {
      continue;
    }

    const normalizedOrigin =
      normalizeOrigin(
        trimmedOrigin,
      );

    if (
      !normalizedOrigin
    ) {
      errors.push(
        `${name} contiene un origen no válido: ${trimmedOrigin}.`,
      );

      continue;
    }

    origins.push(
      normalizedOrigin,
    );
  }

  return [
    ...new Set(
      origins,
    ),
  ];
}

function extractEmailAddress(
  value,
) {
  const match =
    value.match(
      /<([^<>]+)>$/u,
    );

  return (
    match?.[1]
    ?? value
  ).trim();
}

function isValidEmailAddress(
  value,
) {
  return (
    value.length <= 320
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(
      value,
    )
  );
}

function maskEmailUser(
  email,
) {
  const atIndex =
    email.indexOf(
      "@",
    );

  if (
    atIndex <= 1
  ) {
    return "***";
  }

  return `${email[0]}***${email.slice(atIndex)}`;
}

if (
  !existsSync(
    resolve(
      projectRoot,
      "package.json",
    ),
  )
) {
  console.error(
    "Debe ejecutar este script desde la raíz de Fixora, donde está package.json.",
  );

  process.exit(
    1,
  );
}

const loadedBaseEnvironment =
  loadEnvironmentFile(
    ".env",
    false,
  );

const loadedLocalEnvironment =
  loadEnvironmentFile(
    ".env.local",
    true,
  );

const errors =
  [];

const warnings =
  [];

if (
  !loadedLocalEnvironment
) {
  warnings.push(
    "No se encontró .env.local. Copie .env.example como .env.local y sustituya todos los valores de ejemplo.",
  );
}

const nodeEnvironment =
  process.env.NODE_ENV
    ?.trim()
    .toLowerCase()
  || "development";

if (
  ![
    "development",
    "test",
    "production",
  ].includes(
    nodeEnvironment,
  )
) {
  errors.push(
    "NODE_ENV debe ser development, test o production.",
  );
}

const sqlHost =
  readRequiredValue(
    "SQL_SERVER_HOST",
    errors,
  );

const sqlDatabase =
  readRequiredValue(
    "SQL_SERVER_DATABASE",
    errors,
  );

const sqlUser =
  readRequiredValue(
    "SQL_SERVER_USER",
    errors,
  );

const sqlPassword =
  readRequiredValue(
    "SQL_SERVER_PASSWORD",
    errors,
  );

const sqlInstance =
  readOptionalValue(
    "SQL_SERVER_INSTANCE",
    errors,
  );

const sqlPortRaw =
  readOptionalValue(
    "SQL_SERVER_PORT",
    errors,
  );

if (
  sqlInstance
  && sqlPortRaw
) {
  errors.push(
    "Utilice SQL_SERVER_INSTANCE o SQL_SERVER_PORT, pero no ambos al mismo tiempo.",
  );
}

if (
  !sqlInstance
  && !sqlPortRaw
) {
  errors.push(
    "Debe configurar SQL_SERVER_INSTANCE o SQL_SERVER_PORT.",
  );
}

let sqlPort =
  null;

if (
  sqlPortRaw
) {
  if (
    !/^\d+$/u.test(
      sqlPortRaw,
    )
  ) {
    errors.push(
      "SQL_SERVER_PORT debe contener un número entero válido.",
    );
  } else {
    sqlPort =
      Number.parseInt(
        sqlPortRaw,
        10,
      );

    if (
      !Number.isSafeInteger(
        sqlPort,
      )
      || sqlPort < 1
      || sqlPort > 65_535
    ) {
      errors.push(
        "SQL_SERVER_PORT debe ser un puerto válido entre 1 y 65535.",
      );
    }
  }
}

if (
  sqlPassword
  && (
    sqlPassword.length
      < MINIMUM_SQL_PASSWORD_LENGTH
    || containsPlaceholder(
      sqlPassword,
    )
  )
) {
  errors.push(
    `SQL_SERVER_PASSWORD debe ser una contraseña real de al menos ${MINIMUM_SQL_PASSWORD_LENGTH} caracteres.`,
  );
}

const encryptConnection =
  readBoolean(
    "SQL_SERVER_ENCRYPT",
    false,
    errors,
  );

const trustServerCertificate =
  readBoolean(
    "SQL_SERVER_TRUST_SERVER_CERTIFICATE",
    true,
    errors,
  );

const connectionTimeoutMs =
  readInteger(
    "SQL_SERVER_CONNECTION_TIMEOUT_MS",
    15_000,
    1_000,
    120_000,
    errors,
  );

const requestTimeoutMs =
  readInteger(
    "SQL_SERVER_REQUEST_TIMEOUT_MS",
    15_000,
    1_000,
    120_000,
    errors,
  );

const poolMaximum =
  readInteger(
    "SQL_SERVER_POOL_MAX",
    10,
    1,
    100,
    errors,
  );

const poolMinimum =
  readInteger(
    "SQL_SERVER_POOL_MIN",
    0,
    0,
    100,
    errors,
  );

const poolIdleTimeoutMs =
  readInteger(
    "SQL_SERVER_POOL_IDLE_TIMEOUT_MS",
    30_000,
    1_000,
    600_000,
    errors,
  );

if (
  poolMinimum > poolMaximum
) {
  errors.push(
    "SQL_SERVER_POOL_MIN no puede ser mayor que SQL_SERVER_POOL_MAX.",
  );
}

const authCodePepper =
  readRequiredValue(
    "AUTH_CODE_PEPPER",
    errors,
  );

const authSessionPepper =
  readRequiredValue(
    "AUTH_SESSION_PEPPER",
    errors,
  );

const authRateLimitPepper =
  readRequiredValue(
    "AUTH_RATE_LIMIT_PEPPER",
    errors,
  );

const passwordResetTokenSecret =
  readRequiredValue(
    "AUTH_PASSWORD_RESET_TOKEN_SECRET",
    errors,
  );

validateSecret(
  "AUTH_CODE_PEPPER",
  authCodePepper,
  errors,
);

validateSecret(
  "AUTH_SESSION_PEPPER",
  authSessionPepper,
  errors,
);

validateSecret(
  "AUTH_RATE_LIMIT_PEPPER",
  authRateLimitPepper,
  errors,
);

validateSecret(
  "AUTH_PASSWORD_RESET_TOKEN_SECRET",
  passwordResetTokenSecret,
  errors,
);

const secretEntries =
  [
    [
      "AUTH_CODE_PEPPER",
      authCodePepper,
    ],
    [
      "AUTH_SESSION_PEPPER",
      authSessionPepper,
    ],
    [
      "AUTH_RATE_LIMIT_PEPPER",
      authRateLimitPepper,
    ],
    [
      "AUTH_PASSWORD_RESET_TOKEN_SECRET",
      passwordResetTokenSecret,
    ],
  ].filter(
    (
      [
        ,
        value,
      ],
    ) =>
      Boolean(
        value,
      ),
  );

for (
  let firstIndex = 0;
  firstIndex < secretEntries.length;
  firstIndex += 1
) {
  for (
    let secondIndex =
      firstIndex + 1;

    secondIndex
      < secretEntries.length;

    secondIndex += 1
  ) {
    const [
      firstName,
      firstValue,
    ] =
      secretEntries[
        firstIndex
      ];

    const [
      secondName,
      secondValue,
    ] =
      secretEntries[
        secondIndex
      ];

    if (
      firstValue
      === secondValue
    ) {
      errors.push(
        `${firstName} y ${secondName} deben usar secretos diferentes.`,
      );
    }
  }
}

const sessionCookieName =
  readRequiredValue(
    "AUTH_SESSION_COOKIE_NAME",
    errors,
  );

if (
  sessionCookieName
  && (
    sessionCookieName.length > 64
    || !/^[A-Za-z0-9_-]+$/u.test(
      sessionCookieName,
    )
  )
) {
  errors.push(
    "AUTH_SESSION_COOKIE_NAME debe contener como máximo 64 caracteres y solo puede usar letras, números, guiones y guiones bajos.",
  );
}

const sessionTtlHours =
  readInteger(
    "AUTH_SESSION_TTL_HOURS",
    168,
    1,
    8_760,
    errors,
  );

const sessionCookieSecure =
  readBoolean(
    "AUTH_SESSION_COOKIE_SECURE",
    nodeEnvironment
      === "production",
    errors,
  );

if (
  nodeEnvironment
    === "production"
  && !sessionCookieSecure
) {
  errors.push(
    "AUTH_SESSION_COOKIE_SECURE debe ser true en producción.",
  );
}

const verificationCodeTtlMinutes =
  readInteger(
    "AUTH_VERIFICATION_CODE_TTL_MINUTES",
    10,
    1,
    60,
    errors,
  );

const passwordResetCodeTtlMinutes =
  readInteger(
    "AUTH_PASSWORD_RESET_CODE_TTL_MINUTES",
    10,
    1,
    60,
    errors,
  );

const maximumCodeAttempts =
  readInteger(
    "AUTH_CODE_MAX_ATTEMPTS",
    5,
    1,
    20,
    errors,
  );

const siteUrl =
  readRequiredValue(
    "NEXT_PUBLIC_SITE_URL",
    errors,
  );

const normalizedSiteOrigin =
  siteUrl
    ? normalizeOrigin(
        siteUrl,
      )
    : null;

if (
  siteUrl
  && !normalizedSiteOrigin
) {
  errors.push(
    "NEXT_PUBLIC_SITE_URL debe contener un origen HTTP o HTTPS sin ruta, consulta ni fragmento.",
  );
}

const allowedOriginsValue =
  readOptionalValue(
    "AUTH_ALLOWED_ORIGINS",
    errors,
  );

const allowedOrigins =
  validateOriginList(
    "AUTH_ALLOWED_ORIGINS",
    allowedOriginsValue,
    errors,
  );

if (
  normalizedSiteOrigin
  && allowedOrigins.length > 0
  && !allowedOrigins.includes(
    normalizedSiteOrigin,
  )
) {
  warnings.push(
    "AUTH_ALLOWED_ORIGINS no incluye NEXT_PUBLIC_SITE_URL. El sitio seguirá permitido por NEXT_PUBLIC_SITE_URL, pero conviene mantener ambas variables coherentes.",
  );
}

const emailMode =
  readRequiredValue(
    "AUTH_EMAIL_MODE",
    errors,
  ).toLowerCase();

const emailFrom =
  readRequiredValue(
    "AUTH_EMAIL_FROM",
    errors,
  );

if (
  ![
    "console",
    "smtp",
  ].includes(
    emailMode,
  )
) {
  errors.push(
    "AUTH_EMAIL_MODE debe tener el valor console o smtp.",
  );
}

if (
  emailMode === "console"
  && nodeEnvironment
    === "production"
) {
  errors.push(
    "AUTH_EMAIL_MODE no puede ser console en producción porque expondría códigos de autenticación en la terminal.",
  );
}

if (
  emailFrom
  && !isValidEmailAddress(
    extractEmailAddress(
      emailFrom,
    ),
  )
) {
  errors.push(
    "AUTH_EMAIL_FROM debe contener una dirección de correo válida.",
  );
}

let smtpSummary =
  "No requerido en modo console";

if (
  emailMode === "smtp"
) {
  const smtpHost =
    readRequiredValue(
      "SMTP_HOST",
      errors,
    ).toLowerCase();

  const smtpUser =
    readRequiredValue(
      "SMTP_USER",
      errors,
    );

  const smtpPassword =
    readRequiredValue(
      "SMTP_PASSWORD",
      errors,
    );

  const smtpPort =
    readInteger(
      "SMTP_PORT",
      587,
      1,
      65_535,
      errors,
    );

  const smtpSecure =
    readBoolean(
      "SMTP_SECURE",
      false,
      errors,
    );

  const smtpRequireTls =
    readBoolean(
      "SMTP_REQUIRE_TLS",
      !smtpSecure,
      errors,
    );

  readInteger(
    "SMTP_CONNECTION_TIMEOUT_MS",
    15_000,
    1_000,
    120_000,
    errors,
  );

  readInteger(
    "SMTP_GREETING_TIMEOUT_MS",
    10_000,
    1_000,
    120_000,
    errors,
  );

  readInteger(
    "SMTP_SOCKET_TIMEOUT_MS",
    30_000,
    1_000,
    120_000,
    errors,
  );

  if (
    smtpHost
    && !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/u.test(
      smtpHost,
    )
  ) {
    errors.push(
      "SMTP_HOST debe contener un nombre de servidor válido.",
    );
  }

  if (
    smtpUser
    && !isValidEmailAddress(
      smtpUser,
    )
  ) {
    errors.push(
      "SMTP_USER debe contener una dirección de correo válida.",
    );
  }

  if (
    smtpPassword
    && containsPlaceholder(
      smtpPassword,
    )
  ) {
    errors.push(
      "SMTP_PASSWORD todavía contiene un valor de ejemplo.",
    );
  }

  if (
    smtpPort === 465
    && !smtpSecure
  ) {
    errors.push(
      "SMTP_SECURE debe ser true cuando SMTP_PORT es 465.",
    );
  }

  if (
    smtpPort === 587
    && smtpSecure
  ) {
    errors.push(
      "SMTP_SECURE debe ser false cuando SMTP_PORT es 587; use SMTP_REQUIRE_TLS=true para STARTTLS.",
    );
  }

  if (
    smtpPort === 587
    && !smtpRequireTls
  ) {
    warnings.push(
      "Para SMTP_PORT=587 se recomienda SMTP_REQUIRE_TLS=true.",
    );
  }

  smtpSummary =
    smtpHost
    && smtpUser
      ? `${smtpHost}:${smtpPort} (${maskEmailUser(smtpUser)})`
      : "Configuración incompleta";
}

if (
  warnings.length > 0
) {
  console.warn(
    "\nAdvertencias:",
  );

  for (
    const warning
    of warnings
  ) {
    console.warn(
      `- ${warning}`,
    );
  }
}

if (
  errors.length > 0
) {
  console.error(
    "\nLa configuración de autenticación contiene errores:",
  );

  for (
    const error
    of errors
  ) {
    console.error(
      `- ${error}`,
    );
  }

  process.exit(
    1,
  );
}

console.log(
  "\nConfiguración de autenticación y correo válida.",
);

console.log(
  "----------------------------------------------",
);

console.log(
  `Archivo .env cargado: ${loadedBaseEnvironment ? "Sí" : "No"}`,
);

console.log(
  `Archivo .env.local cargado: ${loadedLocalEnvironment ? "Sí" : "No"}`,
);

console.log(
  `Entorno: ${nodeEnvironment}`,
);

console.log(
  `Servidor SQL: ${sqlHost}`,
);

console.log(
  `Conexión SQL: ${
    sqlInstance
      ? `instancia ${sqlInstance}`
      : `puerto ${sqlPort}`
  }`,
);

console.log(
  `Base de datos: ${sqlDatabase}`,
);

console.log(
  `Usuario SQL: ${sqlUser}`,
);

console.log(
  `SQL cifrado: ${encryptConnection ? "Sí" : "No"}`,
);

console.log(
  `Confiar en certificado: ${trustServerCertificate ? "Sí" : "No"}`,
);

console.log(
  `Timeout de conexión SQL: ${connectionTimeoutMs} ms`,
);

console.log(
  `Timeout de consultas SQL: ${requestTimeoutMs} ms`,
);

console.log(
  `Pool SQL: mínimo ${poolMinimum}, máximo ${poolMaximum}`,
);

console.log(
  `Tiempo inactivo del pool SQL: ${poolIdleTimeoutMs} ms`,
);

console.log(
  `Cookie de sesión: ${sessionCookieName}`,
);

console.log(
  `Cookie segura: ${sessionCookieSecure ? "Sí" : "No"}`,
);

console.log(
  `Duración de sesión: ${sessionTtlHours} horas`,
);

console.log(
  `Código de verificación: ${verificationCodeTtlMinutes} minutos`,
);

console.log(
  `Código de recuperación: ${passwordResetCodeTtlMinutes} minutos`,
);

console.log(
  `Intentos máximos por código: ${maximumCodeAttempts}`,
);

console.log(
  `URL pública: ${normalizedSiteOrigin}`,
);

console.log(
  `Orígenes adicionales: ${
    allowedOrigins.length > 0
      ? allowedOrigins.join(", ")
      : "Ninguno"
  }`,
);

console.log(
  `Modo de correo: ${emailMode}`,
);

console.log(
  `Remitente: ${emailFrom}`,
);

console.log(
  `SMTP: ${smtpSummary}`,
);