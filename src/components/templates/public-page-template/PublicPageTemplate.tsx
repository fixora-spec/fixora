import { PublicHeader } from "@/components/organisms/public-header";
import { QuickActionsMenu } from "@/components/organisms/quick-actions-menu";
import { cn } from "@/utils/cn";

import type { PublicPageTemplateProps } from "./PublicPageTemplate.types";

export function PublicPageTemplate({
  children,
  className,
  headerClassName,
  quickActionsClassName,
  ...mainProps
}: PublicPageTemplateProps) {
  return (
    <>
      <PublicHeader className={headerClassName} />

      <main
        {...mainProps}
        className={cn(
          "mx-auto w-full max-w-[1600px]",
          "min-h-[calc(100dvh-5rem)]",
          "px-4 pt-6 pb-24",
          "sm:px-6 sm:pt-8",
          "lg:px-8",
          "xl:px-10",
          className,
        )}
      >
        {children}
      </main>

      <QuickActionsMenu className={quickActionsClassName} />
    </>
  );
}