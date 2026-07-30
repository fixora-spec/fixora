import type {
  HTMLAttributes,
  HTMLInputTypeAttribute,
  InputHTMLAttributes,
  ReactNode,
} from "react";

export type AuthFieldContainerProps =
  Omit<
    HTMLAttributes<HTMLDivElement>,
    "children"
  >;

export type AuthFieldProps =
  Omit<
    InputHTMLAttributes<HTMLInputElement>,
    | "children"
    | "id"
    | "name"
    | "type"
  > & {
    fieldId?: string;

    name: string;

    type?:
      HTMLInputTypeAttribute;

    label:
      ReactNode;

    description?:
      ReactNode;

    errorMessage?:
      ReactNode;

    labelSuffix?:
      ReactNode;

    containerProps?:
      AuthFieldContainerProps;
  };