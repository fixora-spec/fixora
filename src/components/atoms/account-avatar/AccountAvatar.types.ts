import type {
  ImgHTMLAttributes,
} from "react";

import type {
  AccountRole,
} from "@/types/account";

export type AccountAvatarLoading =
  NonNullable<
    ImgHTMLAttributes<HTMLImageElement>[
      "loading"
    ]
  >;

export type AccountAvatarProps = {
  imageUrl?:
    string
    | null;

  username:
    string;

  firstNames?:
    string
    | null;

  lastNames?:
    string
    | null;

  accountRole?:
    AccountRole;

  alternativeText?:
    string;

  decorative?:
    boolean;

  width?:
    number;

  height?:
    number;

  loading?:
    AccountAvatarLoading;

  className?:
    string;

  fallbackClassName?:
    string;

  onImageError?:
    () => void;
};