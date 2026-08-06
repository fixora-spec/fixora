import "server-only";

import {
  USERNAME_RULES,
  VERIFICATION_CODE_RULES,
} from "@/config/auth.config";

import type {
  Locale,
} from "@/types/locale";

export type EmailTemplate = {
  subject: string;
  text: string;
  html: string;
};

export type VerificationEmailTemplateInput = {
  locale: Locale;
  username: string;
  code: string;
  expiresInMinutes: number;
};

export type PasswordResetEmailTemplateInput = {
  locale: Locale;
  username: string;
  code: string;
  expiresInMinutes: number;
};

export type AdminActivationEmailTemplateInput = {
  locale: Locale;
  username: string;
  code: string;
  expiresInMinutes: number;
};

type TemplateContent = {
  subject: string;
  title: string;
  greeting: string;
  explanation: string;
  expirationMessage: string;
  securityMessage: string;
};

type CommonTemplateInput = {
  locale: Locale;
  username: string;
  code: string;
  expiresInMinutes: number;
};

const MAXIMUM_EMAIL_SUBJECT_LENGTH = 200;
const FORBIDDEN_TEXT_CHARACTERS = /[\0\u202A-\u202E\u2066-\u2069]/u;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function validateLocale(locale: Locale): Locale {
  if (locale !== "es" && locale !== "en") {
    throw new Error(
      "El idioma de la plantilla de correo no es válido.",
    );
  }

  return locale;
}

function validateUsername(username: string): string {
  const normalizedUsername = username
    .trim()
    .normalize("NFC");

  if (
    normalizedUsername.length < USERNAME_RULES.minimumLength
    || normalizedUsername.length > USERNAME_RULES.maximumLength
    || FORBIDDEN_TEXT_CHARACTERS.test(normalizedUsername)
    || /[\r\n]/u.test(normalizedUsername)
    || !USERNAME_RULES.allowedPattern.test(normalizedUsername)
  ) {
    throw new Error(
      "El nombre de usuario del correo no es válido.",
    );
  }

  return normalizedUsername;
}

function validateVerificationCode(code: string): string {
  const normalizedCode = code
    .trim()
    .toUpperCase();

  if (
    normalizedCode.length !== VERIFICATION_CODE_RULES.length
    || !VERIFICATION_CODE_RULES.formatPattern.test(normalizedCode)
  ) {
    throw new Error(
      `El código de verificación debe contener exactamente ${VERIFICATION_CODE_RULES.length} letras mayúsculas o números.`,
    );
  }

  return normalizedCode;
}

function validateExpirationMinutes(expiresInMinutes: number): number {
  if (
    !Number.isSafeInteger(expiresInMinutes)
    || expiresInMinutes < 1
    || expiresInMinutes > 60
  ) {
    throw new Error(
      "El tiempo de vencimiento del código no es válido.",
    );
  }

  return expiresInMinutes;
}

function validateSubject(subject: string): string {
  const normalizedSubject = subject.trim();

  if (
    normalizedSubject.length === 0
    || normalizedSubject.length > MAXIMUM_EMAIL_SUBJECT_LENGTH
    || /[\r\n\0]/u.test(normalizedSubject)
  ) {
    throw new Error(
      "El asunto de la plantilla de correo no es válido.",
    );
  }

  return normalizedSubject;
}

function createEmailText(
  content: TemplateContent,
  code: string,
): string {
  return [
    content.greeting,
    "",
    content.explanation,
    "",
    code,
    "",
    content.expirationMessage,
    content.securityMessage,
    "",
    "Fixora",
  ].join("\n");
}

function createEmailHtml(
  locale: Locale,
  content: TemplateContent,
  code: string,
): string {
  return [
    "<!doctype html>",
    `<html lang="${escapeHtml(locale)}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(content.subject)}</title>`,
    "</head>",
    "<body>",
    "<main>",
    `<h1>${escapeHtml(content.title)}</h1>`,
    `<p>${escapeHtml(content.greeting)}</p>`,
    `<p>${escapeHtml(content.explanation)}</p>`,
    `<p><strong><code>${escapeHtml(code)}</code></strong></p>`,
    `<p>${escapeHtml(content.expirationMessage)}</p>`,
    `<p>${escapeHtml(content.securityMessage)}</p>`,
    "<p>Fixora</p>",
    "</main>",
    "</body>",
    "</html>",
  ].join("");
}

