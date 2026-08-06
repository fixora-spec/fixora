import {
  existsSync,
  readFileSync,
} from "node:fs";

import {
  resolve,
} from "node:path";

import process from "node:process";

const projectRoot = process.cwd();
const originalEnvironmentKeys = new Set(Object.keys(process.env));

const MINIMUM_SECRET_LENGTH = 32;
const MINIMUM_SQL_PASSWORD_LENGTH = 16;
const MAXIMUM_SECRET_LENGTH = 1_024;
const MAXIMUM_STANDARD_VALUE_LENGTH = 500;

const PLACEHOLDER_FRAGMENTS = [
  "CHANGE_ME",
  "REPLACE_ME",
  "YOUR_",
  "EXAMPLE_",
  "TODO",
  "PASSWORD_HERE",
];

function containsControlCharacters(value) {
  return /[\r\n\0]/u.test(value);
}

function containsPlaceholder(value) {
  const normalizedValue = value.toUpperCase();

  return PLACEHOLDER_FRAGMENTS.some((fragment) =>
    normalizedValue.includes(fragment),
  );
}

function parseQuotedValue(value, quote) {
  const content = value.slice(1, -1);

  if (quote === "'") {
    return content;
  }

  return content
    .replaceAll("\\n", "\n")
    .replaceAll("\\r", "\r")
    .replaceAll("\\t", "\t")
    .replaceAll('\\"', '"')
    .replaceAll("\\\\", "\\");
}

function parseEnvironmentLine(line) {
  let source = line.trimStart();

  if (source.length === 0 || source.startsWith("#")) {
    return null;
  }

  if (source.startsWith("export ")) {
    source = source.slice("export ".length).trimStart();
  }

  const separatorIndex = source.indexOf("=");

  if (separatorIndex <= 0) {
    return null;
  }

  const key = source.slice(0, separatorIndex).trim();

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) {
    return null;
  }

  const rawValue = source.slice(separatorIndex + 1);
  const leftTrimmedValue = rawValue.trimStart();

  if (leftTrimmedValue.length === 0) {
    return {
      key,
      value: "",
    };
  }

  const quote = leftTrimmedValue[0];

  if (quote === '"' || quote === "'") {
    let closingIndex = -1;
    let escaped = false;

    for (let index = 1; index < leftTrimmedValue.length; index += 1) {
      const character = leftTrimmedValue[index];

      if (quote === '"' && character === "\\" && !escaped) {
        escaped = true;
        continue;
      }

      if (character === quote && !escaped) {
        closingIndex = index;
        break;
      }

      escaped = false;
    }

    if (closingIndex === -1) {
      return {
        key,
        value: leftTrimmedValue,
      };
    }

    return {
      key,
      value: parseQuotedValue(
        leftTrimmedValue.slice(0, closingIndex + 1),
        quote,
      ),
    };
  }

  const commentMatch = /\s+#/u.exec(leftTrimmedValue);
  const unquotedValue = commentMatch
    ? leftTrimmedValue.slice(0, commentMatch.index)
    : leftTrimmedValue;

  return {
    key,
    value: unquotedValue.trim(),
  };
}

function loadEnvironmentFile(fileName, allowOverride) {
  const filePath = resolve(projectRoot, fileName);

  if (!existsSync(filePath)) {
    return false;
  }

  const content = readFileSync(filePath, "utf8").replace(/^\uFEFF/u, "");

  for (const line of content.split(/\r?\n/u)) {
    const parsedLine = parseEnvironmentLine(line);

    if (!parsedLine) {
      continue;
    }

    const {
      key,
      value,
    } = parsedLine;

    // Las variables suministradas por el proceso siempre tienen prioridad.
    if (originalEnvironmentKeys.has(key)) {
      continue;
    }

    if (allowOverride || typeof process.env[key] === "undefined") {
      process.env[key] = value;
    }
  }

  return true;
}

function readRequiredValue(
  name,
  errors,
  maximumLength = MAXIMUM_STANDARD_VALUE_LENGTH,
) {
  const rawValue = process.env[name];
  const value = typeof rawValue === "string" ? rawValue.trim() : "";

  if (!value) {
    errors.push(`Falta la variable obligatoria ${name}.`);
    return "";
  }

  if (value.length > maximumLength || containsControlCharacters(value)) {
    errors.push(`${name} contiene un valor no permitido.`);
  }

  return value;
}

