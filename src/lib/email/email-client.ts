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

type SmtpTransporter =
  ReturnType<
    typeof nodemailer.createTransport
  >;

const MAXIMUM_SUBJECT_LENGTH =
  200;

const MAXIMUM_TEXT_LENGTH =
  20_000;

const MAXIMUM_HTML_LENGTH =
  50_000;

let cachedSmtpTransporter:
  | SmtpTransporter
  | null = null;

export class EmailDeliveryError
  extends Error {
  public readonly cause:
    unknown;

  public constructor(
    message: string,
    cause?: unknown,
  ) {
    super(message);

    this.name =
      "EmailDeliveryError";

    this.cause =
      cause;
  }
}

function containsControlCharacters(
  value: string,
): boolean {
  return /\r|\n|\0/u.test(
    value,
  );
}

function validateRecipient(
  recipient: string,
): string {
  const normalizedRecipient =
    recipient
      .trim()
      .toLowerCase();

  if (
    normalizedRecipient.length
      > 320
    || containsControlCharacters(
      normalizedRecipient,
    )
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(
      normalizedRecipient,
    )
  ) {
    throw new EmailDeliveryError(
      "El destinatario del correo no es válido.",
    );
  }

  return normalizedRecipient;
}

function validateSubject(
  subject: string,
): string {
  const normalizedSubject =
    subject.trim();

  if (
    normalizedSubject.length === 0
    || normalizedSubject.length
      > MAXIMUM_SUBJECT_LENGTH
    || containsControlCharacters(
      normalizedSubject,
    )
  ) {
    throw new EmailDeliveryError(
      `El asunto debe contener entre 1 y ${MAXIMUM_SUBJECT_LENGTH} caracteres y no puede incluir saltos de línea.`,
    );
  }

  return normalizedSubject;
}

function validateText(
  text: string,
): string {
  const normalizedText =
    text.trim();

  if (
    normalizedText.length === 0
    || normalizedText.length
      > MAXIMUM_TEXT_LENGTH
    || normalizedText.includes(
      "\0",
    )
  ) {
    throw new EmailDeliveryError(
      `El contenido de texto debe contener entre 1 y ${MAXIMUM_TEXT_LENGTH} caracteres.`,
    );
  }

  return normalizedText;
}

function validateHtml(
  html: string | undefined,
): string | undefined {
  if (
    typeof html
      === "undefined"
  ) {
    return undefined;
  }

  const normalizedHtml =
    html.trim();

  if (
    normalizedHtml.length === 0
    || normalizedHtml.length
      > MAXIMUM_HTML_LENGTH
    || normalizedHtml.includes(
      "\0",
    )
  ) {
    throw new EmailDeliveryError(
      `El contenido HTML debe contener entre 1 y ${MAXIMUM_HTML_LENGTH} caracteres.`,
    );
  }

  return normalizedHtml;
}

function normalizeAddress(
  value: string,
): string | null {
  const trimmedValue =
    value.trim();

  const addressMatch =
    trimmedValue.match(
      /<([^<>]+)>$/u,
    );

  const address =
    (
      addressMatch?.[1]
      ?? trimmedValue
    )
      .trim()
      .toLowerCase();

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(
    address,
  )
    ? address
    : null;
}

function normalizeAddressList(
  value: unknown,
): string[] {
  if (
    !Array.isArray(
      value,
    )
  ) {
    return [];
  }

  const normalizedAddresses:
    string[] = [];

  for (
    const item
    of value
  ) {
    let rawAddress:
      string | null = null;

    if (
      typeof item
        === "string"
    ) {
      rawAddress =
        item;
    } else if (
      typeof item
        === "object"
      && item !== null
      && "address" in item
      && typeof item.address
        === "string"
    ) {
      rawAddress =
        item.address;
    }

    if (
      rawAddress === null
    ) {
      continue;
    }

    const normalizedAddress =
      normalizeAddress(
        rawAddress,
      );

    if (
      normalizedAddress
      && !normalizedAddresses.includes(
        normalizedAddress,
      )
    ) {
      normalizedAddresses.push(
        normalizedAddress,
      );
    }
  }

  return normalizedAddresses;
}

