import { normalizeAssistantText } from "@/lib/assistant/search-assistant-knowledge";

import type {
  AssistantLocale,
} from "@/types/assistant";

export type ConversationalIntent =
  | "greeting"
  | "wellbeing"
  | "gratitude"
  | "confirmation"
  | "farewell"
  | "identity"
  | "capabilities"
  | "apology"
  | "confusion"
  | "anger"
  | "sadness"
  | "happiness"
  | "crisis";

export type EmotionalIntensity =
  | "low"
  | "medium"
  | "high"
  | "critical";

export type ConversationalResponse = {
  intent: ConversationalIntent;
  intensity: EmotionalIntensity;
  message: string;
  continueToKnowledge: boolean;
};

type LocalizedResponse = Record<
  AssistantLocale,
  string
>;

type IntentRule = {
  intent: ConversationalIntent;
  phrases: readonly string[];
};

const STANDARD_RESPONSES: Record<
  Exclude<
    ConversationalIntent,
    "anger" | "sadness" | "happiness" | "crisis"
  >,
  LocalizedResponse
> = {
  greeting: {
    es:
      "¡Hola! Soy el Asistente Fixora. Es un gusto atenderte. ¿En qué puedo ayudarte hoy?",
    en:
      "Hello! I am the Fixora Assistant. It is a pleasure to assist you. How can I help you today?",
  },

  wellbeing: {
    es:
      "¡Estoy muy bien, gracias por preguntar! Estoy disponible y listo para ayudarte. ¿Cómo puedo asistirte?",
    en:
      "I am doing very well, thank you for asking! I am available and ready to help. How may I assist you?",
  },

  gratitude: {
    es:
      "¡Con mucho gusto! Me alegra haber podido ayudarte. Puedes continuar preguntándome lo que necesites.",
    en:
      "You are very welcome! I am glad I could help. You may continue asking me anything you need.",
  },

  confirmation: {
    es:
      "Perfecto, entendido. Podemos continuar cuando estés listo.",
    en:
      "Perfect, understood. We can continue whenever you are ready.",
  },

  farewell: {
    es:
      "¡Hasta pronto! Gracias por conversar con el Asistente Fixora. Estaré aquí cuando necesites ayuda nuevamente.",
    en:
      "See you soon! Thank you for chatting with the Fixora Assistant. I will be here whenever you need help again.",
  },

  identity: {
    es:
      "Soy el Asistente Fixora, un asistente virtual empresarial creado para orientarte sobre los productos, recursos y servicios disponibles en Fixora.",
    en:
      "I am the Fixora Assistant, an enterprise virtual assistant created to guide you through the products, resources and services available on Fixora.",
  },

  capabilities: {
    es:
      "Puedo conversar contigo y ayudarte con información sobre Fixora, recursos gráficos, software y licencias, hardware, servicios técnicos, soporte remoto, planes, promociones, ayuda y contacto.",
    en:
      "I can chat with you and provide information about Fixora, graphic resources, software and licenses, hardware, technical services, remote support, plans, promotions, help and contact.",
  },

  apology: {
    es:
      "No te preocupes, está todo bien. Podemos continuar con tranquilidad.",
    en:
      "Do not worry, everything is fine. We can continue calmly.",
  },

  confusion: {
    es:
      "Entiendo. Vamos a intentarlo de una manera más clara. Cuéntame exactamente qué necesitas y te orientaré paso a paso.",
    en:
      "I understand. Let us try again more clearly. Tell me exactly what you need and I will guide you step by step.",
  },
};

const ANGER_RESPONSES: Record<
  "low" | "medium" | "high",
  LocalizedResponse
