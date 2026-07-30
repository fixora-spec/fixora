export {
  EmailDeliveryError,
  clearEmailTransporter,
  sendEmail,
  verifyEmailConnection,
} from "./email-client";

export {
  createAdminActivationTemplate,
  createEmailVerificationTemplate,
  createPasswordResetTemplate,
} from "./email-templates";

export type {
  EmailDeliveryResult,
  EmailMessage,
} from "./email-client";

export type {
  AdminActivationEmailTemplateInput,
  EmailTemplate,
  PasswordResetEmailTemplateInput,
  VerificationEmailTemplateInput,
} from "./email-templates";