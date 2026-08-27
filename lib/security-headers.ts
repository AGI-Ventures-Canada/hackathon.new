export const SECURITY_HEADERS = {
  source: "/:path*",
  headers: [
    {
      key: "Content-Security-Policy",
      value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
    { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  ],
}
