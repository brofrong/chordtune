import { appleAppSiteAssociation } from '@/lib/well-known';

// Env-gated and read per request, not baked into the static build output.
export const dynamic = 'force-dynamic';

/** Lets the iOS app use passkeys of this domain. Read at request time from the server env. */
export function GET() {
  const payload = appleAppSiteAssociation(process.env.APPLE_TEAM_ID);
  if (!payload) {
    return new Response('Not found', { status: 404 });
  }
  return Response.json(payload);
}