function createTemplate(
  input: CommonTemplateInput,
  resolveContent: (
    locale: Locale,
    username: string,
    expiresInMinutes: number,
  ) => TemplateContent,
): EmailTemplate {
  const locale = validateLocale(input.locale);
  const username = validateUsername(input.username);
  const code = validateVerificationCode(input.code);
  const expiresInMinutes = validateExpirationMinutes(
    input.expiresInMinutes,
  );

  const content = resolveContent(
    locale,
    username,
    expiresInMinutes,
  );

  const subject = validateSubject(content.subject);

  return {
    subject,
    text: createEmailText(
      {
        ...content,
        subject,
      },
      code,
    ),
    html: createEmailHtml(
      locale,
      {
        ...content,
        subject,
      },
      code,
    ),
  };
}

function resolveVerificationContent(
  locale: Locale,
  username: string,
  expiresInMinutes: number,
): TemplateContent {
  if (locale === "en") {
    return {
      subject: "Verify your Fixora account",
      title: "Verify your Fixora account",
      greeting: `Hello ${username}.`,
      explanation:
        "Enter the following code to verify your email address and activate your account.",
      expirationMessage:
        `This code expires in ${expiresInMinutes} minutes.`,
      securityMessage:
        "Do not share this code with anyone. Fixora will never ask for it through the assistant.",
    };
  }

  return {
    subject: "Verifica tu cuenta de Fixora",
    title: "Verifica tu cuenta de Fixora",
    greeting: `Hola ${username}.`,
    explanation:
      "Introduce el siguiente código para verificar tu correo electrónico y activar tu cuenta.",
    expirationMessage:
      `Este código vence en ${expiresInMinutes} minutos.`,
    securityMessage:
      "No compartas este código con nadie. Fixora nunca lo solicitará mediante el asistente.",
  };
}

function resolvePasswordResetContent(
  locale: Locale,
  username: string,
  expiresInMinutes: number,
): TemplateContent {
  if (locale === "en") {
    return {
      subject: "Reset your Fixora password",
      title: "Reset your Fixora password",
      greeting: `Hello ${username}.`,
      explanation:
        "Use the following code to continue with your password reset.",
      expirationMessage:
        `This code expires in ${expiresInMinutes} minutes.`,
      securityMessage:
        "If you did not request this change, ignore this message and do not share the code.",
    };
  }

  return {
    subject: "Restablece tu contraseña de Fixora",
    title: "Restablece tu contraseña de Fixora",
    greeting: `Hola ${username}.`,
    explanation:
      "Utiliza el siguiente código para continuar con el restablecimiento de tu contraseña.",
    expirationMessage:
      `Este código vence en ${expiresInMinutes} minutos.`,
    securityMessage:
      "Si no solicitaste este cambio, ignora este mensaje y no compartas el código.",
  };
}

function resolveAdminActivationContent(
  locale: Locale,
  username: string,
  expiresInMinutes: number,
): TemplateContent {
  if (locale === "en") {
    return {
      subject: "Activate your Fixora administrator account",
      title: "Activate your Fixora administrator account",
      greeting: `Hello ${username}.`,
      explanation:
        "The company created an administrator account for you. Use this code to verify your email address.",
      expirationMessage:
        `This code expires in ${expiresInMinutes} minutes.`,
      securityMessage:
        "Do not share this code or your administrator credentials with anyone.",
    };
  }

  return {
    subject: "Activa tu cuenta administrativa de Fixora",
    title: "Activa tu cuenta administrativa de Fixora",
    greeting: `Hola ${username}.`,
    explanation:
      "La empresa creó una cuenta administrativa para ti. Utiliza este código para verificar tu correo electrónico.",
    expirationMessage:
      `Este código vence en ${expiresInMinutes} minutos.`,
    securityMessage:
      "No compartas este código ni tus credenciales administrativas con ninguna persona.",
  };
}

export function createEmailVerificationTemplate(
  input: VerificationEmailTemplateInput,
): EmailTemplate {
  return createTemplate(
    input,
    resolveVerificationContent,
  );
}

export function createPasswordResetTemplate(
  input: PasswordResetEmailTemplateInput,
): EmailTemplate {
  return createTemplate(
    input,
    resolvePasswordResetContent,
  );
}

export function createAdminActivationTemplate(
  input: AdminActivationEmailTemplateInput,
): EmailTemplate {
  return createTemplate(
    input,
    resolveAdminActivationContent,
  );
}