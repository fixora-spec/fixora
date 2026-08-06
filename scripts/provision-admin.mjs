import {
  existsSync,
  readFileSync,
} from "node:fs";

import {
  randomBytes,
  randomUUID,
  scrypt,
} from "node:crypto";

import {
  resolve,
} from "node:path";

import process from "node:process";
import readline from "node:readline";

const PROJECT_ROOT = process.cwd();
const ORIGINAL_ENVIRONMENT_KEYS = new Set(Object.keys(process.env));

const DEFAULT_ACCESS_YEARS = 5;
const MINIMUM_ACCESS_YEARS = 1;
const MAXIMUM_ACCESS_YEARS = 10;

const PASSWORD_MINIMUM_LENGTH = 12;
const PASSWORD_MAXIMUM_LENGTH = 128;

const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_SALT_LENGTH = 32;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAXIMUM_MEMORY = 64 * 1024 * 1024;

const USERNAME_SIMILARITY_THRESHOLD = 0.88;
const SHORT_USERNAME_MINIMUM_LENGTH = 5;

const MINIMUM_SQL_PASSWORD_LENGTH = 16;
const MAXIMUM_SECRET_LENGTH = 1_024;
const MAXIMUM_STANDARD_VALUE_LENGTH = 500;

const VISUAL_EQUIVALENCES = Object.freeze({
  "0": "o",
  "1": "l",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
});

const RESERVED_NORMALIZED_USERNAMES = new Set([
  "admin",
  "administrator",
  "api",
  "fixora",
  "root",
  "security",
  "soporte",
  "support",
  "system",
  "webmaster",
  "www",
]);

const REQUIRED_ACCOUNT_COLUMNS = Object.freeze([
  "account_id",
  "role",
  "status",
  "first_names",
  "last_names",
  "username",
  "username_normalized",
  "username_skeleton",
  "email",
  "email_normalized",
  "password_hash",
  "email_verified_at",
  "access_started_at",
  "access_expires_at",
  "failed_sign_in_attempts",
  "locked_until",
  "last_sign_in_at",
  "created_at",
  "updated_at",
]);

function containsForbiddenControlCharacters(value) {
  return /[\r\n\0]/u.test(value);
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
  const filePath = resolve(PROJECT_ROOT, fileName);

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

    if (key === "FIXORA_ADMIN_PASSWORD") {
      throw new Error(
        `${fileName} no debe contener FIXORA_ADMIN_PASSWORD. Use la solicitud oculta de la terminal o una variable temporal del proceso.`,
      );
    }

    if (ORIGINAL_ENVIRONMENT_KEYS.has(key)) {
      continue;
    }

    if (allowOverride || typeof process.env[key] === "undefined") {
      process.env[key] = value;
    }
  }

  return true;
}

function readRequiredEnvironmentValue(
  name,
  maximumLength = MAXIMUM_STANDARD_VALUE_LENGTH,
) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Falta la variable obligatoria ${name}.`);
  }

  if (
    value.length > maximumLength
    || containsForbiddenControlCharacters(value)
  ) {
    throw new Error(`${name} contiene un valor no permitido.`);
  }

  return value;
}

function readRequiredSecretEnvironmentValue(name) {
  const value = process.env[name];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Falta la variable obligatoria ${name}.`);
  }

  if (
    value.length < MINIMUM_SQL_PASSWORD_LENGTH
    || value.length > MAXIMUM_SECRET_LENGTH
    || containsForbiddenControlCharacters(value)
  ) {
    throw new Error(
      `${name} debe tener entre ${MINIMUM_SQL_PASSWORD_LENGTH} y ${MAXIMUM_SECRET_LENGTH} caracteres y no puede contener saltos de línea.`,
    );
  }

  return value;
}

function readOptionalEnvironmentValue(
  name,
  maximumLength = MAXIMUM_STANDARD_VALUE_LENGTH,
) {
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

function readBooleanEnvironmentValue(name, defaultValue) {
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
  name,
  defaultValue,
  minimum,
  maximum,
) {
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
    throw new Error(`${name} debe estar entre ${minimum} y ${maximum}.`);
  }

  return parsedValue;
}

function validateSqlHost(value) {
  if (/\s|[\\/,;]/u.test(value)) {
    throw new Error(
      "SQL_SERVER_HOST debe contener solamente el nombre o la dirección del servidor. Configure la instancia y el puerto por separado.",
    );
  }

  return value;
}

function validateSqlName(value, variableName) {
  if (value.length > 128) {
    throw new Error(`${variableName} no puede superar 128 caracteres.`);
  }

  return value;
}

function validateInstanceName(value) {
  if (!/^[A-Za-z0-9_.-]{1,128}$/u.test(value)) {
    throw new Error("SQL_SERVER_INSTANCE contiene un nombre no válido.");
  }

  return value;
}