function readOptionalValue(
  name,
  errors,
  maximumLength = MAXIMUM_STANDARD_VALUE_LENGTH,
) {
  const rawValue = process.env[name];
  const value = typeof rawValue === "string" ? rawValue.trim() : "";

  if (!value) {
    return "";
  }

  if (value.length > maximumLength || containsControlCharacters(value)) {
    errors.push(`${name} contiene un valor no permitido.`);
  }

  return value;
}

function readRequiredSecret(name, errors, minimumLength) {
  const rawValue = process.env[name];

  if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
    errors.push(`Falta la variable obligatoria ${name}.`);
    return "";
  }

  if (
    rawValue.length < minimumLength
    || rawValue.length > MAXIMUM_SECRET_LENGTH
    || containsControlCharacters(rawValue)
    || containsPlaceholder(rawValue)
  ) {
    errors.push(
      `${name} debe contener un secreto real de ${minimumLength} a ${MAXIMUM_SECRET_LENGTH} caracteres, sin saltos de línea ni valores de ejemplo.`,
    );
  }

  // Los secretos no se recortan: un espacio puede formar parte de la clave.
  return rawValue;
}

function readOptionalSecret(name, errors) {
  const rawValue = process.env[name];

  if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
    return "";
  }

  if (
    rawValue.length > MAXIMUM_SECRET_LENGTH
    || containsControlCharacters(rawValue)
    || containsPlaceholder(rawValue)
  ) {
    errors.push(`${name} contiene un valor no permitido o de ejemplo.`);
  }

  return rawValue;
}

function readInteger(name, defaultValue, minimum, maximum, errors) {
  const rawValue = process.env[name]?.trim();

  if (!rawValue) {
    return defaultValue;
  }

  if (!/^\d+$/u.test(rawValue)) {
    errors.push(`${name} debe contener un número entero válido.`);
    return defaultValue;
  }

  const parsedValue = Number.parseInt(rawValue, 10);

  if (
    !Number.isSafeInteger(parsedValue)
    || parsedValue < minimum
    || parsedValue > maximum
  ) {
    errors.push(`${name} debe estar entre ${minimum} y ${maximum}.`);
    return defaultValue;
  }

  return parsedValue;
}

function readBoolean(name, defaultValue, errors) {
  const rawValue = process.env[name]?.trim().toLowerCase();

  if (!rawValue) {
    return defaultValue;
  }

  if (rawValue === "true") {
    return true;
  }

  if (rawValue === "false") {
    return false;
  }

  errors.push(`${name} debe tener el valor true o false.`);
  return defaultValue;
}

function normalizeOrigin(value) {
  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
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

function validateOriginList(name, value, errors) {
  if (!value) {
    return [];
  }

  const origins = [];

  for (const rawOrigin of value.split(",")) {
    const trimmedOrigin = rawOrigin.trim();

    if (!trimmedOrigin) {
      continue;
    }

    const normalizedOrigin = normalizeOrigin(trimmedOrigin);

    if (!normalizedOrigin) {
      errors.push(`${name} contiene un origen no válido: ${trimmedOrigin}.`);
      continue;
    }

    origins.push(normalizedOrigin);
  }

  return [...new Set(origins)];
}

function extractEmailAddress(value) {
  const bracketMatch = /^([^<>]*)<([^<>]+)>$/u.exec(value.trim());

  if (bracketMatch) {
    return bracketMatch[2].trim();
  }

  if (value.includes("<") || value.includes(">")) {
    return "";
  }

  return value.trim();
}

function isValidEmailAddress(value) {
  if (
    value.length < 5
    || value.length > 320
    || containsControlCharacters(value)
    || /\s/u.test(value)
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
    && /^[^<>(),:;\\"\[\]]+$/u.test(localPart)
    && /^(?=.{1,255}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))+$/u.test(
      domain,
    )
  );
}

function maskEmailUser(email) {
  const atIndex = email.indexOf("@");

  if (atIndex <= 0) {
    return "***";
  }

  const domain = email.slice(atIndex);

  if (atIndex === 1) {
    return `${email[0]}***${domain}`;
  }

  return `${email[0]}***${domain}`;
}

function validateSqlHost(value, errors) {
  if (value && /\s|[\\/,;]/u.test(value)) {
    errors.push(
      "SQL_SERVER_HOST debe contener solo el nombre o la dirección del servidor. Configure la instancia y el puerto por separado.",
    );
  }
}

function validateSqlName(name, value, errors) {
  if (value && value.length > 128) {
    errors.push(`${name} no puede superar 128 caracteres.`);
  }
}

function validateSecretUniqueness(secretEntries, errors) {
  for (let firstIndex = 0; firstIndex < secretEntries.length; firstIndex += 1) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < secretEntries.length;
      secondIndex += 1
    ) {
      const [firstName, firstValue] = secretEntries[firstIndex];
      const [secondName, secondValue] = secretEntries[secondIndex];

      if (firstValue && secondValue && firstValue === secondValue) {
        errors.push(`${firstName} y ${secondName} deben usar valores diferentes.`);
      }
    }
  }
}

