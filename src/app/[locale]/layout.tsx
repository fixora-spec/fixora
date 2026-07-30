import type {
  ReactNode,
} from "react";

import {
  hasLocale,
  NextIntlClientProvider,
} from "next-intl";

import {
  setRequestLocale,
} from "next-intl/server";

import {
  notFound,
} from "next/navigation";

import {
  AppPreloader,
} from "@/components/organisms/app-preloader";

import {
  ApplicationBootstrap,
} from "@/components/organisms/application-bootstrap";

import {
  AuthenticationGateway,
} from "@/components/organisms/authentication-gateway";

import {
  routing,
} from "@/i18n/routing";

import {
  AppProviders,
} from "@/providers/app-providers";

import type {
  PreloaderLocale,
} from "@/types/preloader";

import "../globals.css";

type LocaleLayoutProps = Readonly<{
  children:
    ReactNode;

  params:
    Promise<{
      locale:
        string;
    }>;
}>;

export function generateStaticParams() {
  return routing.locales.map(
    (
      locale,
    ) => ({
      locale,
    }),
  );
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const {
    locale,
  } = await params;

  if (
    !hasLocale(
      routing.locales,
      locale,
    )
  ) {
    notFound();
  }

  setRequestLocale(
    locale,
  );

  const preloaderLocale =
    locale as PreloaderLocale;

  return (
    <html
      lang={locale}
      dir="ltr"
      suppressHydrationWarning
      className="min-h-full"
    >
      <body
        className={[
          "min-h-dvh",
          "bg-[var(--fixora-background)]",
          "text-[var(--fixora-foreground)]",
          "antialiased",
        ].join(" ")}
      >
        <NextIntlClientProvider>
          <AppProviders>
            <AppPreloader
              locale={
                preloaderLocale
              }
              enabled
              initialProgress={0}
              lockDocumentScroll
              zIndex={9999}
              decorative={false}
              showBackground
              showFloatingShapes
              showLogo
              showParticleRing
              showProgress
            />

            <ApplicationBootstrap
              preloaderCompleted
              automaticAuthenticationEnabled
            >
              <AuthenticationGateway />
            </ApplicationBootstrap>

            {children}
          </AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}