import type {
  ComponentPropsWithoutRef,
} from "react";

import type {
  AssistantLocale,
} from "@/types/assistant";

export type AssistantPanelProps = Omit<
  ComponentPropsWithoutRef<"section">,
  "children"
> & {
  locale: AssistantLocale;

  isOpen: boolean;

  onClose: () => void;

  showBackdrop?: boolean;

  closeOnBackdrop?: boolean;

  closeOnEscape?: boolean;
};