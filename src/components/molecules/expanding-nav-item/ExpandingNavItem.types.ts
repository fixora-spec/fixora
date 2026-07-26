import type { ComponentPropsWithoutRef } from "react";

import type { NavigationItem } from "@/types/navigation";

export type ExpandingNavItemProps = Omit<
  ComponentPropsWithoutRef<"li">,
  "children"
> & {
  item: NavigationItem;
  label: string;
  isActive: boolean;
  onNavigate?: () => void;
};