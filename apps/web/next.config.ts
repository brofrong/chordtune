import { join } from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

import { INTERNAL_API_URL, resolveApiUrl } from './src/lib/api';

try {
  process.loadEnvFile('../../.env');
} catch {
  // env comes from the environment in CI and production
}

const buildTarget = process.env.BUILD_TARGET === 'capacitor' ? 'capacitor' : 'web';

// Fail the build, not the installed app, when the Capacitor API address is missing or malformed.
if (buildTarget === 'capacitor') {
  resolveApiUrl({
    target: 'capacitor',
    browserOrigin: null,
    publicApiUrl: process.env.NEXT_PUBLIC_API_URL,
  });
}

const nextConfig: NextConfig = {
  reactCompiler: true,
  // `page.web.tsx` files are server-rendered pages that only exist in the web build; the static
  // Capacitor export has no per-song routes and uses `/song?id=` instead.
  pageExtensions: buildTarget === 'web' ? ['web.tsx', 'tsx', 'ts'] : ['tsx', 'ts'],
  transpilePackages: ['@chordtune/audio', '@chordtune/chord-sheet'],
  env: {
    NEXT_PUBLIC_BUILD_TARGET: buildTarget,
  },
  ...(buildTarget === 'capacitor'
    ? {
        output: 'export',
        // Capacitor serves files as-is, so `/ru/` must resolve to `ru/index.html`.
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {
        // The Docker image runs the standalone server; tracing from the repository root picks up
        // the workspace packages.
        output: 'standalone',
        outputFileTracingRoot: join(import.meta.dirname, '../..'),
        // The browser talks to its own origin and Next forwards API calls to the API next to it.
        rewrites: async () => [
          { source: '/trpc/:path*', destination: `${INTERNAL_API_URL}/trpc/:path*` },
          { source: '/api/auth/:path*', destination: `${INTERNAL_API_URL}/api/auth/:path*` },
        ],
      }),
};

export default createNextIntlPlugin('./src/i18n/request.ts')(nextConfig);
