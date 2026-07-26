import type { ReactNode } from "react";

import { PublicPageTemplate } from "@/components/templates/public-page-template";

type PublicLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function PublicLayout({
  children,
}: PublicLayoutProps) {
  return (
    <PublicPageTemplate>
      {children}
    </PublicPageTemplate>
  );
}