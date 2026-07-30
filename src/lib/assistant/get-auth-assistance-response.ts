import {
  detectAuthAssistantIntent,
} from "./detect-auth-assistant-intent";

import type {
  AuthAssistantIntent,
  AuthAssistantIntentConfidence,
} from "./detect-auth-assistant-intent";

import {
  generateSecurePasswords,
  isSecurePasswordLength,
  MAXIMUM_SECURE_PASSWORD_LENGTH,
  MINIMUM_SECURE_PASSWORD_LENGTH,
} from "./generate-secure-passwords";

import type {
  Locale,
} from "@/types/locale";

export type AuthAssistanceAction =
  | "NONE"
  | "ASK_PASSWORD_LENGTH"
  | "SHOW_GENERATED_PASSWORDS"
  | "OPEN_USER_SIGN_IN"
  | "OPEN_USER_REGISTRATION"
  | "OPEN_EMAIL_VERIFICATION"
  | "OPEN_PASSWORD_RECOVERY"
  | "OPEN_PASSWORD_RESET"
  | "OPEN_ADMIN_SIGN_IN"
  | "CHECK_USERNAME_AVAILABILITY"
  | "REQUEST_USERNAME_FOR_SUGGESTIONS";

export type AuthAssistanceResponse = {
  intent:
    AuthAssistantIntent;

  confidence:
    AuthAssistantIntentConfidence;

  action:
    AuthAssistanceAction;

  message:
    string;

  requiresUserInput:
    boolean;

  passwords?:
    readonly string[];

  passwordLength?:
    number;

  normalizedMessage:
    string;
};

export type GetAuthAssistanceResponseInput = {
  message:
    string;

  locale?:
    Locale;
};

type LocalizedResponseContent = {
  message:
    string;

  action:
    AuthAssistanceAction;

  requiresUserInput?:
    boolean;
};

function resolveLocale(
  locale:
    Locale
    | undefined,
): Locale {
  return locale === "en"
    ? "en"
    : "es";
}

function extractRequestedPasswordLength(
  normalizedMessage:
    string,
): number | null {
  const explicitLengthPatterns:
    readonly RegExp[] = [
      /\b(?:longitud|largo|de)\s+(\d{1,2})\s*(?:caracteres?)?\b/u,
      /\b(\d{1,2})\s+caracteres?\b/u,
      /\b(?:length|of)\s+(\d{1,2})\s*(?:characters?)?\b/u,
      /\b(\d{1,2})\s+characters?\b/u,
    ];

  for (
    const pattern
    of explicitLengthPatterns
  ) {
    const match =
      pattern.exec(
        normalizedMessage,
      );

    const capturedValue =
      match?.[1];

    if (
      capturedValue
        === undefined
    ) {
      continue;
    }

    const parsedValue =
      Number.parseInt(
        capturedValue,
        10,
      );

    if (
      Number.isInteger(
        parsedValue,
      )
    ) {
      return parsedValue;
    }
  }

  const numericValues =
    normalizedMessage
      .match(
        /\b\d{1,2}\b/gu,
      )
      ?.map(
        (
          value,
        ) =>
          Number.parseInt(
            value,
            10,
          ),
      )
      ?? [];

  const validLength =
    numericValues.find(
      (
        value,
      ) =>
        isSecurePasswordLength(
          value,
        ),
    );

  return validLength
    ?? null;
}

function getPasswordLengthRequest(
  locale:
    Locale,
): string {
  if (
    locale === "en"
  ) {
    return `Tell me the desired password length, from ${MINIMUM_SECURE_PASSWORD_LENGTH} to ${MAXIMUM_SECURE_PASSWORD_LENGTH} characters. I will generate exactly five secure passwords locally and will not store them.`;
  }

  return `Indícame la longitud que deseas, entre ${MINIMUM_SECURE_PASSWORD_LENGTH} y ${MAXIMUM_SECURE_PASSWORD_LENGTH} caracteres. Generaré exactamente cinco contraseñas seguras localmente y no las almacenaré.`;
}

