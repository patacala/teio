import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  // Visual regression tests build into their own directory (see playwright.config.ts).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  transpilePackages: ['@crm/shared'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
  async rewrites() {
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
    return [
      {
        source: '/api/:path*',
        destination: `${apiBase.replace(/\/api\/?$/, '')}/:path*`,
      },
    ];
  },
};

export default nextConfig;
