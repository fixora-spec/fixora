import type {
  AuthMessageLiveRegion,
  AuthMessageProps,
  AuthMessageRole,
  AuthMessageVariant,
} from "./AuthMessage.types";

function getDefaultRole(
  variant:
    AuthMessageVariant,
): AuthMessageRole {
  if (
    variant === "ERROR"
  ) {
    return "alert";
  }

  return "status";
}

function getDefaultLiveRegion(
  role:
    AuthMessageRole,
): AuthMessageLiveRegion {
  if (
    role === "alert"
  ) {
    return "assertive";
  }

  if (
    role === "note"
  ) {
    return "off";
  }

  return "polite";
}

export function AuthMessage({
  messageId,
  variant = "INFO",
  title,
  children,
  role,
  live,
  atomic = true,
  hidden = false,
  ...containerProperties
}: AuthMessageProps) {
  if (hidden) {
    return null;
  }

  const resolvedRole =
    role
    ?? getDefaultRole(
      variant,
    );

  const resolvedLiveRegion =
    live
    ?? getDefaultLiveRegion(
      resolvedRole,
    );

  const titleId =
    messageId
    && title
      ? `${messageId}-title`
      : undefined;

  const contentId =
    messageId
      ? `${messageId}-content`
      : undefined;

  return (
    <div
      {...containerProperties}
      id={messageId}
      role={resolvedRole}
      aria-live={
        resolvedLiveRegion
      }
      aria-atomic={atomic}
      aria-labelledby={
        titleId
      }
      aria-describedby={
        contentId
      }
      data-auth-message=""
      data-auth-message-variant={
        variant.toLowerCase()
      }
    >
      {title ? (
        <p id={titleId}>
          {title}
        </p>
      ) : null}

      <div id={contentId}>
        {children}
      </div>
    </div>
  );
}