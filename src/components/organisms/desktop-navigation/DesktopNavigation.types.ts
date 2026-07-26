import type { ComponentPropsWithoutRef } from "react";

export type DesktopNavigationProps = Omit<
  ComponentPropsWithoutRef<"nav">,
  "children"
>;