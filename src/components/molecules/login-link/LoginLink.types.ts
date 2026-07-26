import type { ComponentPropsWithoutRef } from "react";

export type LoginLinkVariant = "desktop" | "mobile";

export type LoginLinkProps = Omit<
  ComponentPropsWithoutRef<"a">,
  "children" | "href" | "onClick"
> & {
  label: string;
  variant?: LoginLinkVariant;
  onNavigate?: () => void;
};