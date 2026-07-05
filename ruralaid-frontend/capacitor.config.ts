import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ruralaid.app',
  appName: 'RuralHealthConnect',
  webDir: 'build',
  server: {
    // For production, remove this and use the built files
    // androidScheme: 'https',
  },
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
  },
};

export default config;
