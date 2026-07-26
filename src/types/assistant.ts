export type AssistantLocale = "es" | "en";

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

export type AssistantTranslations = Record<
  AssistantLocale,
  string
>;

export type AssistantSource = {
  id: string;
  title: string;
  section: AssistantKnowledgeSection;
  href?: string;
};

export type AssistantMessage = {
  id: string;
  role: AssistantRole;

  /*
   * Contenido original del mensaje.
   *
   * Para el usuario se conserva exactamente
   * como fue escrito.
   *
   * Para el asistente se utiliza como respaldo
   * cuando no existan traducciones.
   */
  content: string;

  /*
   * Solo se utiliza en mensajes del asistente.
   * Permite cambiar las respuestas entre ES y EN
   * sin modificar lo que escribió el usuario.
   */
  translations?: AssistantTranslations;

  createdAt: number;
  status: AssistantMessageStatus;

  sources?: readonly AssistantSource[];
};

export type AssistantSuggestion = {
  id: string;
  label: string;
  prompt: string;
};

export type AssistantKnowledgeItem = {
  id: string;
  locale: AssistantLocale;
  section: AssistantKnowledgeSection;
  title: string;
  summary: string;
  content: string;
  keywords: readonly string[];
  href?: string;
  priority: number;
};

export type AssistantSearchResult = {
  item: AssistantKnowledgeItem;
  score: number;
  matchedKeywords: readonly string[];
};

export type AssistantHistoryMessage = {
  role: AssistantRole;
  content: string;
};

export type AssistantRequest = {
  message: string;
  locale: AssistantLocale;
  history?: readonly AssistantHistoryMessage[];
};

export type AssistantResponse = {
  /*
   * Respuesta correspondiente al idioma
   * actualmente seleccionado en la página.
   */
  message: string;

  /*
   * Ambas versiones de la misma respuesta.
   * Se almacenan para permitir el cambio
   * inmediato de idioma en el historial.
   */
  translations: AssistantTranslations;

  sources: readonly AssistantSource[];
};

export type AssistantErrorResponse = {
  error: string;
  code: AssistantErrorCode;
};

export type AssistantState = {
  isOpen: boolean;
  isLoading: boolean;
  messages: AssistantMessage[];
  error: string | null;
};

export type SendAssistantMessageOptions = {
  message: string;
  locale: AssistantLocale;
};

export type AssistantPanelCopy = {
  title: string;
  subtitle: string;
  greeting: string;
  emptyTitle: string;
  emptyDescription: string;
  inputPlaceholder: string;
  sendLabel: string;
  closeLabel: string;
  clearLabel: string;
  loadingLabel: string;
  errorMessage: string;
  messageTooLong: string;
};

export type UseAssistantReturn =
  AssistantState & {
    openAssistant: () => void;

    closeAssistant: () => void;

    toggleAssistant: () => void;

    clearMessages: () => void;

    clearError: () => void;

    sendMessage: (
      options: SendAssistantMessageOptions,
    ) => Promise<void>;
  };