> = {
  low: {
    es:
      "Noto que algo te está incomodando. Cuéntame qué ocurrió y revisaremos la situación con calma.",
    en:
      "I can see that something is bothering you. Tell me what happened and we will review the situation calmly.",
  },

  medium: {
    es:
      "Entiendo que estés molesto o frustrado. Vamos a centrarnos en solucionarlo. Dime qué parte falló o qué resultado esperabas obtener.",
    en:
      "I understand that you are upset or frustrated. Let us focus on solving it. Tell me what failed or what result you expected.",
  },

  high: {
    es:
      "Veo que esta situación te ha molestado bastante. No voy a discutir contigo. Vamos a resolverlo de forma directa: indícame qué ocurrió, qué estabas intentando hacer y qué resultado obtuviste.",
    en:
      "I can see that this situation has made you very upset. I will not argue with you. Let us solve it directly: tell me what happened, what you were trying to do and what result you received.",
  },
};

const SADNESS_RESPONSES: Record<
  "low" | "medium" | "high",
  LocalizedResponse
> = {
  low: {
    es:
      "Siento que no te estés sintiendo bien. Estoy aquí para escucharte y ayudarte con tranquilidad. Cuéntame qué necesitas.",
    en:
      "I am sorry that you are not feeling well. I am here to listen and help you calmly. Tell me what you need.",
  },

  medium: {
    es:
      "Siento que estés pasando por un momento difícil. No tienes que explicarlo todo de una sola vez. Cuéntame con calma qué está ocurriendo o cómo puedo ayudarte.",
    en:
      "I am sorry that you are going through a difficult moment. You do not have to explain everything at once. Tell me calmly what is happening or how I can help.",
  },

  high: {
    es:
      "Lamento que te estés sintiendo tan mal. Lo que sientes merece atención y apoyo. Trata de no quedarte solo con esto; conversa con alguien de confianza y cuéntame qué necesitas en este momento.",
    en:
      "I am sorry that you are feeling this bad. What you are feeling deserves attention and support. Try not to remain alone with this; speak with someone you trust and tell me what you need right now.",
  },
};

const HAPPINESS_RESPONSES: Record<
  "low" | "medium" | "high",
  LocalizedResponse
> = {
  low: {
    es:
      "¡Me alegra saberlo! Dime cómo puedo seguir ayudándote.",
    en:
      "I am glad to hear that! Tell me how I can continue helping you.",
  },

  medium: {
    es:
      "¡Qué buena noticia! Me alegra mucho que estés contento. Continuemos, ¿en qué puedo ayudarte ahora?",
    en:
      "That is great news! I am very glad that you are happy. Let us continue, how can I help you now?",
  },

  high: {
    es:
      "¡Excelente! Se nota que estás muy emocionado y me alegra compartir ese entusiasmo contigo. Cuéntame qué deseas hacer ahora.",
    en:
      "Excellent! I can see that you are very excited, and I am glad to share that enthusiasm with you. Tell me what you would like to do now.",
  },
};

const CRISIS_RESPONSE: LocalizedResponse = {
  es:
    "Siento mucho que estés pasando por esto. Si crees que podrías hacerte daño o estás en peligro inmediato, busca ayuda ahora mismo: comunícate con los servicios de emergencia de tu localidad o con una persona de confianza que pueda acompañarte. No tienes que enfrentar este momento solo.",
  en:
    "I am very sorry that you are going through this. If you believe you may harm yourself or you are in immediate danger, seek help right now: contact your local emergency services or a trusted person who can stay with you. You do not have to face this moment alone.",
};

