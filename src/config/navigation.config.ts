import {
  AppWindow,
  BadgePercent,
  Building2,
  CircleHelp,
  Cpu,
  House,
  Images,
  Mail,
  MonitorCog,
  Wrench,
} from "lucide-react";

export const NAVIGATION_ITEMS = [
  {
    id: "home",
    href: "/",
    labelKey: "home",
    icon: House,
    exact: true,
  },
  {
    id: "about",
    href: "/sobre-fixora",
    labelKey: "about",
    icon: Building2,
    exact: true,
  },
  {
    id: "graphic-resources",
    href: "/recursos-graficos",
    labelKey: "graphicResources",
    icon: Images,
    exact: true,
  },
  {
    id: "software-licenses",
    href: "/software-licencias",
    labelKey: "softwareLicenses",
    icon: AppWindow,
    exact: true,
  },
  {
    id: "hardware",
    href: "/hardware",
    labelKey: "hardware",
    icon: Cpu,
    exact: true,
  },
  {
    id: "technical-services",
    href: "/servicios-tecnicos",
    labelKey: "technicalServices",
    icon: Wrench,
    exact: true,
  },
  {
    id: "remote-support",
    href: "/soporte-remoto",
    labelKey: "remoteSupport",
    icon: MonitorCog,
    exact: true,
  },
  {
    id: "plans-promotions",
    href: "/planes-promociones",
    labelKey: "plansPromotions",
    icon: BadgePercent,
    exact: true,
  },
  {
    id: "help-center",
    href: "/centro-de-ayuda",
    labelKey: "helpCenter",
    icon: CircleHelp,
    exact: true,
  },
  {
    id: "contact",
    href: "/contacto",
    labelKey: "contact",
    icon: Mail,
    exact: true,
  },
] as const;

export const LOGIN_ROUTE = {
  id: "sign-in",
  href: "/iniciar-sesion",
  labelKey: "signIn",
} as const;

export const NAVIGATION_LAYOUT = {
  desktopBreakpoint: 1280,
  collapsedItemSize: 52,
  expandedItemWidth: 160,
  itemGap: 6,
  containerPadding: 6,
} as const;