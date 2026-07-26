import type {
  ComponentPropsWithoutRef,
  RefObject,
} from "react";

export type AssistantInputSubmitHandler = (
  message: string,
) => void | Promise<void>;

export type AssistantInputProps = Omit<
  ComponentPropsWithoutRef<"form">,
  "children" | "onSubmit"
> & {
  value: string;

  onValueChange: (value: string) => void;

  onSubmitMessage: AssistantInputSubmitHandler;

  placeholder?: string;

  sendLabel?: string;

  textareaId?: string;

  textareaName?: string;

  maxLength?: number;

  minRows?: number;

  maxRows?: number;

  isLoading?: boolean;

  disabled?: boolean;

  autoFocus?: boolean;

  showCharacterCount?: boolean;

  textareaRef?: RefObject<HTMLTextAreaElement | null>;
};