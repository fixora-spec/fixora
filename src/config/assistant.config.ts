import type {
  AssistantLocale,
  AssistantPanelCopy,
  AssistantSuggestion,
} from "@/types/assistant";

export const ASSISTANT_CONFIG = {
  name:
    "Asistente Fixora",

  apiEndpoint:
    "/api/assistant",

  storageKey:
    "fixora-assistant-history",

  maxMessageLength:
    800,

  maxHistoryMessageLength:
    800,

  maxHistoryMessages:
    12,

  maxStoredMessages:
    30,

  maxKnowledgeResults:
    4,

  minimumSearchScore:
    1,

  responseDelay:
    250,

  panel: {
    desktopWidth:
      400,

    desktopMaxHeight:
      640,

    mobileHorizontalMargin:
      12,

    mobileBottomOffset:
      88,
  },
} as const;

export const ASSISTANT_COPY = {
  es: {
    title:
      "Asistente Fixora",

    subtitle:
      "Consulta sobre productos, servicios y tu cuenta",

    greeting:
      "Hola, soy el Asistente Fixora. Puedo orientarte sobre recursos gráficos, software, hardware, servicios técnicos, soporte remoto, planes, promociones, registro, inicio de sesión, verificación de correo y recuperación de contraseña.",

    emptyTitle:
      "¿En qué puedo ayudarte?",

    emptyDescription:
      "Escribe una pregunta o selecciona una de las consultas sugeridas. No envíes contraseñas, códigos ni otros datos privados.",

    inputPlaceholder:
      "Escribe tu consulta...",

    sendLabel:
      "Enviar mensaje",

    closeLabel:
      "Cerrar asistente",

    clearLabel:
      "Limpiar conversación",

    loadingLabel:
      "Buscando información...",

    errorMessage:
      "No pude procesar tu consulta. Inténtalo nuevamente.",

    messageTooLong:
      "El mensaje supera el límite permitido.",
  },

  en: {
    title:
      "Fixora Assistant",

    subtitle:
      "Ask about products, services and your account",

    greeting:
      "Hello, I am the Fixora Assistant. I can guide you through graphic resources, software, hardware, technical services, remote support, plans, promotions, registration, sign-in, email verification and password recovery.",

    emptyTitle:
      "How can I help you?",

    emptyDescription:
      "Write a question or select one of the suggested queries. Do not send passwords, codes or other private information.",

    inputPlaceholder:
      "Write your question...",

    sendLabel:
      "Send message",

    closeLabel:
      "Close assistant",

    clearLabel:
      "Clear conversation",

    loadingLabel:
      "Searching for information...",

    errorMessage:
      "I could not process your question. Please try again.",

    messageTooLong:
      "The message exceeds the allowed limit.",
  },
} as const satisfies Record<
  AssistantLocale,
  AssistantPanelCopy
>;

export const ASSISTANT_SUGGESTIONS = {
  es: [
    {
      id:
        "technical-services",

      label:
        "Servicios técnicos",

      prompt:
        "¿Qué servicios técnicos ofrece Fixora?",
    },

    {
      id:
        "remote-support",

      label:
        "Soporte remoto",

      prompt:
        "¿Cómo funciona el soporte remoto?",
    },

    {
      id:
        "user-registration",

      label:
        "Crear una cuenta",

      prompt:
        "¿Cómo puedo crear una cuenta de usuario?",
    },

    {
      id:
        "password-recovery",

      label:
        "Recuperar contraseña",

      prompt:
        "Olvidé mi contraseña. ¿Cómo puedo recuperarla?",
    },

    {
      id:
        "secure-passwords",

      label:
        "Contraseñas seguras",

      prompt:
        "Genera cinco contraseñas seguras para mí.",
    },

    {
      id:
        "plans-promotions",

      label:
        "Planes y promociones",

      prompt:
        "¿Qué planes y promociones tiene Fixora?",
    },
  ],

  en: [
    {
      id:
        "technical-services",

      label:
        "Technical services",

      prompt:
        "What technical services does Fixora offer?",
    },

    {
      id:
        "remote-support",

      label:
        "Remote support",

      prompt:
        "How does remote support work?",
    },

    {
      id:
        "user-registration",

      label:
        "Create an account",

      prompt:
        "How can I create a user account?",
    },

    {
      id:
        "password-recovery",

      label:
        "Recover password",

      prompt:
        "I forgot my password. How can I recover it?",
    },

    {
      id:
        "secure-passwords",

      label:
        "Secure passwords",

      prompt:
        "Generate five secure passwords for me.",
    },

    {
      id:
        "plans-promotions",

      label:
        "Plans and promotions",

      prompt:
        "What plans and promotions does Fixora offer?",
    },
  ],
} as const satisfies Record<
  AssistantLocale,
  readonly AssistantSuggestion[]
>;

export function getAssistantCopy(
  locale:
    AssistantLocale,
): AssistantPanelCopy {
  return ASSISTANT_COPY[
    locale
  ];
}

export function getAssistantSuggestions(
  locale:
    AssistantLocale,
): readonly AssistantSuggestion[] {
  return ASSISTANT_SUGGESTIONS[
    locale
  ];
}