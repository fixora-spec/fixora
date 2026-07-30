import type {
  Locale,
} from "@/types/locale";

export type AuthAssistantIntent =
  | "GENERATE_PASSWORDS"
  | "CHECK_USERNAME_AVAILABILITY"
  | "SUGGEST_USERNAMES"
  | "USER_SIGN_IN_HELP"
  | "USER_REGISTRATION_HELP"
  | "EMAIL_VERIFICATION_HELP"
  | "PASSWORD_RECOVERY_HELP"
  | "PASSWORD_RESET_HELP"
  | "ADMIN_ACCESS_HELP"
  | "ACCOUNT_ACTION_REQUEST"
  | "GENERAL_AUTH_HELP"
  | "UNKNOWN";

export type AuthAssistantIntentConfidence =
  | "LOW"
  | "MEDIUM"
  | "HIGH";

export type DetectAuthAssistantIntentInput = {
  message:
    string;

  locale?:
    Locale;
};

export type AuthAssistantIntentDetection = {
  intent:
    AuthAssistantIntent;

  confidence:
    AuthAssistantIntentConfidence;

  matchedKeywords:
    readonly string[];

  normalizedMessage:
    string;
};

type IntentPatternDefinition = {
  intent:
    AuthAssistantIntent;

  priority:
    number;

  patterns:
    readonly RegExp[];
};

type IntentPatternMatch = {
  intent:
    AuthAssistantIntent;

  priority:
    number;

  matchedKeywords:
    string[];
};

const SPANISH_ACTION_REQUEST_PATTERNS:
  readonly RegExp[] = [
    /\bregistrame\b/u,
    /\bcreame\s+(?:una\s+)?cuenta\b/u,
    /\bcrea\s+(?:mi|una)\s+cuenta\b/u,
    /\binicia\s+sesion\s+por\s+mi\b/u,
    /\bingresa\s+por\s+mi\b/u,
    /\breserva(?:me)?\s+(?:el\s+)?(?:usuario|nombre)\b/u,
    /\bsepara(?:me)?\s+(?:el\s+)?(?:usuario|nombre)\b/u,
    /\bcambia(?:me)?\s+(?:la\s+)?contrasena\b/u,
    /\brestablece(?:me)?\s+(?:la\s+)?contrasena\b/u,
    /\bverifica(?:me)?\s+(?:el\s+)?correo\b/u,
  ];

const ENGLISH_ACTION_REQUEST_PATTERNS:
  readonly RegExp[] = [
    /\bregister\s+me\b/u,
    /\bcreate\s+(?:an?|my)\s+account\b/u,
    /\bsign\s+in\s+for\s+me\b/u,
    /\blog\s+in\s+for\s+me\b/u,
    /\breserve\s+(?:the\s+)?username\b/u,
    /\bclaim\s+(?:the\s+)?username\b/u,
    /\bchange\s+my\s+password\b/u,
    /\breset\s+my\s+password\s+for\s+me\b/u,
    /\bverify\s+my\s+email\s+for\s+me\b/u,
  ];