function buildSqlConfiguration() {
  const nodeEnvironment = process.env.NODE_ENV?.trim().toLowerCase()
    || "development";

  const instanceName = readOptionalEnvironmentValue(
    "SQL_SERVER_INSTANCE",
    128,
  );

  const portValue = readOptionalEnvironmentValue(
    "SQL_SERVER_PORT",
    5,
  );

  if (instanceName && portValue) {
    throw new Error(
      "Configure SQL_SERVER_INSTANCE o SQL_SERVER_PORT, pero no ambos.",
    );
  }

  if (!instanceName && !portValue) {
    throw new Error(
      "Debe configurar SQL_SERVER_INSTANCE o SQL_SERVER_PORT.",
    );
  }

  const poolMinimum = readIntegerEnvironmentValue(
    "SQL_SERVER_POOL_MIN",
    0,
    0,
    100,
  );

  const poolMaximum = readIntegerEnvironmentValue(
    "SQL_SERVER_POOL_MAX",
    10,
    1,
    100,
  );

  if (poolMinimum > poolMaximum) {
    throw new Error(
      "SQL_SERVER_POOL_MIN no puede ser mayor que SQL_SERVER_POOL_MAX.",
    );
  }

  const encrypt = readBooleanEnvironmentValue(
    "SQL_SERVER_ENCRYPT",
    nodeEnvironment === "production",
  );

  const trustServerCertificate = readBooleanEnvironmentValue(
    "SQL_SERVER_TRUST_SERVER_CERTIFICATE",
    nodeEnvironment !== "production",
  );

  if (nodeEnvironment === "production" && !encrypt) {
    throw new Error("SQL_SERVER_ENCRYPT debe ser true en producción.");
  }

  if (nodeEnvironment === "production" && trustServerCertificate) {
    throw new Error(
      "SQL_SERVER_TRUST_SERVER_CERTIFICATE debe ser false en producción.",
    );
  }

  const configuration = {
    server: validateSqlHost(
      readRequiredEnvironmentValue("SQL_SERVER_HOST", 253),
    ),

    database: validateSqlName(
      readRequiredEnvironmentValue("SQL_SERVER_DATABASE", 128),
      "SQL_SERVER_DATABASE",
    ),

    user: validateSqlName(
      readRequiredEnvironmentValue("SQL_SERVER_USER", 128),
      "SQL_SERVER_USER",
    ),

    password: readRequiredSecretEnvironmentValue("SQL_SERVER_PASSWORD"),

    connectionTimeout: readIntegerEnvironmentValue(
      "SQL_SERVER_CONNECTION_TIMEOUT_MS",
      15_000,
      1_000,
      120_000,
    ),

    requestTimeout: readIntegerEnvironmentValue(
      "SQL_SERVER_REQUEST_TIMEOUT_MS",
      15_000,
      1_000,
      120_000,
    ),

    pool: {
      min: poolMinimum,
      max: poolMaximum,
      idleTimeoutMillis: readIntegerEnvironmentValue(
        "SQL_SERVER_POOL_IDLE_TIMEOUT_MS",
        30_000,
        1_000,
        600_000,
      ),
    },

    options: {
      encrypt,
      trustServerCertificate,
      enableArithAbort: true,
      appName: "Fixora administrator provisioning",
    },
  };

  if (instanceName) {
    configuration.options.instanceName = validateInstanceName(instanceName);
  } else {
    configuration.port = readIntegerEnvironmentValue(
      "SQL_SERVER_PORT",
      1433,
      1,
      65_535,
    );
  }

  return configuration;
}

function parseArguments(argumentList) {
  const allowedKeys = new Set([
    "first-names",
    "last-names",
    "username",
    "email",
    "access-years",
  ]);

  const values = {};

  for (let index = 0; index < argumentList.length; index += 1) {
    const argument = argumentList[index];

    if (argument === "--help" || argument === "-h") {
      values.help = true;
      continue;
    }

    if (!argument.startsWith("--")) {
      throw new Error(`Argumento no reconocido: ${argument}`);
    }

    const equalsIndex = argument.indexOf("=");
    let key;
    let value;

    if (equalsIndex > 2) {
      key = argument.slice(2, equalsIndex);
      value = argument.slice(equalsIndex + 1);
    } else {
      key = argument.slice(2);
      value = argumentList[index + 1];

      if (!value || value.startsWith("--")) {
        throw new Error(`Falta el valor para --${key}.`);
      }

      index += 1;
    }

    if (!allowedKeys.has(key)) {
      throw new Error(`Argumento no permitido: --${key}.`);
    }

    if (Object.hasOwn(values, key)) {
      throw new Error(`El argumento --${key} fue proporcionado más de una vez.`);
    }

    values[key] = value;
  }

  return values;
}

