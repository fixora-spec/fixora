import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["es", "en"],

  defaultLocale: "es",

  localePrefix: "as-needed",

  localeDetection: false,

  pathnames: {
    "/": "/",

    "/sobre-fixora": {
      es: "/sobre-fixora",
      en: "/about-fixora",
    },

    "/recursos-graficos": {
      es: "/recursos-graficos",
      en: "/graphic-resources",
    },

    "/software-licencias": {
      es: "/software-licencias",
      en: "/software-and-licenses",
    },

    "/hardware": "/hardware",

    "/servicios-tecnicos": {
      es: "/servicios-tecnicos",
      en: "/technical-services",
    },

    "/soporte-remoto": {
      es: "/soporte-remoto",
      en: "/remote-support",
    },

    "/planes-promociones": {
      es: "/planes-promociones",
      en: "/plans-and-promotions",
    },

    "/centro-de-ayuda": {
      es: "/centro-de-ayuda",
      en: "/help-center",
    },

    "/contacto": {
      es: "/contacto",
      en: "/contact",
    },

    "/iniciar-sesion": {
      es: "/iniciar-sesion",
      en: "/sign-in",
    },
  },
});