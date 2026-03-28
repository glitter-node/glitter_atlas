import type { NextConfig } from 'next';

const internalApiOrigin =
  process.env.INTERNAL_API_ORIGIN ?? 'http://127.0.0.1:4100';

const nextConfig: NextConfig = {
  transpilePackages: ['@glitter-atlas/shared'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${internalApiOrigin}/:path*`,
      },
    ];
  },
};

export default nextConfig;
