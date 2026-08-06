import type { NextConfig } from "next";

import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const isProduction =
  process.env.NODE_ENV === "production";

const contentSecurityPolicy = [
  "default-src 'self'",

  [
    "script-src 'self' 'unsafe-inline'",
    isProduction
      ? ""
      : "'unsafe-eval'",
  ]
    .filter(Boolean)
    .join(" "),

  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",

  [
    "connect-src 'self'",
    isProduction
      ? ""
      : "ws: wss:",
  ]
    .filter(Boolean)
    .join(" "),

  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",

  isProduction
    ? "upgrade-insecure-requests"
    : "",
]
  .filter(Boolean)
  .join("; ");

const securityHeaders = [
  {
    key:
      "Content-Security-Policy",

    value:
      contentSecurityPolicy,
  },
  {
    key:
      "Permissions-Policy",

    value: [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "payment=()",
      "usb=()",
      "browsing-topics=()",
    ].join(", "),
  },
  {
    key:
      "Referrer-Policy",

    value:
      "strict-origin-when-cross-origin",
  },
  {
    key:
      "X-Content-Type-Options",

    value:
      "nosniff",
  },
  {
    key:
      "X-DNS-Prefetch-Control",

    value:
      "off",
  },
  {
    key:
      "X-Frame-Options",

    value:
      "DENY",
  },
  ...(isProduction
    ? [
        {
          key:
            "Strict-Transport-Security",

          value:
            "max-age=31536000",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader:
    false,

  reactStrictMode:
    true,

  productionBrowserSourceMaps:
    false,

  async headers() {
    return [
      {
        source:
          "/(.*)",

        headers:
          securityHeaders,
      },
    ];
  },
};

export default withNextIntl(
  nextConfig,
);