const INTENT_PATTERN_DEFINITIONS:
  readonly IntentPatternDefinition[] = [
    {
      intent:
        "ACCOUNT_ACTION_REQUEST",

      priority:
        100,

      patterns: [
        ...SPANISH_ACTION_REQUEST_PATTERNS,
        ...ENGLISH_ACTION_REQUEST_PATTERNS,
      ],
    },

    {
      intent:
        "GENERATE_PASSWORDS",

      priority:
        90,

      patterns: [
        /\bgenera(?:r|me)?\s+(?:cinco|5)?\s*contrasenas?\b/u,
        /\bcrea(?:r|me)?\s+(?:cinco|5)?\s*contrasenas?\b/u,
        /\bdame\s+(?:cinco|5)?\s*contrasenas?\b/u,
        /\bcontrasenas?\s+(?:fuertes|seguras|aleatorias)\b/u,
        /\bgenerate\s+(?:five|5)?\s*passwords?\b/u,
        /\bcreate\s+(?:five|5)?\s*passwords?\b/u,
        /\bstrong\s+passwords?\b/u,
        /\bsecure\s+passwords?\b/u,
        /\brandom\s+passwords?\b/u,
      ],
    },

    {
      intent:
        "CHECK_USERNAME_AVAILABILITY",

      priority:
        85,

      patterns: [
        /\b(?:usuario|nombre)\s+(?:esta|sigue)\s+disponible\b/u,
        /\bcomprobar\s+(?:el\s+)?(?:usuario|nombre)\b/u,
        /\bverificar\s+(?:el\s+)?(?:usuario|nombre)\b/u,
        /\bconsultar\s+disponibilidad\b/u,
        /\bdisponibilidad\s+(?:del\s+)?(?:usuario|nombre)\b/u,
        /\bcheck\s+(?:the\s+)?username\b/u,
        /\busername\s+availability\b/u,
        /\bis\s+(?:this\s+)?username\s+available\b/u,
        /\busername\s+(?:is\s+)?taken\b/u,
      ],
    },

    {
      intent:
        "SUGGEST_USERNAMES",

      priority:
        80,

      patterns: [
        /\bsugiere(?:me)?\s+(?:un\s+)?(?:usuario|nombre)\b/u,
        /\bdame\s+(?:ideas|opciones)\s+de\s+(?:usuario|nombre)\b/u,
        /\bnombres?\s+de\s+usuario\s+disponibles\b/u,
        /\balias\s+(?:disponibles|similares|alternativos)\b/u,
        /\bsuggest\s+(?:a\s+)?username\b/u,
        /\busername\s+suggestions\b/u,
        /\bgive\s+me\s+username\s+ideas\b/u,
        /\balternative\s+usernames?\b/u,
      ],
    },

    {
      intent:
        "PASSWORD_RESET_HELP",

      priority:
        75,

      patterns: [
        /\brestablecer\s+(?:mi\s+)?contrasena\b/u,
        /\bcambiar\s+(?:mi\s+)?contrasena\b/u,
        /\bnueva\s+contrasena\b/u,
        /\breset\s+(?:my\s+)?password\b/u,
        /\bchange\s+(?:my\s+)?password\b/u,
        /\bnew\s+password\b/u,
      ],
    },

    {
      intent:
        "PASSWORD_RECOVERY_HELP",

      priority:
        74,

      patterns: [
        /\bolvide\s+(?:mi\s+)?contrasena\b/u,
        /\brecuperar\s+(?:mi\s+)?contrasena\b/u,
        /\bcodigo\s+de\s+recuperacion\b/u,
        /\bno\s+recibo\s+(?:el\s+)?codigo\b/u,
        /\bforgot\s+(?:my\s+)?password\b/u,
        /\brecover\s+(?:my\s+)?password\b/u,
        /\brecovery\s+code\b/u,
        /\bdidn'?t\s+receive\s+(?:the\s+)?code\b/u,
      ],
    },

    {
      intent:
        "EMAIL_VERIFICATION_HELP",

      priority:
        70,

      patterns: [
        /\bverificar\s+(?:mi\s+)?correo\b/u,
        /\bverificacion\s+(?:del\s+)?correo\b/u,
        /\bcodigo\s+de\s+verificacion\b/u,
        /\bcorreo\s+no\s+verificado\b/u,
        /\bverify\s+(?:my\s+)?email\b/u,
        /\bemail\s+verification\b/u,
        /\bverification\s+code\b/u,
        /\bunverified\s+email\b/u,
      ],
    },

    {
      intent:
        "ADMIN_ACCESS_HELP",

      priority:
        65,

      patterns: [
        /\bacceso\s+(?:de\s+)?administrador\b/u,
        /\biniciar\s+sesion\s+como\s+administrador\b/u,
        /\bcuenta\s+administrativa\b/u,
        /\brecuperacion\s+(?:del\s+)?administrador\b/u,
        /\badmin(?:istrator)?\s+access\b/u,
        /\badmin(?:istrator)?\s+(?:sign\s+in|login)\b/u,
        /\badmin(?:istrator)?\s+account\b/u,
        /\badmin(?:istrator)?\s+recovery\b/u,
      ],
    },

    {
      intent:
        "USER_REGISTRATION_HELP",

      priority:
        60,

      patterns: [
        /\bcomo\s+(?:me\s+)?registro\b/u,
        /\bcomo\s+crear\s+(?:una\s+)?cuenta\b/u,
        /\bcrear\s+(?:una\s+)?cuenta\s+de\s+usuario\b/u,
        /\bformulario\s+de\s+registro\b/u,
        /\bregistrar(?:se)?\b/u,
        /\bhow\s+do\s+i\s+register\b/u,
        /\bhow\s+to\s+create\s+(?:an?\s+)?account\b/u,
        /\buser\s+registration\b/u,
        /\bsign\s+up\b/u,
      ],
    },

    {
      intent:
        "USER_SIGN_IN_HELP",

      priority:
        55,

      patterns: [
        /\bcomo\s+inicio\s+sesion\b/u,
        /\bcomo\s+ingreso\s+a\s+mi\s+cuenta\b/u,
        /\bno\s+puedo\s+iniciar\s+sesion\b/u,
        /\bproblema\s+(?:al|para)\s+iniciar\s+sesion\b/u,
        /\bhow\s+do\s+i\s+sign\s+in\b/u,
        /\bhow\s+do\s+i\s+log\s+in\b/u,
        /\bcan'?t\s+(?:sign|log)\s+in\b/u,
        /\bsign\s+in\s+problem\b/u,
        /\blogin\s+problem\b/u,
      ],
    },

    {
      intent:
        "GENERAL_AUTH_HELP",

      priority:
        20,

      patterns: [
        /\bautenticacion\b/u,
        /\bcuenta\b/u,
        /\biniciar\s+sesion\b/u,
        /\bregistro\b/u,
        /\bcorreo\b/u,
        /\bcontrasena\b/u,
        /\busuario\b/u,
        /\bauthentication\b/u,
        /\baccount\b/u,
        /\bsign\s+in\b/u,
        /\blog\s+in\b/u,
        /\bpassword\b/u,
        /\busername\b/u,
        /\bemail\b/u,
      ],
    },
  ];

