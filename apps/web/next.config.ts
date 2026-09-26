import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Next.js evaluates `rewrites()` when the config is loaded at **build** time for
 * standalone output. The rewrite destination is therefore baked into the image.
 * Pass `API_INTERNAL_URL` as a Docker build-arg (and matching runtime ENV for
 * clarity). Local `next dev` still reads the env at process start.
 *
 * Compose default: http://api:4000
 * Host-side next dev: http://localhost:48080
 */
const apiInternalUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:48080';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Monorepo: trace files from the repo root so workspace packages resolve.
  outputFileTracingRoot: path.join(configDir, '../..'),
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiInternalUrl}/api/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