const EXACT_INTENT_RULES: readonly IntentRule[] = [
  {
    intent: "wellbeing",
    phrases: [
      "como estas",
      "como te encuentras",
      "que tal estas",
      "todo bien contigo",
      "estas bien",
      "como vas",
      "how are you",
      "how are you doing",
      "how do you feel",
      "are you okay",
      "are you ok",
      "how is it going",
    ],
  },

  {
    intent: "gratitude",
    phrases: [
      "gracias",
      "muchas gracias",
      "mil gracias",
      "te agradezco",
      "gracias por ayudarme",
      "gracias por la ayuda",
      "thanks",
      "thank you",
      "thank you very much",
      "thanks a lot",
      "i appreciate it",
      "thanks for helping me",
    ],
  },

  {
    intent: "confirmation",
    phrases: [
      "ok",
      "okay",
      "esta bien",
      "de acuerdo",
      "entendido",
      "comprendido",
      "perfecto",
      "genial",
      "listo",
      "vale",
      "correcto",
      "muy bien",
      "all right",
      "alright",
      "understood",
      "got it",
      "perfect",
      "sounds good",
      "very good",
    ],
  },

  {
    intent: "farewell",
    phrases: [
      "adios",
      "hasta luego",
      "hasta pronto",
      "nos vemos",
      "chau",
      "chao",
      "me voy",
      "bye",
      "goodbye",
      "see you",
      "see you later",
      "talk to you later",
    ],
  },

  {
    intent: "identity",
    phrases: [
      "quien eres",
      "que eres",
      "como te llamas",
      "eres una inteligencia artificial",
      "eres una ia",
      "who are you",
      "what are you",
      "what is your name",
      "are you an ai",
      "are you artificial intelligence",
    ],
  },

  {
    intent: "capabilities",
    phrases: [
      "que puedes hacer",
      "como puedes ayudarme",
      "en que puedes ayudarme",
      "para que sirves",
      "que sabes hacer",
      "what can you do",
      "how can you help me",
      "what can you help me with",
      "what do you do",
    ],
  },

  {
    intent: "apology",
    phrases: [
      "perdon",
      "perdoname",
      "lo siento",
      "disculpa",
      "disculpame",
      "sorry",
      "i am sorry",
      "my apologies",
      "excuse me",
    ],
  },

  {
    intent: "confusion",
    phrases: [
      "no entendi",
      "no entiendo",
      "no comprendi",
      "no me ayudaste",
      "no me ayudo",
      "eso no responde mi pregunta",
      "explicalo mejor",
      "puedes explicarlo mejor",
      "i do not understand",
      "i dont understand",
      "i did not understand",
      "that did not help",
      "that does not answer my question",
      "explain it better",
    ],
  },

  {
    intent: "greeting",
    phrases: [
      "hola",
      "buenas",
      "buenos dias",
      "buenas tardes",
      "buenas noches",
      "hola asistente",
      "hola fixora",
      "que tal",
      "hello",
      "hi",
      "hey",
      "good morning",
      "good afternoon",
      "good evening",
      "hello assistant",
      "hello fixora",
    ],
  },
];

const CRISIS_PHRASES = [
  "quiero morir",
  "me quiero morir",
  "no quiero vivir",
  "ya no quiero vivir",
  "quiero desaparecer",
  "quiero acabar con todo",
  "voy a hacerme daño",
  "quiero hacerme daño",
  "podria hacerme daño",
  "quiero lastimarme",
  "voy a lastimarme",
  "quiero suicidarme",
  "voy a suicidarme",
  "i want to die",
  "i do not want to live",
  "i dont want to live",
  "i want to disappear",
  "i want to end everything",
  "i want to hurt myself",
  "i am going to hurt myself",
  "i want to kill myself",
  "i am going to kill myself",
] as const;

const HIGH_SADNESS_PHRASES = [
  "mal mal estoy",
  "estoy demasiado mal",
  "estoy muy mal",
  "me siento muy mal",
  "no puedo mas",
  "ya no puedo mas",
  "estoy desesperado",
  "estoy destrozado",
  "estoy destruido",
  "me siento vacio",
  "no tengo ganas de nada",
  "todo me sale mal",
  "nadie me entiende",
  "me siento completamente solo",
  "i feel terrible",
  "i feel extremely bad",
  "i cannot take it anymore",
  "i cant take it anymore",
  "i am desperate",
  "i feel empty",
  "i do not feel like doing anything",
  "everything is going wrong",
  "nobody understands me",
  "i feel completely alone",
] as const;