function normalizeMessage(
  message: string,
): string {
  return message
    .trim()
    .normalize("NFD")
    .replace(
      /\p{M}+/gu,
      "",
    )
    .toLocaleLowerCase()
    .replace(
      /[¿?¡!.,;:()[\]{}"'`´]+/gu,
      " ",
    )
    .replace(
      /\s+/gu,
      " ",
    )
    .trim();
}

function extractMatchedText(
  message:
    string,

  pattern:
    RegExp,
): string | null {
  const match =
    pattern.exec(
      message,
    );

  if (
    !match
    || !match[0]
  ) {
    return null;
  }

  return match[0]
    .trim();
}

function evaluateDefinition(
  normalizedMessage:
    string,

  definition:
    IntentPatternDefinition,
): IntentPatternMatch | null {
  const matchedKeywords =
    definition.patterns
      .map(
        (
          pattern,
        ) =>
          extractMatchedText(
            normalizedMessage,
            pattern,
          ),
      )
      .filter(
        (
          value,
        ): value is string =>
          Boolean(value),
      );

  if (
    matchedKeywords.length === 0
  ) {
    return null;
  }

  return {
    intent:
      definition.intent,

    priority:
      definition.priority,

    matchedKeywords:
      Array.from(
        new Set(
          matchedKeywords,
        ),
      ),
  };
}

function resolveConfidence(
  match:
    IntentPatternMatch,

  normalizedMessage:
    string,
): AuthAssistantIntentConfidence {
  if (
    match.intent
      === "ACCOUNT_ACTION_REQUEST"
    || match.matchedKeywords.length
      >= 2
  ) {
    return "HIGH";
  }

  if (
    match.intent
      === "GENERAL_AUTH_HELP"
    || normalizedMessage.length
      < 8
  ) {
    return "LOW";
  }

  return "MEDIUM";
}

function selectBestMatch(
  matches:
    readonly IntentPatternMatch[],
): IntentPatternMatch | null {
  if (
    matches.length === 0
  ) {
    return null;
  }

  return [...matches]
    .sort(
      (
        firstMatch,
        secondMatch,
      ) => {
        const priorityDifference =
          secondMatch.priority
          - firstMatch.priority;

        if (
          priorityDifference !== 0
        ) {
          return priorityDifference;
        }

        return (
          secondMatch
            .matchedKeywords
            .length
          - firstMatch
            .matchedKeywords
            .length
        );
      },
    )[0] ?? null;
}

export function detectAuthAssistantIntent({
  message,
}: DetectAuthAssistantIntentInput): AuthAssistantIntentDetection {
  const normalizedMessage =
    normalizeMessage(
      message,
    );

  if (
    normalizedMessage.length === 0
  ) {
    return {
      intent:
        "UNKNOWN",

      confidence:
        "LOW",

      matchedKeywords:
        [],

      normalizedMessage,
    };
  }

  const matches =
    INTENT_PATTERN_DEFINITIONS
      .map(
        (
          definition,
        ) =>
          evaluateDefinition(
            normalizedMessage,
            definition,
          ),
      )
      .filter(
        (
          match,
        ): match is IntentPatternMatch =>
          match !== null,
      );

  const bestMatch =
    selectBestMatch(
      matches,
    );

  if (!bestMatch) {
    return {
      intent:
        "UNKNOWN",

      confidence:
        "LOW",

      matchedKeywords:
        [],

      normalizedMessage,
    };
  }

  return {
    intent:
      bestMatch.intent,

    confidence:
      resolveConfidence(
        bestMatch,
        normalizedMessage,
      ),

    matchedKeywords:
      bestMatch.matchedKeywords,

    normalizedMessage,
  };
}