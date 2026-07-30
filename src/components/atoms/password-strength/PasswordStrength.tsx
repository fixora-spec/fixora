import type {
  PasswordStrengthProps,
} from "./PasswordStrength.types";

export function PasswordStrength({
  strengthId,
  level,
  isValid,
  label,
  description,
  requirements = [],
  announceChanges = true,
  hidden = false,
  ...containerProperties
}: PasswordStrengthProps) {
  if (hidden) {
    return null;
  }

  const normalizedLevel =
    String(level)
      .trim()
      .toLowerCase()
      .replace(
        /_/gu,
        "-",
      );

  const labelId =
    strengthId
    && label
      ? `${strengthId}-label`
      : undefined;

  const descriptionId =
    strengthId
    && description
      ? `${strengthId}-description`
      : undefined;

  const requirementsId =
    strengthId
    && requirements.length > 0
      ? `${strengthId}-requirements`
      : undefined;

  const describedBy =
    [
      descriptionId,
      requirementsId,
    ]
      .filter(
        (
          value,
        ): value is string =>
          Boolean(value),
      )
      .join(" ")
    || undefined;

  return (
    <div
      {...containerProperties}
      id={strengthId}
      role={
        announceChanges
          ? "status"
          : undefined
      }
      aria-live={
        announceChanges
          ? "polite"
          : "off"
      }
      aria-atomic={
        announceChanges
      }
      aria-labelledby={
        labelId
      }
      aria-describedby={
        describedBy
      }
      data-password-strength=""
      data-password-strength-level={
        normalizedLevel
      }
      data-password-strength-valid={
        isValid
          ? "true"
          : "false"
      }
    >
      <p id={labelId}>
        {label
          ?? String(level)}
      </p>

      {description ? (
        <p id={descriptionId}>
          {description}
        </p>
      ) : null}

      {requirements.length > 0 ? (
        <ul id={requirementsId}>
          {requirements.map(
            (
              requirement,
            ) => (
              <li
                key={
                  requirement
                    .requirementId
                }
                data-password-requirement=""
                data-password-requirement-id={
                  requirement
                    .requirementId
                }
                data-password-requirement-satisfied={
                  requirement.satisfied
                    ? "true"
                    : "false"
                }
              >
                <span
                  aria-hidden="true"
                >
                  {requirement.satisfied
                    ? "✓"
                    : "—"}
                </span>

                <span>
                  {
                    requirement
                      .label
                  }
                </span>
              </li>
            ),
          )}
        </ul>
      ) : null}
    </div>
  );
}