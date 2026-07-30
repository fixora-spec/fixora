"use client";

import {
  useMemo,
  useState,
} from "react";

import type {
  SyntheticEvent,
} from "react";

import type {
  AccountAvatarProps,
} from "./AccountAvatar.types";

const DEFAULT_AVATAR_SIZE = 40;

function normalizeText(
  value:
    string
    | null
    | undefined,
): string {
  return (
    value
      ?.trim()
      .replace(
        /\s+/gu,
        " ",
      )
      .normalize("NFC")
    ?? ""
  );
}

function getFirstCharacter(
  value: string,
): string {
  return (
    Array.from(value)[0]
    ?? ""
  );
}

function createInitials({
  username,
  firstNames,
  lastNames,
}: Pick<
  AccountAvatarProps,
  | "username"
  | "firstNames"
  | "lastNames"
>): string {
  const normalizedFirstNames =
    normalizeText(
      firstNames,
    );

  const normalizedLastNames =
    normalizeText(
      lastNames,
    );

  const nameInitial =
    getFirstCharacter(
      normalizedFirstNames,
    );

  const surnameInitial =
    getFirstCharacter(
      normalizedLastNames,
    );

  const completeNameInitials =
    `${nameInitial}${surnameInitial}`;

  if (
    completeNameInitials.length
    > 0
  ) {
    return completeNameInitials
      .toLocaleUpperCase();
  }

  const normalizedUsername =
    normalizeText(
      username,
    );

  const usernameParts =
    normalizedUsername
      .split(
        /[\s._-]+/u,
      )
      .filter(Boolean);

  if (
    usernameParts.length
    >= 2
  ) {
    return [
      getFirstCharacter(
        usernameParts[0],
      ),

      getFirstCharacter(
        usernameParts[
          usernameParts.length - 1
        ],
      ),
    ]
      .join("")
      .toLocaleUpperCase();
  }

  const usernameCharacters =
    Array.from(
      normalizedUsername,
    );

  return (
    usernameCharacters
      .slice(
        0,
        2,
      )
      .join("")
      .toLocaleUpperCase()
    || "?"
  );
}

function createAlternativeText({
  alternativeText,
  username,
  firstNames,
  lastNames,
}: Pick<
  AccountAvatarProps,
  | "alternativeText"
  | "username"
  | "firstNames"
  | "lastNames"
>): string {
  const providedAlternativeText =
    normalizeText(
      alternativeText,
    );

  if (
    providedAlternativeText
  ) {
    return providedAlternativeText;
  }

  const completeName =
    [
      normalizeText(
        firstNames,
      ),

      normalizeText(
        lastNames,
      ),
    ]
      .filter(Boolean)
      .join(" ");

  return (
    completeName
    || normalizeText(
      username,
    )
    || "Cuenta"
  );
}

function normalizeImageUrl(
  imageUrl:
    string
    | null
    | undefined,
): string | null {
  const normalizedImageUrl =
    imageUrl?.trim();

  if (
    !normalizedImageUrl
  ) {
    return null;
  }

  if (
    normalizedImageUrl.startsWith(
      "/",
    )
    || normalizedImageUrl.startsWith(
      "data:image/",
    )
    || normalizedImageUrl.startsWith(
      "blob:",
    )
  ) {
    return normalizedImageUrl;
  }

  try {
    const parsedUrl =
      new URL(
        normalizedImageUrl,
      );

    if (
      parsedUrl.protocol !== "https:"
      && parsedUrl.protocol !== "http:"
    ) {
      return null;
    }

    return parsedUrl.toString();
  } catch {
    return null;
  }
}

export function AccountAvatar({
  imageUrl,
  username,
  firstNames = null,
  lastNames = null,
  accountRole = "USER",
  alternativeText,
  decorative = false,
  width = DEFAULT_AVATAR_SIZE,
  height = DEFAULT_AVATAR_SIZE,
  loading = "lazy",
  className,
  fallbackClassName,
  onImageError,
}: AccountAvatarProps) {
  const [
    failedImageUrl,
    setFailedImageUrl,
  ] = useState<
    string | null
  >(
    null,
  );

  const normalizedImageUrl =
    useMemo(
      () =>
        normalizeImageUrl(
          imageUrl,
        ),
      [
        imageUrl,
      ],
    );

  const initials =
    useMemo(
      () =>
        createInitials({
          username,
          firstNames,
          lastNames,
        }),
      [
        username,
        firstNames,
        lastNames,
      ],
    );

  const resolvedAlternativeText =
    useMemo(
      () =>
        decorative
          ? ""
          : createAlternativeText({
              alternativeText,
              username,
              firstNames,
              lastNames,
            }),
      [
        decorative,
        alternativeText,
        username,
        firstNames,
        lastNames,
      ],
    );

  const shouldRenderImage =
    normalizedImageUrl !== null
    && failedImageUrl
      !== normalizedImageUrl;

  const handleImageError =
    (
      event:
        SyntheticEvent<
          HTMLImageElement,
          Event
        >,
    ): void => {
      const failedSource =
        event.currentTarget
          .currentSrc
        || normalizedImageUrl;

      setFailedImageUrl(
        failedSource,
      );

      onImageError?.();
    };

  if (
    shouldRenderImage
  ) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={
          normalizedImageUrl
        }
        alt={
          resolvedAlternativeText
        }
        width={width}
        height={height}
        loading={loading}
        decoding="async"
        className={className}
        data-account-avatar=""
        data-account-role={
          accountRole
        }
        onError={
          handleImageError
        }
      />
    );
  }

  return (
    <span
      className={
        fallbackClassName
        ?? className
      }
      role={
        decorative
          ? undefined
          : "img"
      }
      aria-label={
        decorative
          ? undefined
          : resolvedAlternativeText
      }
      aria-hidden={
        decorative
          ? true
          : undefined
      }
      data-account-avatar=""
      data-account-avatar-fallback=""
      data-account-role={
        accountRole
      }
      data-avatar-width={
        width
      }
      data-avatar-height={
        height
      }
    >
      {initials}
    </span>
  );
}