function validateGitIgnore(warnings) {
  const gitIgnorePath = resolve(projectRoot, ".gitignore");

  if (!existsSync(gitIgnorePath)) {
    warnings.push("No se encontró .gitignore para proteger .env.local.");
    return;
  }

  const patterns = readFileSync(gitIgnorePath, "utf8")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  if (!patterns.includes(".env.local") && !patterns.includes(".env.*")) {
    warnings.push(".gitignore no excluye explícitamente .env.local.");
  }
}

if (!existsSync(resolve(projectRoot, "package.json"))) {
  console.error(
    "Debe ejecutar este script desde la raíz de Fixora, donde está package.json.",
  );
  process.exit(1);
}

const loadedBaseEnvironment = loadEnvironmentFile(".env", false);
const loadedLocalEnvironment = loadEnvironmentFile(".env.local", true);

const errors = [];
const warnings = [];

validateGitIgnore(warnings);

if (!loadedLocalEnvironment) {
  warnings.push(
    "No se encontró .env.local. Copie .env.example como .env.local y sustituya todos los valores de ejemplo.",
  );
}

const nodeEnvironment =
  process.env.NODE_ENV?.trim().toLowerCase() || "development";

if (!["development", "test", "production"].includes(nodeEnvironment)) {
  errors.push("NODE_ENV debe ser development, test o production.");
}

const sqlHost = readRequiredValue("SQL_SERVER_HOST", errors, 253);
const sqlDatabase = readRequiredValue("SQL_SERVER_DATABASE", errors, 128);
const sqlUser = readRequiredValue("SQL_SERVER_USER", errors, 128);
const sqlPassword = readRequiredSecret(
  "SQL_SERVER_PASSWORD",
  errors,
  MINIMUM_SQL_PASSWORD_LENGTH,
);
const sqlInstance = readOptionalValue("SQL_SERVER_INSTANCE", errors, 128);
const sqlPortRaw = readOptionalValue("SQL_SERVER_PORT", errors, 5);

validateSqlHost(sqlHost, errors);
validateSqlName("SQL_SERVER_DATABASE", sqlDatabase, errors);
validateSqlName("SQL_SERVER_USER", sqlUser, errors);

if (sqlInstance && !/^[A-Za-z0-9_.-]+$/u.test(sqlInstance)) {
  errors.push("SQL_SERVER_INSTANCE contiene un nombre de instancia no válido.");
}

if (sqlInstance && sqlPortRaw) {
  errors.push(
    "Utilice SQL_SERVER_INSTANCE o SQL_SERVER_PORT, pero no ambos al mismo tiempo.",
  );
}

if (!sqlInstance && !sqlPortRaw) {
  errors.push("Debe configurar SQL_SERVER_INSTANCE o SQL_SERVER_PORT.");
}

let sqlPort = null;

