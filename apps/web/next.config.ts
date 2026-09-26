import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

try {
  process.loadEnvFile('../../.env');
} catch {
  // env comes from the environment in CI and production
}

const buildTarget = process.env.BUILD_TARGET === 'capacitor' ? 'capacitor' : 'web';

const nextConfig: NextConfig = {
  reactCompiler: true,
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
    : {}),
};

export default createNextIntlPlugin('./src/i18n/request.ts')(nextConfig);
