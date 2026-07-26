import type {
  ComponentPropsWithoutRef,
  ReactNode,
} from "react";

export type PublicPageTemplateProps = Readonly<
  Omit<ComponentPropsWithoutRef<"main">, "children"> & {
    children?: ReactNode;
    headerClassName?: string;
    quickActionsClassName?: string;
  }
>;