import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The harness reads and writes investigation folders on local disk.
  serverExternalPackages: [],
  poweredByHeader: false,
};

export default nextConfig;
