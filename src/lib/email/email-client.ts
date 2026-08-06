import "server-only";

import nodemailer from "nodemailer";

import {
  getEmailConfiguration,
} from "@/config/email.config";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type EmailDeliveryResult = {
  mode: "console" | "smtp";
  messageId: string | null;
  accepted: readonly string[];
  rejected: readonly string[];
  response: string;
};

type SmtpTransporter = ReturnType<
  typeof nodemailer.createTransport
>;

type NormalizedEmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

type UnknownRecord = Record<string, unknown>;

const MAXIMUM_RECIPIENT_LENGTH = 320;
const MAXIMUM_SUBJECT_LENGTH = 200;
const MAXIMUM_TEXT_LENGTH = 20_000;
const MAXIMUM_HTML_LENGTH = 50_000;
const MAXIMUM_TRANSPORT_VALUE_LENGTH = 1_000;

let cachedSmtpTransporter: SmtpTransporter | null = null;

export class EmailDeliveryError extends Error {
  public readonly cause: unknown;

  public constructor(
    message: string,
    cause?: unknown,
  ) {
    super(message);

    this.name = "EmailDeliveryError";
    this.cause = cause;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function isUnknownRecord(value: unknown): value is UnknownRecord {
  return (
    typeof value === "object"
    && value !== null
    && !Array.isArray(value)
  );
}

function containsForbiddenHeaderCharacters(value: string): boolean {
  return /[\r\n\0]/u.test(value);
}

function containsNullCharacter(value: string): boolean {
  return value.includes("\0");
}

function isValidEmailAddress(value: string): boolean {
  if (
    value.length < 5
    || value.length > MAXIMUM_RECIPIENT_LENGTH
    || containsForbiddenHeaderCharacters(value)
    || /\s/u.test(value)
  ) {
    return false;
  }

  const separatorIndex = value.lastIndexOf("@");

  if (
    separatorIndex <= 0
    || separatorIndex > 64
    || separatorIndex === value.length - 1
    || value.indexOf("@") !== separatorIndex
  ) {
    return false;
  }

  const localPart = value.slice(0, separatorIndex);
  const domain = value.slice(separatorIndex + 1).toLowerCase();

  if (
    localPart.startsWith(".")
    || localPart.endsWith(".")
    || localPart.includes("..")
  ) {
    return false;
  }

  return (
    localPart.length <= 64
    && domain.length <= 255
    && /^[^<>(),:;"\[\]\\]+$/u.test(localPart)
    && /^(?=.{1,255}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))+$/u.test(
      domain,
    )
  );
}

function normalizeEmailAddress(value: string): string | null {
  const trimmedValue = value.trim();
  const bracketMatch = /^([^<>]*)<([^<>]+)>$/u.exec(trimmedValue);

  if (
    (trimmedValue.includes("<") || trimmedValue.includes(">"))
    && !bracketMatch
  ) {
    return null;
  }

  const rawAddress = bracketMatch?.[2]?.trim() ?? trimmedValue;
  const separatorIndex = rawAddress.lastIndexOf("@");

  if (!isValidEmailAddress(rawAddress) || separatorIndex <= 0) {
    return null;
  }

  return [
    rawAddress.slice(0, separatorIndex).toLowerCase(),
    rawAddress.slice(separatorIndex + 1).toLowerCase(),
  ].join("@");
}

function validateRecipient(recipient: string): string {
  const normalizedRecipient = normalizeEmailAddress(recipient);

  if (!normalizedRecipient) {
    throw new EmailDeliveryError(
      "El destinatario del correo no es válido.",
    );
  }

  return normalizedRecipient;
}

function validateSubject(subject: string): string {
  const normalizedSubject = subject.trim();

  if (
    normalizedSubject.length === 0
    || normalizedSubject.length > MAXIMUM_SUBJECT_LENGTH
    || containsForbiddenHeaderCharacters(normalizedSubject)
  ) {
    throw new EmailDeliveryError(
      `El asunto debe contener entre 1 y ${MAXIMUM_SUBJECT_LENGTH} caracteres y no puede incluir caracteres de control.`,
    );
  }

  return normalizedSubject;
}

function validateText(text: string): string {
  const normalizedText = text.trim();

  if (
    normalizedText.length === 0
    || normalizedText.length > MAXIMUM_TEXT_LENGTH
    || containsNullCharacter(normalizedText)
  ) {
    throw new EmailDeliveryError(
      `El contenido de texto debe contener entre 1 y ${MAXIMUM_TEXT_LENGTH} caracteres y no puede incluir caracteres nulos.`,
    );
  }

  return normalizedText;
}

function validateHtml(html: string | undefined): string | undefined {
  if (typeof html === "undefined") {
    return undefined;
  }

  const normalizedHtml = html.trim();

  if (
    normalizedHtml.length === 0
    || normalizedHtml.length > MAXIMUM_HTML_LENGTH
    || containsNullCharacter(normalizedHtml)
  ) {
    throw new EmailDeliveryError(
      `El contenido HTML debe contener entre 1 y ${MAXIMUM_HTML_LENGTH} caracteres y no puede incluir caracteres nulos.`,
    );
  }

  return normalizedHtml;
}

function normalizeMessage(input: EmailMessage): NormalizedEmailMessage {
  return {
    to: validateRecipient(input.to),
    subject: validateSubject(input.subject),
    text: validateText(input.text),
    ...(typeof input.html === "string"
      ? {
          html: validateHtml(input.html),
        }
      : {}),
  };
}

function normalizeAddressList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalizedAddresses = new Set<string>();

  for (const item of value) {
    let rawAddress: string | null = null;

    if (typeof item === "string") {
      rawAddress = item;
    } else if (
      isUnknownRecord(item)
      && typeof item.address === "string"
    ) {
      rawAddress = item.address;
    }

    if (!rawAddress) {
      continue;
    }

    const normalizedAddress = normalizeEmailAddress(rawAddress);

    if (normalizedAddress) {
      normalizedAddresses.add(normalizedAddress);
    }
  }

  return [...normalizedAddresses];
}

function normalizeTransportValue(
  value: unknown,
  fallback: string,
): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalizedValue = value
    .replace(/[\r\n\0]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

  if (normalizedValue.length === 0) {
    return fallback;
  }

  return normalizedValue.slice(0, MAXIMUM_TRANSPORT_VALUE_LENGTH);
}

function getSafeSmtpErrorDetails(error: unknown): UnknownRecord | null {
  if (!isUnknownRecord(error)) {
    return null;
  }

  const details: UnknownRecord = {};

  if (
    typeof error.code === "string"
    && /^[A-Z0-9_-]{1,64}$/u.test(error.code)
  ) {
    details.code = error.code;
  }

  if (
    typeof error.command === "string"
    && /^[A-Z0-9_-]{1,64}$/u.test(error.command)
  ) {
    details.command = error.command;
  }

  if (
    typeof error.responseCode === "number"
    && Number.isSafeInteger(error.responseCode)
  ) {
    details.responseCode = error.responseCode;
  }

  return Object.keys(details).length > 0
    ? details
    : null;
}

function createSmtpTransporter(): SmtpTransporter {
  const configuration = getEmailConfiguration();

  if (configuration.mode !== "smtp") {
    throw new EmailDeliveryError(
      "El transporte SMTP no está habilitado.",
    );
  }

  return nodemailer.createTransport({
    host: configuration.smtp.host,
    port: configuration.smtp.port,
    secure: configuration.smtp.secure,
    requireTLS: configuration.smtp.requireTls,
    auth: {
      user: configuration.smtp.user,
      pass: configuration.smtp.password,
    },
    connectionTimeout: configuration.smtp.connectionTimeoutMs,
    greetingTimeout: configuration.smtp.greetingTimeoutMs,
    socketTimeout: configuration.smtp.socketTimeoutMs,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}

function getSmtpTransporter(): SmtpTransporter {
  if (cachedSmtpTransporter) {
    return cachedSmtpTransporter;
  }

  cachedSmtpTransporter = createSmtpTransporter();

  return cachedSmtpTransporter;
}

function deliverToConsole(
  message: NormalizedEmailMessage,
  from: string,
): EmailDeliveryResult {
  if (process.env.NODE_ENV === "production") {
    throw new EmailDeliveryError(
      "El transporte de correo por consola está deshabilitado en producción.",
    );
  }

  console.info(
    [
      "",
      "========================================",
      "FIXORA - CORREO DE DESARROLLO",
      "========================================",
      `De: ${from}`,
      `Para: ${message.to}`,
      `Asunto: ${message.subject}`,
      "----------------------------------------",
      message.text,
      "========================================",
      "",
    ].join("\n"),
  );

  return {
    mode: "console",
    messageId: null,
    accepted: [message.to],
    rejected: [],
    response: "Correo mostrado en la terminal de desarrollo.",
  };
}

function ensureRecipientWasAccepted(
  recipient: string,
  accepted: readonly string[],
  rejected: readonly string[],
): void {
  const normalizedRecipient = normalizeEmailAddress(recipient);

  if (!normalizedRecipient) {
    throw new EmailDeliveryError(
      "El destinatario normalizado del correo no es válido.",
    );
  }

  if (
    !accepted.includes(normalizedRecipient)
    || rejected.includes(normalizedRecipient)
  ) {
    throw new EmailDeliveryError(
      "El servidor SMTP no aceptó al destinatario del correo.",
      {
        accepted,
        rejected,
      },
    );
  }
}

export async function sendEmail(
  input: EmailMessage,
): Promise<EmailDeliveryResult> {
  const configuration = getEmailConfiguration();
  const message = normalizeMessage(input);

  if (configuration.mode === "console") {
    return deliverToConsole(message, configuration.from);
  }

  try {
    const transporter = getSmtpTransporter();

    const deliveryInformation = await transporter.sendMail({
      from: configuration.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html
        ? {
            html: message.html,
          }
        : {}),
      disableFileAccess: true,
      disableUrlAccess: true,
    });

    const accepted = normalizeAddressList(deliveryInformation.accepted);
    const rejected = normalizeAddressList(deliveryInformation.rejected);

    ensureRecipientWasAccepted(
      message.to,
      accepted,
      rejected,
    );

    return {
      mode: "smtp",
      messageId:
        typeof deliveryInformation.messageId === "string"
        && deliveryInformation.messageId.trim().length > 0
          ? normalizeTransportValue(deliveryInformation.messageId, "") || null
          : null,
      accepted,
      rejected,
      response: normalizeTransportValue(
        deliveryInformation.response,
        "Correo aceptado por el servidor SMTP.",
      ),
    };
  } catch (error) {
    if (error instanceof EmailDeliveryError) {
      throw error;
    }

    const safeDetails = getSafeSmtpErrorDetails(error);

    if (safeDetails) {
      console.error(
        "No se pudo enviar un correo mediante SMTP.",
        safeDetails,
      );
    } else {
      console.error(
        "No se pudo enviar un correo mediante SMTP.",
      );
    }

    clearEmailTransporter();

    throw new EmailDeliveryError(
      "No se pudo enviar el correo electrónico.",
      error,
    );
  }
}

export async function verifyEmailConnection(): Promise<boolean> {
  const configuration = getEmailConfiguration();

  if (configuration.mode === "console") {
    return process.env.NODE_ENV !== "production";
  }

  try {
    const transporter = getSmtpTransporter();
    const verified = await transporter.verify();

    if (!verified) {
      clearEmailTransporter();

      throw new EmailDeliveryError(
        "El servidor SMTP rechazó la verificación de la conexión.",
      );
    }

    return true;
  } catch (error) {
    if (error instanceof EmailDeliveryError) {
      throw error;
    }

    clearEmailTransporter();

    throw new EmailDeliveryError(
      "No se pudo verificar la conexión SMTP.",
      error,
    );
  }
}

export function clearEmailTransporter(): void {
  const transporter = cachedSmtpTransporter;
  cachedSmtpTransporter = null;

  if (
    transporter
    && typeof transporter.close === "function"
  ) {
    try {
      transporter.close();
    } catch {
      // El transporte puede haberse cerrado previamente por el servidor SMTP.
    }
  }
}