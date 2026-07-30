import "server-only";

import {
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

function escapeHtml(
  value: string,
): string {
  return value
    .replaceAll(
      "&",
      "&amp;",
    )
    .replaceAll(
      "<",
      "&lt;",
    )
    .replaceAll(
      ">",
      "&gt;",
    )
    .replaceAll(
      '"',
      "&quot;",
    )
    .replaceAll(
      "'",
      "&#039;",
    );
}

function validateUsername(
  username: string,
): string {
  const normalizedUsername =
    username.trim();

  if (
    normalizedUsername.length < 3
    || normalizedUsername.length > 40
  ) {
    throw new Error(
      "El nombre de pila del correo no es válido.",
    );
  }

  return normalizedUsername;
}

function validateVerificationCode(
  code: string,
): string {
  const normalizedCode =
    code
      .trim()
      .toUpperCase();

  if (
    !VERIFICATION_CODE_RULES
      .formatPattern
      .test(normalizedCode)
  ) {
    throw new Error(
      "El código de verificación debe contener exactamente 6 letras mayúsculas o números.",
    );
  }

  return normalizedCode;
}

function validateExpirationMinutes(
  expiresInMinutes: number,
): number {
  if (
    !Number.isSafeInteger(
      expiresInMinutes,
    )
    || expiresInMinutes < 1
    || expiresInMinutes > 60
  ) {
    throw new Error(
      "El tiempo de vencimiento del código no es válido.",
    );
  }

  return expiresInMinutes;
}

function createEmailHtml(
  title: string,
  greeting: string,
  explanation: string,
  code: string,
  expirationMessage: string,
  securityMessage: string,
): string {
  return [
    "<main>",
    `<h1>${escapeHtml(title)}</h1>`,
    `<p>${escapeHtml(greeting)}</p>`,
    `<p>${escapeHtml(explanation)}</p>`,
    `<p><strong>${escapeHtml(code)}</strong></p>`,
    `<p>${escapeHtml(expirationMessage)}</p>`,
    `<p>${escapeHtml(securityMessage)}</p>`,
    "<p>Fixora</p>",
    "</main>",
  ].join("");
}

export function createEmailVerificationTemplate(
  input: VerificationEmailTemplateInput,
): EmailTemplate {
  const username =
    validateUsername(
      input.username,
    );

  const code =
    validateVerificationCode(
      input.code,
    );

  const expiresInMinutes =
    validateExpirationMinutes(
      input.expiresInMinutes,
    );

  if (input.locale === "en") {
    const title =
      "Verify your Fixora account";

    const greeting =
      `Hello ${username}.`;

    const explanation =
      "Enter the following code to verify your email address and activate your account.";

    const expirationMessage =
      `This code expires in ${expiresInMinutes} minutes.`;

    const securityMessage =
      "Do not share this code with anyone. Fixora will never ask for it through the assistant.";

    return {
      subject:
        "Verify your Fixora account",

      text:
        [
          greeting,
          "",
          explanation,
          "",
          code,
          "",
          expirationMessage,
          securityMessage,
          "",
          "Fixora",
        ].join("\n"),

      html:
        createEmailHtml(
          title,
          greeting,
          explanation,
          code,
          expirationMessage,
          securityMessage,
        ),
    };
  }

  const title =
    "Verifica tu cuenta de Fixora";

  const greeting =
    `Hola ${username}.`;

  const explanation =
    "Introduce el siguiente código para verificar tu correo electrónico y activar tu cuenta.";

  const expirationMessage =
    `Este código vence en ${expiresInMinutes} minutos.`;

  const securityMessage =
    "No compartas este código con nadie. Fixora nunca lo solicitará mediante el asistente.";

  return {
    subject:
      "Verifica tu cuenta de Fixora",

    text:
      [
        greeting,
        "",
        explanation,
        "",
        code,
        "",
        expirationMessage,
        securityMessage,
        "",
        "Fixora",
      ].join("\n"),

    html:
      createEmailHtml(
        title,
        greeting,
        explanation,
        code,
        expirationMessage,
        securityMessage,
      ),
  };
}

export function createPasswordResetTemplate(
  input: PasswordResetEmailTemplateInput,
): EmailTemplate {
  const username =
    validateUsername(
      input.username,
    );

  const code =
    validateVerificationCode(
      input.code,
    );

  const expiresInMinutes =
    validateExpirationMinutes(
      input.expiresInMinutes,
    );

  if (input.locale === "en") {
    const title =
      "Reset your Fixora password";

    const greeting =
      `Hello ${username}.`;

    const explanation =
      "Use the following code to continue with your password reset.";

    const expirationMessage =
      `This code expires in ${expiresInMinutes} minutes.`;

    const securityMessage =
      "If you did not request this change, ignore this message and do not share the code.";

    return {
      subject:
        "Reset your Fixora password",

      text:
        [
          greeting,
          "",
          explanation,
          "",
          code,
          "",
          expirationMessage,
          securityMessage,
          "",
          "Fixora",
        ].join("\n"),

      html:
        createEmailHtml(
          title,
          greeting,
          explanation,
          code,
          expirationMessage,
          securityMessage,
        ),
    };
  }

  const title =
    "Restablece tu contraseña de Fixora";

  const greeting =
    `Hola ${username}.`;

  const explanation =
    "Utiliza el siguiente código para continuar con el restablecimiento de tu contraseña.";

  const expirationMessage =
    `Este código vence en ${expiresInMinutes} minutos.`;

  const securityMessage =
    "Si no solicitaste este cambio, ignora este mensaje y no compartas el código.";

  return {
    subject:
      "Restablece tu contraseña de Fixora",

    text:
      [
        greeting,
        "",
        explanation,
        "",
        code,
        "",
        expirationMessage,
        securityMessage,
        "",
        "Fixora",
      ].join("\n"),

    html:
      createEmailHtml(
        title,
        greeting,
        explanation,
        code,
        expirationMessage,
        securityMessage,
      ),
  };
}

export function createAdminActivationTemplate(
  input: AdminActivationEmailTemplateInput,
): EmailTemplate {
  const username =
    validateUsername(
      input.username,
    );

  const code =
    validateVerificationCode(
      input.code,
    );

  const expiresInMinutes =
    validateExpirationMinutes(
      input.expiresInMinutes,
    );

  if (input.locale === "en") {
    const title =
      "Activate your Fixora administrator account";

    const greeting =
      `Hello ${username}.`;

    const explanation =
      "The company created an administrator account for you. Use this code to verify your email address.";

    const expirationMessage =
      `This code expires in ${expiresInMinutes} minutes.`;

    const securityMessage =
      "Do not share this code or your administrator credentials with anyone.";

    return {
      subject:
        "Activate your Fixora administrator account",

      text:
        [
          greeting,
          "",
          explanation,
          "",
          code,
          "",
          expirationMessage,
          securityMessage,
          "",
          "Fixora",
        ].join("\n"),

      html:
        createEmailHtml(
          title,
          greeting,
          explanation,
          code,
          expirationMessage,
          securityMessage,
        ),
    };
  }

  const title =
    "Activa tu cuenta administrativa de Fixora";

  const greeting =
    `Hola ${username}.`;

  const explanation =
    "La empresa creó una cuenta administrativa para ti. Utiliza este código para verificar tu correo electrónico.";

  const expirationMessage =
    `Este código vence en ${expiresInMinutes} minutos.`;

  const securityMessage =
    "No compartas este código ni tus credenciales administrativas con ninguna persona.";

  return {
    subject:
      "Activa tu cuenta administrativa de Fixora",

    text:
      [
        greeting,
        "",
        explanation,
        "",
        code,
        "",
        expirationMessage,
        securityMessage,
        "",
        "Fixora",
      ].join("\n"),

    html:
      createEmailHtml(
        title,
        greeting,
        explanation,
        code,
        expirationMessage,
        securityMessage,
      ),
  };
}