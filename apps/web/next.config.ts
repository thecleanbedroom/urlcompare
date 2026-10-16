import type { NextConfig } from "next";

const apiUrl = process.env.API_URL ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['shared-types', 'shared-logic'],
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${apiUrl}/api/:path*` },
    ];
  },
  reactStrictMode: false,
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  experimental: {
    // Enable experimental features if needed
  },
};

export default nextConfig;
