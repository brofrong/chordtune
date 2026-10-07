import { describe, expect, test } from 'bun:test';

import { androidAssetLinks, appleAppSiteAssociation } from './well-known';

describe('appleAppSiteAssociation', () => {
  test('null without a team id', () => {
    expect(appleAppSiteAssociation(undefined)).toBeNull();
  });

  test('scopes the app id to the configured team', () => {
    expect(appleAppSiteAssociation('ABCDE12345')).toEqual({
      webcredentials: { apps: ['ABCDE12345.app.chordtune'] },
    });
  });
});

describe('androidAssetLinks', () => {
  test('null without a certificate fingerprint', () => {
    expect(androidAssetLinks(undefined)).toBeNull();
  });

  test('upper-cases the fingerprint and targets the app package', () => {
    expect(androidAssetLinks('aa:bb:cc')).toEqual([
      {
        relation: ['delegate_permission/common.get_login_creds'],
        target: {
          namespace: 'android_app',
          package_name: 'app.chordtune',
          sha256_cert_fingerprints: ['AA:BB:CC'],
        },
      },
    ]);
  });
});