function printHelp() {
  console.log(`
Crear una cuenta administradora directamente en SQL Server.

No crea una ruta pública y no permite registrar administradores desde la web.

Uso en PowerShell:

  pnpm db:provision-admin -- \`
    --first-names "Christopher" \`
    --last-names "Silva Cruz" \`
    --username "christopher.admin" \`
    --email "correo@dominio.com" \`
    --access-years 5

La contraseña se solicitará de forma oculta y deberá escribirse dos veces.

Argumentos obligatorios:
  --first-names
  --last-names
  --username
  --email

Argumento opcional:
  --access-years    Entre ${MINIMUM_ACCESS_YEARS} y ${MAXIMUM_ACCESS_YEARS} años.
                    Predeterminado: ${DEFAULT_ACCESS_YEARS}.

Para automatización local puede usar temporalmente FIXORA_ADMIN_PASSWORD
como variable del proceso. No la escriba en .env ni en .env.local.
`);
}

function requireArgument(argumentsObject, name) {
  const value = argumentsObject[name]?.trim();

  if (!value) {
    throw new Error(`Falta el argumento obligatorio --${name}.`);
  }

  if (containsForbiddenControlCharacters(value)) {
    throw new Error(`--${name} contiene caracteres de control no permitidos.`);
  }

  return value.normalize("NFC");
}

function normalizeEmail(email) {
  return email.trim().normalize("NFC").toLowerCase();
}

function removeDiacritics(value) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "");
}

function normalizeUsername(username) {
  return removeDiacritics(username.trim())
    .toLowerCase()
    .replace(/[\s._-]+/gu, "")
    .replace(/[^a-z0-9]/gu, "");
}

function createUsernameSkeleton(username) {
  return [...normalizeUsername(username)]
    .map(
      (character) => VISUAL_EQUIVALENCES[character] ?? character,
    )
    .join("");
}

function calculateLevenshteinDistance(firstValue, secondValue) {
  if (firstValue === secondValue) {
    return 0;
  }

  if (firstValue.length === 0) {
    return secondValue.length;
  }

  if (secondValue.length === 0) {
    return firstValue.length;
  }

  let previousRow = Array.from(
    {
      length: secondValue.length + 1,
    },
    (_, index) => index,
  );

  for (
    let firstIndex = 1;
    firstIndex <= firstValue.length;
    firstIndex += 1
  ) {
    const currentRow = [firstIndex];

    for (
      let secondIndex = 1;
      secondIndex <= secondValue.length;
      secondIndex += 1
    ) {
      const substitutionCost =
        firstValue[firstIndex - 1] === secondValue[secondIndex - 1]
          ? 0
          : 1;

      currentRow[secondIndex] = Math.min(
        (currentRow[secondIndex - 1] ?? 0) + 1,
        (previousRow[secondIndex] ?? 0) + 1,
        (previousRow[secondIndex - 1] ?? 0) + substitutionCost,
      );
    }

    previousRow = currentRow;
  }

  return previousRow[secondValue.length] ?? 0;
}

function areUsernamesConfusinglySimilar(firstUsername, secondUsername) {
  const firstNormalized = normalizeUsername(firstUsername);
  const secondNormalized = normalizeUsername(secondUsername);
  const firstSkeleton = createUsernameSkeleton(firstUsername);
  const secondSkeleton = createUsernameSkeleton(secondUsername);

  if (
    firstNormalized.length > 0
    && firstNormalized === secondNormalized
  ) {
    return true;
  }

  if (
    firstSkeleton.length > 0
    && firstSkeleton === secondSkeleton
  ) {
    return true;
  }

  const minimumLength = Math.min(
    firstSkeleton.length,
    secondSkeleton.length,
  );

  if (minimumLength < SHORT_USERNAME_MINIMUM_LENGTH) {
    return false;
  }

  const maximumLength = Math.max(
    firstSkeleton.length,
    secondSkeleton.length,
  );

  const distance = calculateLevenshteinDistance(
    firstSkeleton,
    secondSkeleton,
  );

  const similarity = maximumLength === 0
    ? 1
    : 1 - distance / maximumLength;

  const maximumAllowedDistance = minimumLength >= 8 ? 2 : 1;

  return (
    distance <= maximumAllowedDistance
    && similarity >= USERNAME_SIMILARITY_THRESHOLD
  );
}

