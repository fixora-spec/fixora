import type { ComponentPropsWithoutRef } from "react";

export type QuickActionsMenuProps = Omit<
  ComponentPropsWithoutRef<"div">,
  | "children"
  | "onWheel"
  | "onPointerDown"
  | "onPointerUp"
  | "onPointerCancel"
>;