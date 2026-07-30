import type {
  ComponentPropsWithoutRef,
} from "react";

export type LoginLinkVariant =
  | "desktop"
  | "mobile";

export type LoginLinkProps =
  Omit<
    ComponentPropsWithoutRef<"button">,
    | "children"
    | "type"
    | "onClick"
  > & {
    label:
      string;

    variant?:
      LoginLinkVariant;

    onNavigate?:
      () => void;
  };