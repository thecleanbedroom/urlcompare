import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['shared-types', 'shared-logic'],
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  experimental: {
    // Enable experimental features if needed
  },
};

export default nextConfig;
