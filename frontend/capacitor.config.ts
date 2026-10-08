import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Cyber-ZONE Android APK — Capacitor WebView qobig'i.
 *
 * Ilova HOSTED saytni yuklaydi (server.url). Sabab: Next.js (next-intl bilan)
 * statik export'ni osonlikcha bermaydi; buning o'rniga WebView real Vercel
 * domenini ochadi — API/CORS/avtorizatsiya BIR XIL ishlaydi, WebAuthn/passkey
 * esa brauzerda qoladi (WebView'da platform authenticator yo'q).
 *
 * Kamera (yuz tekshiruvi) uchun `android/app/src/main/AndroidManifest.xml` da
 * CAMERA ruxsati e'lon qilingan (qo'lda funksiya ichida ishlaydi).
 */
const config: CapacitorConfig = {
  appId: 'uz.cyberzone.app',
  appName: 'Cyber-ZONE',
  webDir: 'out',
  server: {
    url: 'https://frontend-six-bay-25.vercel.app',
    androidScheme: 'https',
    cleartext: false,
    allowNavigation: ['frontend-six-bay-25.vercel.app'],
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      launchAutoHide: true,
      backgroundColor: '#0A0B0B',
      showSpinner: false,
    },
  },
};

export default config;