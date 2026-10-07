const KEY = 'chordtune.passkey-offer-dismissed';

export function shouldOfferPasskey(params: {
  signedIn: boolean;
  supported: boolean;
  passkeyCount: number | undefined;
  dismissed: boolean;
}) {
  return params.signedIn && params.supported && params.passkeyCount === 0 && !params.dismissed;
}

export const passkeyOfferStore = {
  dismissed() {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return true;
    }
  },
  dismiss() {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      // storage can be unavailable
    }
  },
};