function getInvalidPasswordLengthResponse(
  locale:
    Locale,
): string {
  if (
    locale === "en"
  ) {
    return `The password length must be an integer from ${MINIMUM_SECURE_PASSWORD_LENGTH} to ${MAXIMUM_SECURE_PASSWORD_LENGTH} characters.`;
  }

  return `La longitud de la contraseña debe ser un número entero entre ${MINIMUM_SECURE_PASSWORD_LENGTH} y ${MAXIMUM_SECURE_PASSWORD_LENGTH} caracteres.`;
}

function getGeneratedPasswordMessage(
  locale:
    Locale,
  passwordLength:
    number,
): string {
  if (
    locale === "en"
  ) {
    return `I generated five secure passwords with ${passwordLength} characters. Use the copy control instead of typing them manually. I do not store or reserve them.`;
  }

  return `Generé cinco contraseñas seguras de ${passwordLength} caracteres. Usa el control para copiar en lugar de escribirlas manualmente. No las almaceno ni las reservo.`;
}

function getLocalizedIntentResponse(
  intent:
    AuthAssistantIntent,
  locale:
    Locale,
): LocalizedResponseContent {
  const english =
    locale === "en";

  switch (
    intent
  ) {
    case "CHECK_USERNAME_AVAILABILITY":
      return {
        action:
          "CHECK_USERNAME_AVAILABILITY",

        requiresUserInput:
          true,

        message:
          english
            ? "Enter the exact public username you want to check. I can help verify its availability, but I cannot reserve or register it."
            : "Escribe el nombre de usuario público exacto que deseas comprobar. Puedo ayudarte a verificar su disponibilidad, pero no puedo reservarlo ni registrarlo.",
      };

    case "SUGGEST_USERNAMES":
      return {
        action:
          "REQUEST_USERNAME_FOR_SUGGESTIONS",

        requiresUserInput:
          true,

        message:
          english
            ? "Enter the name or alias you want to use as a base. I can suggest alternatives and check them, but I cannot reserve them."
            : "Escribe el nombre o alias que deseas usar como base. Puedo sugerir alternativas y comprobarlas, pero no puedo reservarlas.",
      };

    case "USER_SIGN_IN_HELP":
      return {
        action:
          "OPEN_USER_SIGN_IN",

        message:
          english
            ? "Open user sign-in and enter your verified email and password. Only verified accounts can sign in. I can guide you, but I cannot enter credentials or sign in for you."
            : "Abre el acceso de usuario e ingresa tu correo verificado y contraseña. Solo las cuentas verificadas pueden iniciar sesión. Puedo orientarte, pero no ingresar credenciales ni iniciar sesión por ti.",
      };

    case "USER_REGISTRATION_HELP":
      return {
        action:
          "OPEN_USER_REGISTRATION",

        message:
          english
            ? "Open registration and complete your first names, last names, unique public username, real email, strong password and password confirmation. You must then verify the email with the six-character code."
            : "Abre el registro y completa nombres, apellidos, nombre de usuario público único, correo real, contraseña segura y confirmación. Después debes verificar el correo con el código de seis caracteres.",
      };

    case "EMAIL_VERIFICATION_HELP":
      return {
        action:
          "OPEN_EMAIL_VERIFICATION",

        message:
          english
            ? "Enter the six-character uppercase alphanumeric code sent to your email. The code expires, can be used once and has attempt and resend limits."
            : "Ingresa el código alfanumérico de seis caracteres enviado a tu correo. El código vence, solo puede utilizarse una vez y tiene límites de intentos y reenvíos.",
      };

    case "PASSWORD_RECOVERY_HELP":
      return {
        action:
          "OPEN_PASSWORD_RECOVERY",

        message:
          english
            ? "Open password recovery, enter the real email associated with the account and verify the six-character recovery code. I cannot read your email or complete the recovery for you."
            : "Abre la recuperación de contraseña, ingresa el correo real asociado a la cuenta y verifica el código de recuperación de seis caracteres. No puedo leer tu correo ni completar la recuperación por ti.",
      };

    case "PASSWORD_RESET_HELP":
      return {
        action:
          "OPEN_PASSWORD_RESET",

        message:
          english
            ? "After verifying the recovery code, create a new strong password and repeat it exactly. The previous password will no longer be valid after the reset."
            : "Después de verificar el código de recuperación, crea una nueva contraseña segura y repítela exactamente. La contraseña anterior dejará de ser válida tras el cambio.",
      };

    case "ADMIN_ACCESS_HELP":
      return {
        action:
          "OPEN_ADMIN_SIGN_IN",

        message:
          english
            ? "Administrator accounts are provisioned by the company and cannot be created through public registration. Use the discreet administrator access with the real email assigned to the account."
            : "Las cuentas administradoras son provisionadas por la empresa y no pueden crearse desde el registro público. Usa el acceso discreto de administrador con el correo real asignado a la cuenta.",
      };

    case "ACCOUNT_ACTION_REQUEST":
      return {
        action:
          "NONE",

        message:
          english
            ? "I cannot register accounts, reserve usernames, enter credentials, verify email, change passwords or sign in on your behalf. I can guide you through the corresponding secure form."
            : "No puedo registrar cuentas, reservar nombres de usuario, ingresar credenciales, verificar correos, cambiar contraseñas ni iniciar sesión en tu nombre. Puedo guiarte mediante el formulario seguro correspondiente.",
      };

    case "GENERAL_AUTH_HELP":
      return {
        action:
          "NONE",

        message:
          english
            ? "I can explain user registration, email verification, sign-in, password recovery, password reset, administrator access, username availability and secure password generation."
            : "Puedo explicar el registro de usuario, verificación de correo, inicio de sesión, recuperación y cambio de contraseña, acceso administrativo, disponibilidad de nombres de usuario y generación segura de contraseñas.",
      };

    case "UNKNOWN":
    default:
      return {
        action:
          "NONE",

        message:
          english
            ? "Describe the account or authentication issue you need help with. Do not send passwords, verification codes or other private credentials."
            : "Describe el problema de cuenta o autenticación con el que necesitas ayuda. No envíes contraseñas, códigos de verificación ni otras credenciales privadas.",
      };
  }
}

