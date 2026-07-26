import type { ComponentPropsWithoutRef } from "react";

export type MobileNavigationProps = Readonly<
  Omit<
    ComponentPropsWithoutRef<"nav">,
    "children" | "onClose"
  > & {
    isOpen: boolean;
    onClose: () => void;
  }
>;