function createSmtpTransporter():
  SmtpTransporter {
  const configuration =
    getEmailConfiguration();

  if (
    configuration.mode
      !== "smtp"
  ) {
    throw new EmailDeliveryError(
      "El transporte SMTP no está habilitado.",
    );
  }

  return nodemailer.createTransport({
    host:
      configuration.smtp.host,

    port:
      configuration.smtp.port,

    secure:
      configuration.smtp.secure,

    requireTLS:
      configuration.smtp.requireTls,

    auth: {
      user:
        configuration.smtp.user,

      pass:
        configuration.smtp.password,
    },

    connectionTimeout:
      configuration.smtp
        .connectionTimeoutMs,

    greetingTimeout:
      configuration.smtp
        .greetingTimeoutMs,

    socketTimeout:
      configuration.smtp
        .socketTimeoutMs,

    logger:
      false,

    debug:
      false,

    disableFileAccess:
      true,

    disableUrlAccess:
      true,
  });
}

function getSmtpTransporter():
  SmtpTransporter {
  if (
    cachedSmtpTransporter
  ) {
    return cachedSmtpTransporter;
  }

  cachedSmtpTransporter =
    createSmtpTransporter();

  return cachedSmtpTransporter;
}

function deliverToConsole(
  message:
    Required<EmailMessage>,

  from: string,
): EmailDeliveryResult {
  if (
    process.env.NODE_ENV
      === "production"
  ) {
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
    ].join(
      "\n",
    ),
  );

  return {
    mode:
      "console",

    messageId:
      null,

    accepted:
      [
        message.to,
      ],

    rejected:
      [],

    response:
      "Correo mostrado en la terminal de desarrollo.",
  };
}

function ensureRecipientWasAccepted(
  recipient: string,

  accepted:
    readonly string[],

  rejected:
    readonly string[],
): void {
  const recipientWasAccepted =
    accepted.includes(
      recipient,
    );

  const recipientWasRejected =
    rejected.includes(
      recipient,
    );

  if (
    !recipientWasAccepted
    || recipientWasRejected
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
  const configuration =
    getEmailConfiguration();

  const normalizedText =
    validateText(
      input.text,
    );

  const message:
    Required<EmailMessage> = {
      to:
        validateRecipient(
          input.to,
        ),

      subject:
        validateSubject(
          input.subject,
        ),

      text:
        normalizedText,

      html:
        validateHtml(
          input.html,
        ) ?? normalizedText,
    };

  if (
    configuration.mode
      === "console"
  ) {
    return deliverToConsole(
      message,
      configuration.from,
    );
  }

  try {
    const transporter =
      getSmtpTransporter();

    const deliveryInformation =
      await transporter.sendMail({
        from:
          configuration.from,

        to:
          message.to,

        subject:
          message.subject,

        text:
          message.text,

        html:
          message.html,

        disableFileAccess:
          true,

        disableUrlAccess:
          true,
      });

    const accepted =
      normalizeAddressList(
        deliveryInformation
          .accepted,
      );

    const rejected =
      normalizeAddressList(
        deliveryInformation
          .rejected,
      );

    ensureRecipientWasAccepted(
      message.to,
      accepted,
      rejected,
    );

    return {
      mode:
        "smtp",

      messageId:
        typeof deliveryInformation
          .messageId === "string"
        && deliveryInformation
          .messageId
          .trim()
          .length > 0
          ? deliveryInformation
              .messageId
              .trim()
          : null,

      accepted,
      rejected,

      response:
        typeof deliveryInformation
          .response === "string"
        && deliveryInformation
          .response
          .trim()
          .length > 0
          ? deliveryInformation
              .response
              .trim()
          : "Correo aceptado por el servidor SMTP.",
    };
  } catch (error) {
    if (
      error
      instanceof EmailDeliveryError
    ) {
      throw error;
    }

    clearEmailTransporter();

    throw new EmailDeliveryError(
      "No se pudo enviar el correo electrónico.",
      error,
    );
  }
}

export async function verifyEmailConnection():
  Promise<boolean> {
  const configuration =
    getEmailConfiguration();

  if (
    configuration.mode
      === "console"
  ) {
    return (
      process.env.NODE_ENV
      !== "production"
    );
  }

  try {
    const transporter =
      getSmtpTransporter();

    const verified =
      await transporter.verify();

    if (
      !verified
    ) {
      clearEmailTransporter();

      throw new EmailDeliveryError(
        "El servidor SMTP rechazó la verificación de la conexión.",
      );
    }

    return true;
  } catch (error) {
    if (
      error
      instanceof EmailDeliveryError
    ) {
      throw error;
    }

    clearEmailTransporter();

    throw new EmailDeliveryError(
      "No se pudo verificar la conexión SMTP.",
      error,
    );
  }
}

export function clearEmailTransporter():
  void {
  if (
    cachedSmtpTransporter
    && typeof cachedSmtpTransporter
      .close === "function"
  ) {
    cachedSmtpTransporter.close();
  }

  cachedSmtpTransporter =
    null;
}