export function getAuthAssistanceResponse({
  message,
  locale,
}: GetAuthAssistanceResponseInput): AuthAssistanceResponse {
  const resolvedLocale =
    resolveLocale(
      locale,
    );

  const detection =
    detectAuthAssistantIntent({
      message,
      locale:
        resolvedLocale,
    });

  if (
    detection.intent
    === "GENERATE_PASSWORDS"
  ) {
    const requestedLength =
      extractRequestedPasswordLength(
        detection.normalizedMessage,
      );

    if (
      requestedLength
        === null
    ) {
      return {
        intent:
          detection.intent,

        confidence:
          detection.confidence,

        action:
          "ASK_PASSWORD_LENGTH",

        message:
          getPasswordLengthRequest(
            resolvedLocale,
          ),

        requiresUserInput:
          true,

        normalizedMessage:
          detection.normalizedMessage,
      };
    }

    if (
      !isSecurePasswordLength(
        requestedLength,
      )
    ) {
      return {
        intent:
          detection.intent,

        confidence:
          detection.confidence,

        action:
          "ASK_PASSWORD_LENGTH",

        message:
          getInvalidPasswordLengthResponse(
            resolvedLocale,
          ),

        requiresUserInput:
          true,

        normalizedMessage:
          detection.normalizedMessage,
      };
    }

    const generatedResult =
      generateSecurePasswords(
        requestedLength,
      );

    return {
      intent:
        detection.intent,

      confidence:
        detection.confidence,

      action:
        "SHOW_GENERATED_PASSWORDS",

      message:
        getGeneratedPasswordMessage(
          resolvedLocale,
          generatedResult.passwordLength,
        ),

      requiresUserInput:
        false,

      passwords:
        generatedResult.passwords,

      passwordLength:
        generatedResult.passwordLength,

      normalizedMessage:
        detection.normalizedMessage,
    };
  }

  const localizedResponse =
    getLocalizedIntentResponse(
      detection.intent,
      resolvedLocale,
    );

  return {
    intent:
      detection.intent,

    confidence:
      detection.confidence,

    action:
      localizedResponse.action,

    message:
      localizedResponse.message,

    requiresUserInput:
      localizedResponse
        .requiresUserInput
      ?? false,

    normalizedMessage:
      detection.normalizedMessage,
  };
}