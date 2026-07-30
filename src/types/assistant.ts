import type {
  Locale,
} from "@/types/locale";

export type AssistantLocale =
  Locale;

export type AssistantRole =
  | "user"
  | "assistant";

export type AssistantMessageStatus =
  | "sending"
  | "completed"
  | "error";

export type AssistantKnowledgeSection =
  | "general"
  | "about"
  | "graphic-resources"
  | "software-licenses"
  | "hardware"
  | "technical-services"
  | "remote-support"
  | "plans-promotions"
  | "help-center"
  | "contact";

export type AssistantErrorCode =
  | "INVALID_REQUEST"
  | "EMPTY_MESSAGE"
  | "MESSAGE_TOO_LONG"
  | "NO_INFORMATION"
  | "NETWORK_ERROR"
  | "INTERNAL_ERROR";

export type AssistantTranslations =
  Record<
    AssistantLocale,
    string
  >;

export type AssistantSource = {
  id:
    string;

  title:
    string;

  section:
    AssistantKnowledgeSection;

  href?:
    string;
};

export type AssistantAuthAction =
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

export type AssistantToolPayload = {
  passwordSuggestions?:
    readonly string[];

  aliasSuggestions?:
    readonly string[];

  authAction?:
    AssistantAuthAction;

  requiresUserInput?:
    boolean;

  passwordLength?:
    number;
};

export type AssistantMessage = {
  id:
    string;

  role:
    AssistantRole;

  /*
   * Para los mensajes del usuario se conserva
   * exactamente el contenido escrito.
   *
   * Para los mensajes del asistente se utiliza
   * como respaldo cuando no existan traducciones.
   */
  content:
    string;

  /*
   * Solo se utiliza en mensajes del asistente.
   * Permite cambiar entre español e inglés
   * sin modificar los mensajes del usuario.
   */
  translations?:
    AssistantTranslations;

  createdAt:
    number;

  status:
    AssistantMessageStatus;

  sources?:
    readonly AssistantSource[];

  tools?:
    AssistantToolPayload;
};

export type AssistantSuggestion = {
  id:
    string;

  label:
    string;

  prompt:
    string;
};

export type AssistantKnowledgeItem = {
  id:
    string;

  locale:
    AssistantLocale;

  section:
    AssistantKnowledgeSection;

  title:
    string;

  summary:
    string;

  content:
    string;

  keywords:
    readonly string[];

  href?:
    string;

  priority:
    number;
};

export type AssistantSearchResult = {
  item:
    AssistantKnowledgeItem;

  score:
    number;

  matchedKeywords:
    readonly string[];
};

export type AssistantHistoryMessage = {
  role:
    AssistantRole;

  content:
    string;
};

export type AssistantRequest = {
  message:
    string;

  locale:
    AssistantLocale;

  history?:
    readonly AssistantHistoryMessage[];
};

export type AssistantResponse = {
  /*
   * Respuesta correspondiente al idioma
   * seleccionado actualmente.
   */
  message:
    string;

  /*
   * Ambas versiones del mismo mensaje.
   * Se almacenan para actualizar el idioma
   * inmediatamente dentro del historial.
   */
  translations:
    AssistantTranslations;

  sources:
    readonly AssistantSource[];

  tools?:
    AssistantToolPayload;
};

export type AssistantErrorResponse = {
  error:
    string;

  code:
    AssistantErrorCode;
};

export type AssistantState = {
  isOpen:
    boolean;

  isLoading:
    boolean;

  messages:
    AssistantMessage[];

  error:
    string | null;
};

export type SendAssistantMessageOptions = {
  message:
    string;

  locale:
    AssistantLocale;
};

export type AssistantPanelCopy = {
  title:
    string;

  subtitle:
    string;

  greeting:
    string;

  emptyTitle:
    string;

  emptyDescription:
    string;

  inputPlaceholder:
    string;

  sendLabel:
    string;

  closeLabel:
    string;

  clearLabel:
    string;

  loadingLabel:
    string;

  errorMessage:
    string;

  messageTooLong:
    string;
};

export type UseAssistantReturn =
  AssistantState & {
    openAssistant:
      () => void;

    closeAssistant:
      () => void;

    toggleAssistant:
      () => void;

    clearMessages:
      () => void;

    clearError:
      () => void;

    sendMessage: (
      options:
        SendAssistantMessageOptions,
    ) => Promise<void>;
  };