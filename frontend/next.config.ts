import type { NextConfig } from "next"

const apiOrigin = process.env.FLOWPILOT_API_ORIGIN || "http://127.0.0.1:8000"

const config: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: new URL("/api/:path*", apiOrigin).href }]
  },
}

export default config
