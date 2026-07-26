import type { LucideIcon } from "lucide-react";

export type AppPathname =
  | "/"
  | "/sobre-fixora"
  | "/recursos-graficos"
  | "/software-licencias"
  | "/hardware"
  | "/servicios-tecnicos"
  | "/soporte-remoto"
  | "/planes-promociones"
  | "/centro-de-ayuda"
  | "/contacto"
  | "/iniciar-sesion";

export type NavigationItemId =
  | "home"
  | "about"
  | "graphic-resources"
  | "software-licenses"
  | "hardware"
  | "technical-services"
  | "remote-support"
  | "plans-promotions"
  | "help-center"
  | "contact";

export type NavigationLabelKey =
  | "home"
  | "about"
  | "graphicResources"
  | "softwareLicenses"
  | "hardware"
  | "technicalServices"
  | "remoteSupport"
  | "plansPromotions"
  | "helpCenter"
  | "contact";

export type NavigationItem = {
  id: NavigationItemId;
  href: Exclude<AppPathname, "/iniciar-sesion">;
  labelKey: NavigationLabelKey;
  icon: LucideIcon;
  exact?: boolean;
};

export type LoginRoute = {
  id: "sign-in";
  href: "/iniciar-sesion";
  labelKey: "signIn";
};

export type NavigationMode = "desktop" | "mobile";

export type NavigationState = {
  pathname: string;
  activeItemId: NavigationItemId | null;
  isMobileMenuOpen: boolean;
};

export type NavigationItemProps = {
  item: NavigationItem;
  isActive: boolean;
  onNavigate?: () => void;
  className?: string;
};