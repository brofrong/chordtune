import { androidAssetLinks } from '@/lib/well-known';

// Env-gated and read per request, not baked into the static build output.
export const dynamic = 'force-dynamic';

/** Lets the Android app use passkeys of this domain. Read at request time from the server env. */
export function GET() {
  const payload = androidAssetLinks(process.env.ANDROID_CERT_SHA256);
  if (!payload) {
    return new Response('Not found', { status: 404 });
  }
  return Response.json(payload);
}
