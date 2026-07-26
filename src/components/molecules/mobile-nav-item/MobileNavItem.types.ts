import type { ComponentPropsWithoutRef } from "react";

import type { NavigationItem } from "@/types/navigation";

export type MobileNavItemProps = Omit<
  ComponentPropsWithoutRef<"li">,
  "children"
> & {
  item: NavigationItem;
  label: string;
  isActive: boolean;
  onNavigate?: () => void;
};