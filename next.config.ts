import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The harness reads and writes investigation folders on local disk.
  serverExternalPackages: [],
  poweredByHeader: false,
  // Keep the dev badge out of screen recordings.
  devIndicators: false,
};

export default nextConfig;
