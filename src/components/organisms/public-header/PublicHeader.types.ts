import type { ComponentPropsWithoutRef } from "react";

export type PublicHeaderProps = Omit<
  ComponentPropsWithoutRef<"header">,
  "children"
> & {
  logoAlt?: string;
  mobileNavigationId?: string;
};