const MEDIUM_SADNESS_PHRASES = [
  "estoy mal",
  "mal estoy",
  "me siento mal",
  "ando mal",
  "toy mal",
  "estoy triste",
  "me siento triste",
  "ando triste",
  "estoy desanimado",
  "estoy deprimido",
  "me siento solo",
  "no estoy bien",
  "hoy estoy mal",
  "estoy bajoneado",
  "i am sad",
  "i feel sad",
  "i feel bad",
  "i am feeling bad",
  "i am feeling down",
  "i am depressed",
  "i feel lonely",
  "i am not okay",
  "i am not well",
] as const;

const LOW_SADNESS_PHRASES = [
  "estoy un poco triste",
  "ando un poco triste",
  "no me siento muy bien",
  "tengo un mal dia",
  "hoy no es un buen dia",
  "i am a little sad",
  "i feel a little down",
  "i am not feeling very well",
  "i am having a bad day",
] as const;

const HIGH_ANGER_PHRASES = [
  "estoy furioso",
  "estoy demasiado enojado",
  "estoy demasiado molesto",
  "estoy harto",
  "ya me canse",
  "me tienes harto",
  "no sirves para nada",
  "eres una mierda",
  "que servicio de mierda",
  "callate",
  "te odio",
  "i am furious",
  "i am extremely angry",
  "i am sick of this",
  "you are useless",
  "you are shit",
  "shut up",
  "i hate you",
] as const;

const MEDIUM_ANGER_PHRASES = [
  "estoy molesto",
  "estoy muy molesto",
  "estoy enojado",
  "estoy muy enojado",
  "estoy frustrado",
  "me da colera",
  "que colera",
  "que rabia",
  "esto me molesta",
  "esto no funciona",
  "i am angry",
  "i am upset",
  "i am frustrated",
  "i am annoyed",
  "this is frustrating",
  "this makes me angry",
  "this does not work",
] as const;

const LOW_ANGER_PHRASES = [
  "estoy incomodo",
  "esto me incomoda",
  "no me gusta",
  "no estoy conforme",
  "esto no esta bien",
  "i am uncomfortable",
  "this bothers me",
  "i do not like this",
  "i am not satisfied",
] as const;

const ANGER_WORDS = new Set([
  "mierda",
  "carajo",
  "puta",
  "puto",
  "pendejo",
  "idiota",
  "estupido",
  "imbecil",
  "animal",
  "tmr",
  "ctm",
  "fuck",
  "fucking",
  "shit",
  "damn",
  "idiot",
  "stupid",
  "asshole",
  "bastard",
]);

const HIGH_HAPPINESS_PHRASES = [
  "estoy super feliz",
  "estoy demasiado feliz",
  "estoy muy emocionado",
  "estoy emocionadisimo",
  "esto es increible",
  "esto esta espectacular",
  "me encanta demasiado",
  "i am extremely happy",
  "i am so happy",
  "i am very excited",
  "this is incredible",
  "this is amazing",
  "i absolutely love it",
] as const;

const MEDIUM_HAPPINESS_PHRASES = [
  "estoy muy feliz",
  "estoy muy contento",
  "me siento genial",
  "me siento muy bien",
  "estoy emocionado",
  "me encanta",
  "esto esta genial",
  "esto esta excelente",
  "i am very happy",
  "i feel great",
  "i feel very good",
  "i am excited",
  "i love it",
  "this is great",
  "this is awesome",
  "this is excellent",
] as const;

const LOW_HAPPINESS_PHRASES = [
  "estoy feliz",
  "estoy contento",
  "me siento feliz",
  "estoy bien",
  "que bueno",
  "i am happy",
  "i feel happy",
  "i am fine",
  "that is good",
] as const;

const GREETING_PREFIXES = [
  "hola",
  "buenas",
  "buenos dias",
  "buenas tardes",
  "buenas noches",
  "hello",
  "hi",
  "hey",
  "good morning",
  "good afternoon",
  "good evening",
] as const;

const GRATITUDE_PREFIXES = [
  "gracias",
  "muchas gracias",
  "thank you",
  "thanks",
] as const;

