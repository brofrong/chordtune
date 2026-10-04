import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.chordtune',
  appName: 'ChordTune',
  webDir: 'out',
  backgroundColor: '#15171c',
  ios: {
    contentInset: 'never',
  },
  plugins: {
    CapacitorUpdater: {
      // Our code checks /mobile/update.json on the app's own server; Capgo's cloud is not used.
      autoUpdate: 'off',
      // The plugin otherwise reports stats, crashes and JS errors to Capgo.
      statsUrl: '',
      keepUrlPathAfterReload: true,
    },
  },
};

export default config;
