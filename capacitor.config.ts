import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.superessence.magnetwar',
  appName: 'MAGNET WAR',
  webDir: 'dist',
  backgroundColor: '#000000',
  android: {
    backgroundColor: '#000000',
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
