import type { NextConfig } from 'next';

const internalApiOrigin =
  process.env.INTERNAL_API_ORIGIN ?? 'http://127.0.0.1:4100';

const nextConfig: NextConfig = {
  transpilePackages: ['@glitter-atlas/shared'],
  async rewrites() {
    return [
      {
        source: '/favicon.ico',
        destination: `${internalApiOrigin}/favicon.ico`,
      },
      {
        source: '/robots.txt',
        destination: `${internalApiOrigin}/robots.txt`,
      },
      {
        source: '/sitemap.xml',
        destination: `${internalApiOrigin}/sitemap.xml`,
      },
      {
        source: '/site.webmanifest',
        destination: `${internalApiOrigin}/site.webmanifest`,
      },
      {
        source: '/og/default.png',
        destination: `${internalApiOrigin}/og/default.png`,
      },
      {
        source: '/api/:path*',
        destination: `${internalApiOrigin}/:path*`,
      },
    ];
  },
};

export default nextConfig;
