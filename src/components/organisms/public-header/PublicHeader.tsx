"use client";

import { useCallback, useState } from "react";
import { Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { BrandLogo } from "@/components/atoms/brand-logo";
import { MenuTrigger } from "@/components/atoms/menu-trigger";
import { LoginLink } from "@/components/molecules/login-link";
import { DesktopNavigation } from "@/components/organisms/desktop-navigation";
import { MobileNavigation } from "@/components/organisms/mobile-navigation";
import { Link } from "@/i18n/navigation";
import { cn } from "@/utils/cn";

import type { PublicHeaderProps } from "./PublicHeader.types";

const DEFAULT_MOBILE_NAVIGATION_ID = "mobile-navigation-panel";

export function PublicHeader({
  logoAlt = "Fixora",
  mobileNavigationId = DEFAULT_MOBILE_NAVIGATION_ID,
  className,
  ...headerProps
}: PublicHeaderProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const t = useTranslations("navigation");

  const openMobileMenu = useCallback((): void => {
    setIsMobileMenuOpen(true);
  }, []);

  const closeMobileMenu = useCallback((): void => {
    setIsMobileMenuOpen(false);
  }, []);

  return (
    <>
      <header
        {...headerProps}
        className={cn(
          "sticky top-0 z-50 w-full",
          "px-4 pt-4",
          "sm:px-6 sm:pt-5",
          "lg:px-8",
          "xl:px-10",
          className,
        )}
      >
        <div
          className={cn(
            "mx-auto flex min-h-16 w-full",
            "max-w-[1600px] items-center justify-between gap-4",
            "xl:grid",
            "xl:grid-cols-[1fr_auto_1fr]",
            "xl:gap-6",
          )}
        >
          <Link
            href="/"
            aria-label={t("home")}
            title={t("home")}
            onClick={closeMobileMenu}
            className={cn(
              "inline-flex shrink-0 items-center rounded-md",
              "focus-visible:outline-none",
              "focus-visible:ring-2",
              "focus-visible:ring-[#4ead35]",
              "focus-visible:ring-offset-4",
              "focus-visible:ring-offset-[#fdfefe]",
              "dark:focus-visible:ring-[#57af33]",
              "dark:focus-visible:ring-offset-[#0c0f0c]",
              "xl:justify-self-start",
            )}
          >
            <BrandLogo
              variant="auto"
              size="lg"
              alt={logoAlt}
              loading="eager"
              className={cn("w-24", "sm:w-28", "xl:w-36")}
              imageClassName={cn(
                "drop-shadow-[0_5px_8px_rgba(57,57,57,0.14)]",
                "dark:drop-shadow-[0_5px_10px_rgba(255,255,255,0.08)]",
              )}
            />
          </Link>

          <DesktopNavigation className="xl:justify-self-center" />

          <div
            className={cn(
              "flex shrink-0 items-center gap-2",
              "xl:justify-self-end",
            )}
          >
            <div className="xl:hidden">
              <MenuTrigger
                isOpen={isMobileMenuOpen}
                openLabel={t("openMenu")}
                closeLabel={t("closeMenu")}
                controlsId={mobileNavigationId}
                openIcon={Menu}
                closeIcon={X}
                variant="navigation"
                size="md"
                onClick={
                  isMobileMenuOpen
                    ? closeMobileMenu
                    : openMobileMenu
                }
              />
            </div>

            <div className="hidden xl:block">
              <LoginLink
                label={t("signIn")}
                variant="desktop"
              />
            </div>
          </div>
        </div>
      </header>

      <MobileNavigation
        id={mobileNavigationId}
        isOpen={isMobileMenuOpen}
        onClose={closeMobileMenu}
      />
    </>
  );
}