if (sqlPortRaw) {
  if (!/^\d+$/u.test(sqlPortRaw)) {
    errors.push("SQL_SERVER_PORT debe contener un número entero válido.");
  } else {
    sqlPort = Number.parseInt(sqlPortRaw, 10);

    if (!Number.isSafeInteger(sqlPort) || sqlPort < 1 || sqlPort > 65_535) {
      errors.push("SQL_SERVER_PORT debe ser un puerto válido entre 1 y 65535.");
    }
  }
}

const encryptConnection = readBoolean(
  "SQL_SERVER_ENCRYPT",
  nodeEnvironment === "production",
  errors,
);
const trustServerCertificate = readBoolean(
  "SQL_SERVER_TRUST_SERVER_CERTIFICATE",
  nodeEnvironment !== "production",
  errors,
);

if (nodeEnvironment === "production" && !encryptConnection) {
  errors.push("SQL_SERVER_ENCRYPT debe ser true en producción.");
}

if (nodeEnvironment === "production" && trustServerCertificate) {
  errors.push(
    "SQL_SERVER_TRUST_SERVER_CERTIFICATE debe ser false en producción.",
  );
}

const connectionTimeoutMs = readInteger(
  "SQL_SERVER_CONNECTION_TIMEOUT_MS",
  15_000,
  1_000,
  120_000,
  errors,
);
const requestTimeoutMs = readInteger(
  "SQL_SERVER_REQUEST_TIMEOUT_MS",
  15_000,
  1_000,
  120_000,
  errors,
);
const poolMaximum = readInteger(
  "SQL_SERVER_POOL_MAX",
  10,
  1,
  100,
  errors,
);
const poolMinimum = readInteger(
  "SQL_SERVER_POOL_MIN",
  0,
  0,
  100,
  errors,
);
const poolIdleTimeoutMs = readInteger(
  "SQL_SERVER_POOL_IDLE_TIMEOUT_MS",
  30_000,
  1_000,
  600_000,
  errors,
);

if (poolMinimum > poolMaximum) {
  errors.push("SQL_SERVER_POOL_MIN no puede ser mayor que SQL_SERVER_POOL_MAX.");
}

const authCodePepper = readRequiredSecret(
  "AUTH_CODE_PEPPER",
  errors,
  MINIMUM_SECRET_LENGTH,
);
const authSessionPepper = readRequiredSecret(
  "AUTH_SESSION_PEPPER",
  errors,
  MINIMUM_SECRET_LENGTH,
);
const authRateLimitPepper = readRequiredSecret(
  "AUTH_RATE_LIMIT_PEPPER",
  errors,
  MINIMUM_SECRET_LENGTH,
);
const passwordResetTokenSecret = readRequiredSecret(
  "AUTH_PASSWORD_RESET_TOKEN_SECRET",
  errors,
  MINIMUM_SECRET_LENGTH,
);

const secretEntries = [
  ["SQL_SERVER_PASSWORD", sqlPassword],
  ["AUTH_CODE_PEPPER", authCodePepper],
  ["AUTH_SESSION_PEPPER", authSessionPepper],
  ["AUTH_RATE_LIMIT_PEPPER", authRateLimitPepper],
  ["AUTH_PASSWORD_RESET_TOKEN_SECRET", passwordResetTokenSecret],
];

validateSecretUniqueness(secretEntries, errors);

const sessionCookieName = readRequiredValue(
  "AUTH_SESSION_COOKIE_NAME",
  errors,
  64,
);

if (
  sessionCookieName
  && !/^[A-Za-z0-9_-]+$/u.test(sessionCookieName)
) {
  errors.push(
    "AUTH_SESSION_COOKIE_NAME solo puede usar letras, números, guiones y guiones bajos.",
  );
}

const sessionTtlHours = readInteger(
  "AUTH_SESSION_TTL_HOURS",
  168,
  1,
  8_760,
  errors,
);
const sessionCookieSecure = readBoolean(
  "AUTH_SESSION_COOKIE_SECURE",
  nodeEnvironment === "production",
  errors,
);

if (nodeEnvironment === "production" && !sessionCookieSecure) {
  errors.push("AUTH_SESSION_COOKIE_SECURE debe ser true en producción.");
}

