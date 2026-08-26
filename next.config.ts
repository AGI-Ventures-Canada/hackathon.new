import type { NextConfig } from "next"
import { withWorkflow } from "workflow/next"
import { createMDX } from "fumadocs-mdx/next"
import {
  createWebMcpOriginTrialHeaderRule,
  getWebMcpOriginTrialRegistration,
  hasWebMcpOriginTrialConfiguration,
} from "./lib/webmcp/origin-trial"

const hasConfiguredWebMcpToken = hasWebMcpOriginTrialConfiguration()
const webMcpOriginTrial = getWebMcpOriginTrialRegistration()

if (hasConfiguredWebMcpToken && !webMcpOriginTrial) {
  throw new Error("WEBMCP_ORIGIN_TRIAL_TOKEN is malformed, expired, or not a WebMCP token.")
}

if (webMcpOriginTrial?.renewalDue) {
  throw new Error("WEBMCP_ORIGIN_TRIAL_TOKEN expires within 30 days. Renew it before deploying.")
}

const nextConfig: NextConfig = {
  skipTrailingSlashRedirect: true,
  env: {
    NEXT_PUBLIC_APP_URL:
      process.env.NEXT_PUBLIC_APP_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"),
  },
  serverExternalPackages: [
    "workflow",
    "@workflow/ai",
    "@daytonaio/sdk",
    "ai",
    "zod",
    "@react-email/components",
    "@react-email/render",
    "@react-pdf/renderer",
  ],
  async headers() {
    if (!webMcpOriginTrial) return []
    return [createWebMcpOriginTrialHeaderRule(webMcpOriginTrial)]
  },
  async rewrites() {
    return [
      {
        source: "/docs/:path*.mdx",
        destination: "/llms.mdx/docs/:path*",
      },
      {
        source: "/t/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/t/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ]
  },
  images: {
    dangerouslyAllowLocalIP: process.env.NODE_ENV === "development",
    remotePatterns: [
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "54321",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "54321",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "img.clerk.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
}

const withMDX = createMDX()

export default withWorkflow(withMDX(nextConfig))