function validateName(value, fieldName, maximumLength) {
  if (value.length < 2 || value.length > maximumLength) {
    throw new Error(
      `${fieldName} debe tener entre 2 y ${maximumLength} caracteres.`,
    );
  }

  if (!/^[\p{L}\p{M}'’ -]+$/u.test(value)) {
    throw new Error(`${fieldName} contiene caracteres no permitidos.`);
  }

  if (/\s{2,}/u.test(value)) {
    throw new Error(`${fieldName} no puede contener espacios consecutivos.`);
  }
}

function validateUsername(username, normalized, skeleton) {
  if (username.length < 3 || username.length > 40) {
    throw new Error(
      "El nombre de usuario debe tener entre 3 y 40 caracteres.",
    );
  }

  if (!/^[\p{L}\p{N}._-]+$/u.test(username)) {
    throw new Error(
      "El nombre de usuario solo admite letras, números, puntos, guiones y guiones bajos.",
    );
  }

  if (normalized.length < 3 || normalized.length > 40) {
    throw new Error("El nombre de usuario normalizado no es válido.");
  }

  if (skeleton.length < 1 || skeleton.length > 40) {
    throw new Error(
      "La comparación de seguridad del nombre de usuario no es válida.",
    );
  }

  if (RESERVED_NORMALIZED_USERNAMES.has(normalized)) {
    throw new Error(
      "Ese nombre de usuario está reservado por seguridad. Elija uno más específico.",
    );
  }
}

function validateEmail(email) {
  if (
    email.length < 5
    || email.length > 320
    || containsForbiddenControlCharacters(email)
    || /\s/u.test(email)
  ) {
    throw new Error("El correo electrónico no tiene un formato válido.");
  }

  const separatorIndex = email.lastIndexOf("@");

  if (
    separatorIndex <= 0
    || separatorIndex > 64
    || separatorIndex === email.length - 1
  ) {
    throw new Error("El correo electrónico no tiene un formato válido.");
  }

  const localPart = email.slice(0, separatorIndex);
  const domain = email.slice(separatorIndex + 1);

  const localPartIsValid = /^[^<>(),:;\\"\[\]]+$/u.test(localPart);
  const domainIsValid = /^(?=.{1,255}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))+$/u.test(
    domain,
  );

  if (!localPartIsValid || !domainIsValid) {
    throw new Error("El correo electrónico no tiene un formato válido.");
  }
}

function validateAccessYears(rawValue) {
  if (typeof rawValue === "undefined") {
    return DEFAULT_ACCESS_YEARS;
  }

  const trimmedValue = rawValue.trim();

  if (!/^\d+$/u.test(trimmedValue)) {
    throw new Error(
      `--access-years debe ser un entero entre ${MINIMUM_ACCESS_YEARS} y ${MAXIMUM_ACCESS_YEARS}.`,
    );
  }

  const value = Number.parseInt(trimmedValue, 10);

  if (
    !Number.isSafeInteger(value)
    || value < MINIMUM_ACCESS_YEARS
    || value > MAXIMUM_ACCESS_YEARS
  ) {
    throw new Error(
      `--access-years debe ser un entero entre ${MINIMUM_ACCESS_YEARS} y ${MAXIMUM_ACCESS_YEARS}.`,
    );
  }

  return value;
}

function validatePassword(password) {
  if (
    password.length < PASSWORD_MINIMUM_LENGTH
    || password.length > PASSWORD_MAXIMUM_LENGTH
  ) {
    throw new Error(
      `La contraseña debe tener entre ${PASSWORD_MINIMUM_LENGTH} y ${PASSWORD_MAXIMUM_LENGTH} caracteres.`,
    );
  }

  if (/\s/u.test(password)) {
    throw new Error("La contraseña no puede contener espacios.");
  }

  const missingRequirements = [];

  if (!/[A-Z]/u.test(password)) {
    missingRequirements.push("una letra mayúscula");
  }

  if (!/[a-z]/u.test(password)) {
    missingRequirements.push("una letra minúscula");
  }

  if (!/\d/u.test(password)) {
    missingRequirements.push("un número");
  }

  if (!/[^\p{L}\p{N}\s]/u.test(password)) {
    missingRequirements.push("un símbolo");
  }

  if (missingRequirements.length > 0) {
    throw new Error(
      `La contraseña debe incluir ${missingRequirements.join(", ")}.`,
    );
  }
}

function derivePasswordKey(password, salt) {
  return new Promise((resolveKey, rejectKey) => {
    scrypt(
      password,
      salt,
      SCRYPT_KEY_LENGTH,
      {
        cost: SCRYPT_COST,
        blockSize: SCRYPT_BLOCK_SIZE,
        parallelization: SCRYPT_PARALLELIZATION,
        maxmem: SCRYPT_MAXIMUM_MEMORY,
      },
      (error, derivedKey) => {
        if (error) {
          rejectKey(error);
          return;
        }

        resolveKey(Buffer.from(derivedKey));
      },
    );
  });
}

async function hashPassword(password) {
  const salt = randomBytes(SCRYPT_SALT_LENGTH);
  const derivedKey = await derivePasswordKey(password, salt);

  return [
    "v1",
    "scrypt",
    String(SCRYPT_COST),
    String(SCRYPT_BLOCK_SIZE),
    String(SCRYPT_PARALLELIZATION),
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

async function readHiddenValue(promptText) {
  if (
    !process.stdin.isTTY
    || !process.stdout.isTTY
    || typeof process.stdin.setRawMode !== "function"
  ) {
    throw new Error(
      "No se puede solicitar la contraseña de forma oculta. Use una terminal interactiva.",
    );
  }

  readline.emitKeypressEvents(process.stdin);

  const previousRawMode = Boolean(process.stdin.isRaw);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdout.write(promptText);

  return new Promise((resolvePassword, rejectPassword) => {
    let value = "";
    let completed = false;

    const cleanup = () => {
      if (completed) {
        return;
      }

      completed = true;
      process.stdin.off("keypress", onKeypress);
      process.stdin.setRawMode(previousRawMode);
      process.stdin.pause();
    };

    const onKeypress = (character, key) => {
      if (key?.ctrl && key.name === "c") {
        cleanup();
        process.stdout.write("\n");
        rejectPassword(new Error("Operación cancelada."));
        return;
      }

      if (key?.name === "return" || key?.name === "enter") {
        cleanup();
        process.stdout.write("\n");
        resolvePassword(value);
        return;
      }

      if (key?.name === "backspace") {
        if (value.length > 0) {
          value = value.slice(0, -1);
          process.stdout.write("\b \b");
        }

        return;
      }

      if (
        typeof character === "string"
        && character.length > 0
        && !key?.ctrl
        && !key?.meta
        && value.length < PASSWORD_MAXIMUM_LENGTH
      ) {
        value += character;
        process.stdout.write("*");
      }
    };

    process.stdin.on("keypress", onKeypress);
  });
}

async function obtainPassword() {
  const environmentPassword = process.env.FIXORA_ADMIN_PASSWORD;

  if (typeof environmentPassword === "string") {
    delete process.env.FIXORA_ADMIN_PASSWORD;
    validatePassword(environmentPassword);
    return environmentPassword;
  }

  const password = await readHiddenValue("Contraseña administrativa: ");
  validatePassword(password);

  const confirmation = await readHiddenValue("Repita la contraseña: ");

  if (password !== confirmation) {
    throw new Error("Las contraseñas no coinciden.");
  }

  return password;
}

async function loadSqlServerLibrary() {
  try {
    const sqlModule = await import("mssql");

    return sqlModule.default ?? sqlModule;
  } catch {
    throw new Error(
      'No se encontró la dependencia "mssql". Ejecute "pnpm install" desde la raíz del proyecto.',
    );
  }
}

async function verifyRequiredSchema(pool) {
  const tableResult = await pool.request().query(`
    SELECT [name]
    FROM sys.tables
    WHERE
      schema_id = SCHEMA_ID(N'dbo')
      AND [name] IN (
        N'accounts',
        N'notifications',
        N'auth_audit_events'
      );
  `);

  const tables = new Set(
    tableResult.recordset.map((record) => String(record.name)),
  );

  const missingTables = [
    "accounts",
    "notifications",
    "auth_audit_events",
  ].filter((tableName) => !tables.has(tableName));

  if (missingTables.length > 0) {
    throw new Error(
      `Faltan tablas requeridas: ${missingTables
        .map((tableName) => `dbo.${tableName}`)
        .join(", ")}.`,
    );
  }

  const columnResult = await pool.request().query(`
    SELECT [name]
    FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.accounts');
  `);

  const columns = new Set(
    columnResult.recordset.map((record) => String(record.name)),
  );

  const missingColumns = REQUIRED_ACCOUNT_COLUMNS.filter(
    (columnName) => !columns.has(columnName),
  );

  if (missingColumns.length > 0) {
    throw new Error(
      `Faltan columnas en dbo.accounts: ${missingColumns.join(", ")}. Ejecute database/001_authentication_schema.sql y database/002_admin_access_expiration.sql.`,
    );
  }

  const integrityResult = await pool.request().query(`
    SELECT
      CASE WHEN EXISTS (
        SELECT 1
        FROM sys.check_constraints
        WHERE
          parent_object_id = OBJECT_ID(N'dbo.accounts')
          AND [name] = N'CK_accounts_access_window'
          AND is_disabled = 0
          AND is_not_trusted = 0
      ) THEN 1 ELSE 0 END AS access_constraint_ready,

      CASE WHEN EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE
          object_id = OBJECT_ID(N'dbo.accounts')
          AND [name] = N'UX_accounts_email_normalized'
          AND is_unique = 1
          AND is_disabled = 0
      ) THEN 1 ELSE 0 END AS email_index_ready,

      CASE WHEN EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE
          object_id = OBJECT_ID(N'dbo.accounts')
          AND [name] = N'UX_accounts_username_normalized'
          AND is_unique = 1
          AND is_disabled = 0
      ) THEN 1 ELSE 0 END AS username_index_ready,

      CASE WHEN EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE
          object_id = OBJECT_ID(N'dbo.accounts')
          AND [name] = N'UX_accounts_username_skeleton'
          AND is_unique = 1
          AND is_disabled = 0
      ) THEN 1 ELSE 0 END AS skeleton_index_ready,

      HAS_PERMS_BY_NAME(N'dbo.accounts', N'OBJECT', N'SELECT')
        AS accounts_select,
      HAS_PERMS_BY_NAME(N'dbo.accounts', N'OBJECT', N'INSERT')
        AS accounts_insert,
      HAS_PERMS_BY_NAME(N'dbo.notifications', N'OBJECT', N'INSERT')
        AS notifications_insert,
      HAS_PERMS_BY_NAME(N'dbo.auth_audit_events', N'OBJECT', N'INSERT')
        AS audit_insert,

      IS_ROLEMEMBER(N'db_owner') AS is_db_owner,
      IS_ROLEMEMBER(N'db_securityadmin') AS is_db_securityadmin,
      IS_ROLEMEMBER(N'db_accessadmin') AS is_db_accessadmin,
      IS_ROLEMEMBER(N'db_ddladmin') AS is_db_ddladmin,

      HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'CONTROL')
        AS has_database_control,
      HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'ALTER')
        AS has_database_alter,
      HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'ALTER ANY USER')
        AS has_alter_any_user,
      HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'CREATE TABLE')
        AS has_create_table,

      DB_NAME() AS database_name,
      SUSER_SNAME() AS login_name,
      USER_NAME() AS database_user;
  `);

  const integrity = integrityResult.recordset[0];

  if (!integrity) {
    throw new Error("SQL Server no devolvió la validación del esquema.");
  }

  const missingSecurityObjects = [];

  if (Number(integrity.access_constraint_ready) !== 1) {
    missingSecurityObjects.push("CK_accounts_access_window");
  }

  if (Number(integrity.email_index_ready) !== 1) {
    missingSecurityObjects.push("UX_accounts_email_normalized");
  }

  if (Number(integrity.username_index_ready) !== 1) {
    missingSecurityObjects.push("UX_accounts_username_normalized");
  }

  if (Number(integrity.skeleton_index_ready) !== 1) {
    missingSecurityObjects.push("UX_accounts_username_skeleton");
  }

  if (missingSecurityObjects.length > 0) {
    throw new Error(
      `Faltan objetos de integridad: ${missingSecurityObjects.join(", ")}.`,
    );
  }

  const missingPermissions = [
    ["SELECT sobre dbo.accounts", integrity.accounts_select],
    ["INSERT sobre dbo.accounts", integrity.accounts_insert],
    ["INSERT sobre dbo.notifications", integrity.notifications_insert],
    ["INSERT sobre dbo.auth_audit_events", integrity.audit_insert],
  ]
    .filter(([, granted]) => Number(granted) !== 1)
    .map(([permissionName]) => permissionName);

  if (missingPermissions.length > 0) {
    throw new Error(
      `Faltan permisos para aprovisionar: ${missingPermissions.join(", ")}.`,
    );
  }

  const unsafeRoles = [
    ["db_owner", integrity.is_db_owner],
    ["db_securityadmin", integrity.is_db_securityadmin],
    ["db_accessadmin", integrity.is_db_accessadmin],
    ["db_ddladmin", integrity.is_db_ddladmin],
  ]
    .filter(([, member]) => Number(member) === 1)
    .map(([roleName]) => roleName);

  if (unsafeRoles.length > 0) {
    throw new Error(
      `El usuario SQL de la aplicación pertenece a roles administrativos no permitidos: ${unsafeRoles.join(", ")}.`,
    );
  }

  const dangerousPermissions = [
    ["CONTROL DATABASE", integrity.has_database_control],
    ["ALTER DATABASE", integrity.has_database_alter],
    ["ALTER ANY USER", integrity.has_alter_any_user],
    ["CREATE TABLE", integrity.has_create_table],
  ]
    .filter(([, granted]) => Number(granted) === 1)
    .map(([permissionName]) => permissionName);

  if (dangerousPermissions.length > 0) {
    throw new Error(
      `El usuario SQL de la aplicación tiene permisos administrativos no permitidos: ${dangerousPermissions.join(", ")}.`,
    );
  }

  return {
    databaseName: integrity.database_name,
    loginName: integrity.login_name,
    databaseUser: integrity.database_user,
  };
}

async function readUsernameCandidates(
  sql,
  transaction,
  administrator,
) {
  const skeletonPrefix = administrator.usernameSkeleton.slice(
    0,
    Math.min(3, administrator.usernameSkeleton.length),
  );

  const result = await new sql.Request(transaction)
    .input(
      "emailNormalized",
      sql.NVarChar(320),
      administrator.emailNormalized,
    )
    .input(
      "usernameNormalized",
      sql.NVarChar(40),
      administrator.usernameNormalized,
    )
    .input(
      "usernameSkeleton",
      sql.NVarChar(40),
      administrator.usernameSkeleton,
    )
    .input(
      "skeletonPrefix",
      sql.NVarChar(3),
      skeletonPrefix,
    )
    .query(`
      SELECT TOP (1000)
        account_id,
        email_normalized,
        username,
        username_normalized,
        username_skeleton
      FROM dbo.accounts WITH (UPDLOCK, HOLDLOCK)
      WHERE
        email_normalized = @emailNormalized
        OR username_normalized = @usernameNormalized
        OR username_skeleton = @usernameSkeleton
        OR (
          @skeletonPrefix <> N''
          AND LEFT(username_skeleton, LEN(@skeletonPrefix))
            = @skeletonPrefix
        )
      ORDER BY created_at ASC;
    `);

  return result.recordset;
}

function validateAccountConflicts(administrator, existingAccounts) {
  for (const existingAccount of existingAccounts) {
    if (
      String(existingAccount.email_normalized).toLowerCase()
      === administrator.emailNormalized
    ) {
      throw new Error(
        "Ya existe una cuenta con ese correo. No se modificó la cuenta existente.",
      );
    }

    if (
      areUsernamesConfusinglySimilar(
        administrator.username,
        String(existingAccount.username),
      )
    ) {
      throw new Error(
        `El nombre de usuario es igual o demasiado parecido a una cuenta existente: ${existingAccount.username}.`,
      );
    }
  }
}

async function createAdministrator(sql, pool, administrator) {
  const transaction = new sql.Transaction(pool);
  let transactionStarted = false;

  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    transactionStarted = true;

    await new sql.Request(transaction).query("SET XACT_ABORT ON;");

    const existingAccounts = await readUsernameCandidates(
      sql,
      transaction,
      administrator,
    );

    validateAccountConflicts(administrator, existingAccounts);

    const accountId = randomUUID();

    const accountResult = await new sql.Request(transaction)
      .input("accountId", sql.UniqueIdentifier, accountId)
      .input("firstNames", sql.NVarChar(100), administrator.firstNames)
      .input("lastNames", sql.NVarChar(150), administrator.lastNames)
      .input("username", sql.NVarChar(40), administrator.username)
      .input(
        "usernameNormalized",
        sql.NVarChar(40),
        administrator.usernameNormalized,
      )
      .input(
        "usernameSkeleton",
        sql.NVarChar(40),
        administrator.usernameSkeleton,
      )
      .input("email", sql.NVarChar(320), administrator.email)
      .input(
        "emailNormalized",
        sql.NVarChar(320),
        administrator.emailNormalized,
      )
      .input("passwordHash", sql.VarChar(512), administrator.passwordHash)
      .input("accessYears", sql.Int, administrator.accessYears)
      .query(`
        DECLARE @createdAt DATETIME2(7) = SYSUTCDATETIME();
        DECLARE @accessExpiresAt DATETIME2(7) =
          DATEADD(YEAR, @accessYears, @createdAt);

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
          last_sign_in_at,
          created_at,
          updated_at
        )
        OUTPUT
          inserted.account_id,
          inserted.role,
          inserted.status,
          inserted.username,
          inserted.email,
          inserted.email_verified_at,
          inserted.access_started_at,
          inserted.access_expires_at,
          inserted.created_at
        VALUES (
          @accountId,
          'ADMIN',
          'ACTIVE',
          @firstNames,
          @lastNames,
          @username,
          @usernameNormalized,
          @usernameSkeleton,
          @email,
          @emailNormalized,
          @passwordHash,
          @createdAt,
          @createdAt,
          @accessExpiresAt,
          0,
          NULL,
          NULL,
          @createdAt,
          @createdAt
        );
      `);

    const createdAccount = accountResult.recordset[0];

    if (!createdAccount) {
      throw new Error(
        "SQL Server no devolvió la cuenta administrativa creada.",
      );
    }

    const notificationMetadata = JSON.stringify({
      source: "provision-admin-script",
      accessYears: administrator.accessYears,
      accessStartedAt: createdAccount.access_started_at.toISOString(),
      accessExpiresAt: createdAccount.access_expires_at.toISOString(),
    });

    await new sql.Request(transaction)
      .input("notificationId", sql.UniqueIdentifier, randomUUID())
      .input(
        "accountId",
        sql.UniqueIdentifier,
        createdAccount.account_id,
      )
      .input("metadataJson", sql.NVarChar(sql.MAX), notificationMetadata)
      .input("createdAt", sql.DateTime2, createdAccount.created_at)
      .query(`
        INSERT INTO dbo.notifications (
          notification_id,
          account_id,
          notification_type,
          title_key,
          message_key,
          metadata_json,
          created_at,
          read_at
        )
        VALUES (
          @notificationId,
          @accountId,
          'ADMIN_ACCOUNT_ACTIVATED',
          N'auth.notifications.adminActivated.title',
          N'auth.notifications.adminActivated.message',
          @metadataJson,
          @createdAt,
          NULL
        );
      `);

    const auditMetadata = JSON.stringify({
      source: "provision-admin-script",
      accessYears: administrator.accessYears,
      accessStartedAt: createdAccount.access_started_at.toISOString(),
      accessExpiresAt: createdAccount.access_expires_at.toISOString(),
    });

    await new sql.Request(transaction)
      .input("auditEventId", sql.UniqueIdentifier, randomUUID())
      .input(
        "accountId",
        sql.UniqueIdentifier,
        createdAccount.account_id,
      )
      .input("metadataJson", sql.NVarChar(sql.MAX), auditMetadata)
      .input("createdAt", sql.DateTime2, createdAccount.created_at)
      .query(`
        INSERT INTO dbo.auth_audit_events (
          audit_event_id,
          account_id,
          event_type,
          successful,
          ip_address,
          user_agent,
          metadata_json,
          created_at
        )
        VALUES (
          @auditEventId,
          @accountId,
          'ADMIN_ACCOUNT_PROVISIONED',
          1,
          NULL,
          N'Fixora provision-admin.mjs',
          @metadataJson,
          @createdAt
        );
      `);

    await transaction.commit();
    transactionStarted = false;

    return createdAccount;
  } catch (error) {
    if (transactionStarted) {
      try {
        await transaction.rollback();
      } catch {
        // SQL Server pudo haber revertido automáticamente con XACT_ABORT.
      }
    }

    throw error;
  }
}

function getSqlErrorNumber(error) {
  if (
    error
    && typeof error === "object"
    && "number" in error
    && Number.isInteger(error.number)
  ) {
    return error.number;
  }

  return null;
}

function createSafeProvisioningError(error) {
  const errorNumber = getSqlErrorNumber(error);

  if (errorNumber === 2601 || errorNumber === 2627) {
    return new Error(
      "Otra operación registró el mismo correo o nombre de usuario. No se creó ninguna cuenta.",
    );
  }

  if (errorNumber === 547) {
    return new Error(
      "La base de datos rechazó la cuenta por una restricción de integridad. Compruebe las migraciones 001 y 002.",
    );
  }

  return error instanceof Error
    ? error
    : new Error(String(error));
}

async function main() {
  if (!existsSync(resolve(PROJECT_ROOT, "package.json"))) {
    throw new Error(
      "Ejecute este script desde la raíz de Fixora, donde está package.json.",
    );
  }

  const argumentsObject = parseArguments(process.argv.slice(2));

  if (argumentsObject.help) {
    printHelp();
    return;
  }

  loadEnvironmentFile(".env", false);
  loadEnvironmentFile(".env.local", true);

  const firstNames = requireArgument(argumentsObject, "first-names");
  const lastNames = requireArgument(argumentsObject, "last-names");
  const username = requireArgument(argumentsObject, "username");
  const email = normalizeEmail(
    requireArgument(argumentsObject, "email"),
  );

  const accessYears = validateAccessYears(
    argumentsObject["access-years"],
  );

  const usernameNormalized = normalizeUsername(username);
  const usernameSkeleton = createUsernameSkeleton(username);

  validateName(firstNames, "Los nombres", 100);
  validateName(lastNames, "Los apellidos", 150);
  validateUsername(username, usernameNormalized, usernameSkeleton);
  validateEmail(email);

  let password = await obtainPassword();
  let passwordHash;

  try {
    passwordHash = await hashPassword(password);
  } finally {
    password = "";
    delete process.env.FIXORA_ADMIN_PASSWORD;
  }

  const administrator = {
    firstNames,
    lastNames,
    username,
    usernameNormalized,
    usernameSkeleton,
    email,
    emailNormalized: email,
    accessYears,
    passwordHash,
  };

  const configuration = buildSqlConfiguration();
  const sql = await loadSqlServerLibrary();

  let pool;

  try {
    pool = await new sql.ConnectionPool(configuration).connect();

    const connectionIdentity = await verifyRequiredSchema(pool);

    const createdAccount = await createAdministrator(
      sql,
      pool,
      administrator,
    );

    console.log("\nAdministrador creado correctamente.");
    console.log("--------------------------------");
    console.log(`ID: ${createdAccount.account_id}`);
    console.log(`Nombre de usuario: ${createdAccount.username}`);
    console.log(`Correo: ${createdAccount.email}`);
    console.log(`Rol: ${createdAccount.role}`);
    console.log(`Estado: ${createdAccount.status}`);
    console.log(
      `Correo verificado: ${createdAccount.email_verified_at.toISOString()}`,
    );
    console.log(
      `Acceso iniciado: ${createdAccount.access_started_at.toISOString()}`,
    );
    console.log(
      `Acceso vence: ${createdAccount.access_expires_at.toISOString()}`,
    );
    console.log(`Base de datos: ${connectionIdentity.databaseName}`);
    console.log(`Login SQL: ${connectionIdentity.loginName}`);
    console.log(`Usuario de base: ${connectionIdentity.databaseUser}`);
  } catch (error) {
    throw createSafeProvisioningError(error);
  } finally {
    administrator.passwordHash = "";
    configuration.password = "";
    delete process.env.SQL_SERVER_PASSWORD;
    delete process.env.FIXORA_ADMIN_PASSWORD;

    if (pool) {
      try {
        await pool.close();
      } catch {
        console.warn("No se pudo cerrar limpiamente el pool de SQL Server.");
      }
    }
  }
}

main().catch((error) => {
  console.error(
    `\nNo se pudo crear el administrador: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );

  process.exitCode = 1;
});
