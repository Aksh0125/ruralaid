import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ruralaid.app',
  appName: 'RuralHealthConnect',
  webDir: 'build',
  android: {
    allowMixedContent: true,
    backgroundColor: '#f0fff4',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#2d6a4f',
      showSpinner: false,
    },
    Geolocation: {
      permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION'],
    },
  },
};

export default config;