function includesPhrase(
  normalizedMessage: string,
  phrases: readonly string[],
): boolean {
  return phrases.some((phrase) => {
    const normalizedPhrase =
      normalizeAssistantText(phrase);

    return (
      normalizedMessage === normalizedPhrase ||
      normalizedMessage.includes(
        normalizedPhrase,
      )
    );
  });
}

function startsWithPhrase(
  normalizedMessage: string,
  phrases: readonly string[],
): boolean {
  return phrases.some((phrase) => {
    const normalizedPhrase =
      normalizeAssistantText(phrase);

    return (
      normalizedMessage === normalizedPhrase ||
      normalizedMessage.startsWith(
        `${normalizedPhrase} `,
      )
    );
  });
}

function countWordsFromSet(
  normalizedMessage: string,
  words: ReadonlySet<string>,
): number {
  return normalizedMessage
    .split(" ")
    .reduce(
      (total, word) =>
        words.has(word)
          ? total + 1
          : total,
      0,
    );
}

function hasStrongPunctuation(
  originalMessage: string,
): boolean {
  return /[!?]{3,}/.test(originalMessage);
}

function hasMostlyUppercase(
  originalMessage: string,
): boolean {
  const letters =
    originalMessage.match(
      /[a-zA-ZáéíóúÁÉÍÓÚñÑ]/g,
    ) ?? [];

  if (letters.length < 6) {
    return false;
  }

  const uppercaseLetters =
    letters.filter(
      (letter) =>
        letter ===
        letter.toUpperCase(),
    );

  return (
    uppercaseLetters.length /
      letters.length >=
    0.65
  );
}

function findExactIntent(
  normalizedMessage: string,
): ConversationalIntent | null {
  for (const rule of EXACT_INTENT_RULES) {
    const matches =
      rule.phrases.some(
        (phrase) =>
          normalizedMessage ===
          normalizeAssistantText(
            phrase,
          ),
      );

    if (matches) {
      return rule.intent;
    }
  }

  return null;
}

function createStandardResponse(
  intent: Exclude<
    ConversationalIntent,
    "anger" | "sadness" | "happiness" | "crisis"
  >,
  locale: AssistantLocale,
  continueToKnowledge: boolean,
): ConversationalResponse {
  return {
    intent,
    intensity: "low",
    message:
      STANDARD_RESPONSES[intent][locale],
    continueToKnowledge,
  };
}

function createAngerResponse(
  intensity: "low" | "medium" | "high",
  locale: AssistantLocale,
): ConversationalResponse {
  return {
    intent: "anger",
    intensity,
    message:
      ANGER_RESPONSES[intensity][locale],
    continueToKnowledge: true,
  };
}

function createSadnessResponse(
  intensity: "low" | "medium" | "high",
  locale: AssistantLocale,
): ConversationalResponse {
  return {
    intent: "sadness",
    intensity,
    message:
      SADNESS_RESPONSES[intensity][locale],
    continueToKnowledge: true,
  };
}

function createHappinessResponse(
  intensity: "low" | "medium" | "high",
  locale: AssistantLocale,
): ConversationalResponse {
  return {
    intent: "happiness",
    intensity,
    message:
      HAPPINESS_RESPONSES[intensity][locale],
    continueToKnowledge: true,
  };
}

function createCrisisResponse(
  locale: AssistantLocale,
): ConversationalResponse {
  return {
    intent: "crisis",
    intensity: "critical",
    message: CRISIS_RESPONSE[locale],
    continueToKnowledge: false,
  };
}

