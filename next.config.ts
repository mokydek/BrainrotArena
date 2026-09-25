import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // schema.sql is read at runtime by /api/admin/setup
  outputFileTracingIncludes: {
    "/api/admin/setup": ["./supabase/schema.sql"],
  },
};

export default nextConfig;
