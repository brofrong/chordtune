import type { MetadataRoute } from 'next';

// The Capacitor build is a static export, which only accepts static route handlers.
export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ChordTune',
    short_name: 'ChordTune',
    description: 'Тюнер и песни с аккордами для гитаристов',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b0d17',
    theme_color: '#0b0d17',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      // The artwork sits inside the central safe zone, so the same file works under a mask.
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