const verificationCodeTtlMinutes = readInteger(
  "AUTH_VERIFICATION_CODE_TTL_MINUTES",
  10,
  1,
  60,
  errors,
);
const passwordResetCodeTtlMinutes = readInteger(
  "AUTH_PASSWORD_RESET_CODE_TTL_MINUTES",
  10,
  1,
  60,
  errors,
);
const maximumCodeAttempts = readInteger(
  "AUTH_CODE_MAX_ATTEMPTS",
  5,
  1,
  20,
  errors,
);

const siteUrl = readRequiredValue("NEXT_PUBLIC_SITE_URL", errors, 2_048);
const normalizedSiteOrigin = siteUrl ? normalizeOrigin(siteUrl) : null;

if (siteUrl && !normalizedSiteOrigin) {
  errors.push(
    "NEXT_PUBLIC_SITE_URL debe contener un origen HTTP o HTTPS sin ruta, consulta ni fragmento.",
  );
}

if (
  nodeEnvironment === "production"
  && normalizedSiteOrigin
  && !normalizedSiteOrigin.startsWith("https://")
) {
  errors.push("NEXT_PUBLIC_SITE_URL debe usar HTTPS en producción.");
}

const allowedOriginsValue = readOptionalValue(
  "AUTH_ALLOWED_ORIGINS",
  errors,
  8_192,
);
const allowedOrigins = validateOriginList(
  "AUTH_ALLOWED_ORIGINS",
  allowedOriginsValue,
  errors,
);

if (
  normalizedSiteOrigin
  && allowedOrigins.length > 0
  && !allowedOrigins.includes(normalizedSiteOrigin)
) {
  warnings.push(
    "AUTH_ALLOWED_ORIGINS no incluye NEXT_PUBLIC_SITE_URL. El sitio seguirá permitido por NEXT_PUBLIC_SITE_URL, pero conviene mantener ambas variables coherentes.",
  );
}

if (nodeEnvironment === "production") {
  for (const origin of allowedOrigins) {
    if (!origin.startsWith("https://")) {
      errors.push(`AUTH_ALLOWED_ORIGINS debe usar HTTPS en producción: ${origin}.`);
    }
  }
}

const emailMode = readRequiredValue("AUTH_EMAIL_MODE", errors, 20).toLowerCase();
const emailFrom = readRequiredValue("AUTH_EMAIL_FROM", errors, 500);
const emailFromAddress = extractEmailAddress(emailFrom);
const emailFromMatch = /^([^<>]*)<([^<>]+)>$/u.exec(emailFrom.trim());
const emailFromDisplayName = emailFromMatch?.[1]?.trim() ?? "";

if (emailFromDisplayName.length > 150) {
  errors.push("El nombre visible de AUTH_EMAIL_FROM no puede superar 150 caracteres.");
}

if (!["console", "smtp"].includes(emailMode)) {
  errors.push("AUTH_EMAIL_MODE debe tener el valor console o smtp.");
}

if (emailMode === "console" && nodeEnvironment === "production") {
  errors.push(
    "AUTH_EMAIL_MODE no puede ser console en producción porque expondría códigos de autenticación en la terminal.",
  );
}

if (!isValidEmailAddress(emailFromAddress)) {
  errors.push(
    "AUTH_EMAIL_FROM debe usar el formato Nombre <correo@dominio.com> o correo@dominio.com.",
  );
}

let smtpSummary = "No requerido en modo console";

