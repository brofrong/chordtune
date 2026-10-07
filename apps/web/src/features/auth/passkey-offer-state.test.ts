import { describe, expect, test } from 'bun:test';

import { shouldOfferPasskey } from './passkey-offer-state';

describe('shouldOfferPasskey', () => {
  const base = { signedIn: true, supported: true, passkeyCount: 0, dismissed: false };

  test('signed in, supported, no passkeys, not dismissed', () => {
    expect(shouldOfferPasskey(base)).toBe(true);
  });

  test('any reason not to', () => {
    expect(shouldOfferPasskey({ ...base, signedIn: false })).toBe(false);
    expect(shouldOfferPasskey({ ...base, supported: false })).toBe(false);
    expect(shouldOfferPasskey({ ...base, passkeyCount: 1 })).toBe(false);
    expect(shouldOfferPasskey({ ...base, passkeyCount: undefined })).toBe(false);
    expect(shouldOfferPasskey({ ...base, dismissed: true })).toBe(false);
  });
});
