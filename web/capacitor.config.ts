import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'io.github.d4rkninja.ledgerly',
  appName: 'Ledgerly',
  webDir: 'dist',
  backgroundColor: '#f3f5f1',
  loggingBehavior: 'debug',
  android: {
    path: '../applications/android',
    backgroundColor: '#f3f5f1',
    allowMixedContent: true,
    captureInput: false,
    webContentsDebuggingEnabled: true,
    useLegacyBridge: false,
  },
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  plugins: {
    SystemBars: {
      style: 'DEFAULT',
      hidden: false,
      insetsHandling: 'css',
    },
    SplashScreen: {
      launchAutoHide: false,
      launchFadeOutDuration: 180,
      backgroundColor: '#f3f5f1',
      androidScaleType: 'CENTER_INSIDE',
      showSpinner: false,
    },
    Keyboard: {
      resize: 'native',
      resizeOnFullScreen: true,
    },
  },
}

export default config