function getAngerIntensity(
  originalMessage: string,
  normalizedMessage: string,
): "low" | "medium" | "high" | null {
  const profanityCount =
    countWordsFromSet(
      normalizedMessage,
      ANGER_WORDS,
    );

  const strongExpression =
    hasStrongPunctuation(
      originalMessage,
    );

  const uppercaseExpression =
    hasMostlyUppercase(
      originalMessage,
    );

  if (
    includesPhrase(
      normalizedMessage,
      HIGH_ANGER_PHRASES,
    ) ||
    profanityCount >= 2 ||
    (
      profanityCount >= 1 &&
      (
        strongExpression ||
        uppercaseExpression
      )
    )
  ) {
    return "high";
  }

  if (
    includesPhrase(
      normalizedMessage,
      MEDIUM_ANGER_PHRASES,
    ) ||
    profanityCount === 1 ||
    strongExpression ||
    uppercaseExpression
  ) {
    return "medium";
  }

  if (
    includesPhrase(
      normalizedMessage,
      LOW_ANGER_PHRASES,
    )
  ) {
    return "low";
  }

  return null;
}

function getSadnessIntensity(
  normalizedMessage: string,
): "low" | "medium" | "high" | null {
  if (
    includesPhrase(
      normalizedMessage,
      HIGH_SADNESS_PHRASES,
    )
  ) {
    return "high";
  }

  if (
    includesPhrase(
      normalizedMessage,
      MEDIUM_SADNESS_PHRASES,
    )
  ) {
    return "medium";
  }

  if (
    includesPhrase(
      normalizedMessage,
      LOW_SADNESS_PHRASES,
    )
  ) {
    return "low";
  }

  return null;
}

function getHappinessIntensity(
  normalizedMessage: string,
): "low" | "medium" | "high" | null {
  if (
    includesPhrase(
      normalizedMessage,
      HIGH_HAPPINESS_PHRASES,
    )
  ) {
    return "high";
  }

  if (
    includesPhrase(
      normalizedMessage,
      MEDIUM_HAPPINESS_PHRASES,
    )
  ) {
    return "medium";
  }

  if (
    includesPhrase(
      normalizedMessage,
      LOW_HAPPINESS_PHRASES,
    )
  ) {
    return "low";
  }

  return null;
}

export function getConversationalResponse(
  message: string,
  locale: AssistantLocale,
): ConversationalResponse | null {
  const normalizedMessage =
    normalizeAssistantText(message);

  if (!normalizedMessage) {
    return null;
  }

  /*
   * El riesgo personal se evalúa primero
   * y nunca se combina con recomendaciones
   * comerciales o información de Fixora.
   */
  if (
    includesPhrase(
      normalizedMessage,
      CRISIS_PHRASES,
    )
  ) {
    return createCrisisResponse(
      locale,
    );
  }

  /*
   * La tristeza se evalúa antes que los insultos.
   * Así, expresiones como "me siento de la mierda"
   * no se interpretan automáticamente como enojo.
   */
  const sadnessIntensity =
    getSadnessIntensity(
      normalizedMessage,
    );

  if (sadnessIntensity) {
    return createSadnessResponse(
      sadnessIntensity,
      locale,
    );
  }

  const angerIntensity =
    getAngerIntensity(
      message,
      normalizedMessage,
    );

  if (angerIntensity) {
    return createAngerResponse(
      angerIntensity,
      locale,
    );
  }

  const happinessIntensity =
    getHappinessIntensity(
      normalizedMessage,
    );

  if (happinessIntensity) {
    return createHappinessResponse(
      happinessIntensity,
      locale,
    );
  }

  const exactIntent =
    findExactIntent(
      normalizedMessage,
    );

  if (
    exactIntent &&
    exactIntent !== "anger" &&
    exactIntent !== "sadness" &&
    exactIntent !== "happiness" &&
    exactIntent !== "crisis"
  ) {
    return createStandardResponse(
      exactIntent,
      locale,
      false,
    );
  }

  if (
    startsWithPhrase(
      normalizedMessage,
      GREETING_PREFIXES,
    )
  ) {
    return createStandardResponse(
      "greeting",
      locale,
      true,
    );
  }

  if (
    startsWithPhrase(
      normalizedMessage,
      GRATITUDE_PREFIXES,
    )
  ) {
    return createStandardResponse(
      "gratitude",
      locale,
      true,
    );
  }

  return null;
}