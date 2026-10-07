/**
 * Payload for `/.well-known/apple-app-site-association`, which lets the iOS app use passkeys of
 * this domain. `null` when the project has no paid Apple Developer account configured.
 */
export function appleAppSiteAssociation(appleTeamId: string | undefined) {
  if (!appleTeamId) {
    return null;
  }
  return { webcredentials: { apps: [`${appleTeamId}.app.chordtune`] } };
}

/**
 * Payload for `/.well-known/assetlinks.json`, which lets the Android app use passkeys of this
 * domain. `null` when the project has no signing certificate fingerprint configured.
 */
export function androidAssetLinks(sha256CertFingerprint: string | undefined) {
  if (!sha256CertFingerprint) {
    return null;
  }
  return [
    {
      relation: ['delegate_permission/common.get_login_creds'],
      target: {
        namespace: 'android_app',
        package_name: 'app.chordtune',
        sha256_cert_fingerprints: [sha256CertFingerprint.toUpperCase()],
      },
    },
  ];
}
