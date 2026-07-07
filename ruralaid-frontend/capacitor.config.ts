import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ruralaid.app',
  appName: 'RuralHealthConnect',
  webDir: 'build',
  android: {
    allowMixedContent: true,
    backgroundColor: '#f0fff4',
    // Enable geolocation in WebView
    useLegacyBridge: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#2d6a4f',
      showSpinner: false,
    },
  },
};

export default config;