if (emailMode === "smtp") {
  const smtpHost = readRequiredValue("SMTP_HOST", errors, 253).toLowerCase();
  const smtpUser = readRequiredValue("SMTP_USER", errors, 320);
  const smtpPassword = readRequiredSecret("SMTP_PASSWORD", errors, 1);
  const smtpPort = readInteger("SMTP_PORT", 587, 1, 65_535, errors);
  const smtpSecure = readBoolean("SMTP_SECURE", smtpPort === 465, errors);
  const smtpRequireTls = readBoolean("SMTP_REQUIRE_TLS", !smtpSecure, errors);

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
    errors.push("SMTP_HOST debe contener un nombre de servidor válido.");
  }

  if (smtpUser && !isValidEmailAddress(smtpUser)) {
    errors.push("SMTP_USER debe contener una dirección de correo válida.");
  }

  if (smtpPort === 465 && !smtpSecure) {
    errors.push("SMTP_SECURE debe ser true cuando SMTP_PORT es 465.");
  }

  if (smtpPort === 587 && smtpSecure) {
    errors.push(
      "SMTP_SECURE debe ser false cuando SMTP_PORT es 587; use SMTP_REQUIRE_TLS=true para STARTTLS.",
    );
  }

  if (smtpPort === 587 && !smtpRequireTls) {
    errors.push("SMTP_REQUIRE_TLS debe ser true cuando SMTP_PORT es 587.");
  }

  if (nodeEnvironment === "production" && !smtpSecure && !smtpRequireTls) {
    errors.push("La conexión SMTP debe utilizar TLS en producción.");
  }

  for (const [secretName, secretValue] of secretEntries) {
    if (smtpPassword && secretValue && smtpPassword === secretValue) {
      errors.push(`SMTP_PASSWORD y ${secretName} deben usar valores diferentes.`);
    }
  }

  smtpSummary =
    smtpHost && smtpUser
      ? `${smtpHost}:${smtpPort} (${maskEmailUser(smtpUser)})`
      : "Configuración incompleta";
}

// Lee la variable aunque no sea necesaria en modo console para detectar
// valores de ejemplo que se hayan dejado accidentalmente en un entorno real.
if (emailMode !== "smtp") {
  readOptionalSecret("SMTP_PASSWORD", errors);
}

if (warnings.length > 0) {
  console.warn("\nAdvertencias:");

  for (const warning of warnings) {
    console.warn(`- ${warning}`);
  }
}

if (errors.length > 0) {
  console.error("\nLa configuración de autenticación contiene errores:");

  for (const error of errors) {
    console.error(`- ${error}`);
  }

  process.exit(1);
}

console.log("\nConfiguración de autenticación y correo válida.");
console.log("----------------------------------------------");
console.log(`Archivo .env cargado: ${loadedBaseEnvironment ? "Sí" : "No"}`);
console.log(`Archivo .env.local cargado: ${loadedLocalEnvironment ? "Sí" : "No"}`);
console.log(`Entorno: ${nodeEnvironment}`);
console.log(`Servidor SQL: ${sqlHost}`);
console.log(
  `Conexión SQL: ${
    sqlInstance ? `instancia ${sqlInstance}` : `puerto ${sqlPort}`
  }`,
);
console.log(`Base de datos: ${sqlDatabase}`);
console.log(`Usuario SQL: ${sqlUser}`);
console.log(`SQL cifrado: ${encryptConnection ? "Sí" : "No"}`);
console.log(
  `Confiar en certificado: ${trustServerCertificate ? "Sí" : "No"}`,
);
console.log(`Timeout de conexión SQL: ${connectionTimeoutMs} ms`);
console.log(`Timeout de consultas SQL: ${requestTimeoutMs} ms`);
console.log(`Pool SQL: mínimo ${poolMinimum}, máximo ${poolMaximum}`);
console.log(`Tiempo inactivo del pool SQL: ${poolIdleTimeoutMs} ms`);
console.log(`Cookie de sesión: ${sessionCookieName}`);
console.log(`Cookie segura: ${sessionCookieSecure ? "Sí" : "No"}`);
console.log(`Duración de sesión: ${sessionTtlHours} horas`);
console.log(`Código de verificación: ${verificationCodeTtlMinutes} minutos`);
console.log(`Código de recuperación: ${passwordResetCodeTtlMinutes} minutos`);
console.log(`Intentos máximos por código: ${maximumCodeAttempts}`);
console.log(`URL pública: ${normalizedSiteOrigin}`);
console.log(
  `Orígenes adicionales: ${
    allowedOrigins.length > 0 ? allowedOrigins.join(", ") : "Ninguno"
  }`,
);
console.log(`Modo de correo: ${emailMode}`);
console.log(
  `Remitente: ${
    emailFromAddress ? maskEmailUser(emailFromAddress) : "No válido"
  }`,
);
console.log(`SMTP: ${smtpSummary}`);