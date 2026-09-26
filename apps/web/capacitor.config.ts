import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.chordtune',
  appName: 'ChordTune',
  webDir: 'out',
  backgroundColor: '#15171c',
  ios: {
    contentInset: 'never',
  },
};

export default config;
