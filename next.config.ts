import type { NextConfig } from "next";

// Baseline security headers. The Content-Security-Policy is set per request in src/middleware.ts
// (it needs a fresh nonce each time) and is currently REPORT-ONLY. See docs/SECURITY.md.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The opening-debts import reads this file from disk. Next.js only ships files it can see being imported, so
  // without this line the import would work on your PC and fail once deployed.
  outputFileTracingIncludes: {
    "/debts/import": ["./supabase/seed/opening-debts.json"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
