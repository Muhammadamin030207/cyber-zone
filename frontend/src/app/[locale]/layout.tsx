import type { Metadata, Viewport } from 'next';
import { Inter, Orbitron } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations, getMessages } from 'next-intl/server';
import '../globals.css';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import BottomTabBar from '@/components/layout/BottomTabBar';
import PageTransition from '@/components/layout/PageTransition';
import AuthInit from '@/components/providers/AuthInit';
import HalloweenDecor from '@/components/layout/HalloweenDecor';
import ChatWidget from '@/components/layout/ChatWidget';
import ToastContainer from '@/components/ui/ToastContainer';

const inter = Inter({ subsets: ['latin', 'latin-ext'] });
const orbitron = Orbitron({ subsets: ['latin'], weight: ['400', '700', '900'] });

type Props = { children: React.ReactNode; params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'home' });
  return {
    title: 'Cyber-ZONE — Kompyuter klub platformasi',
    description: t('heroSubtitle'),
    manifest: '/manifest.json',
    appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Cyber-ZONE' },
    icons: {
      icon: [
        { url: '/icons/icon-192.png', type: 'image/png', sizes: '192x192' },
        { url: '/icons/icon-512.png', type: 'image/png', sizes: '512x512' },
        { url: '/icons/icon-512.svg', type: 'image/svg+xml' },
      ],
      apple: [{ url: '/icons/apple-touch-icon.png', type: 'image/png', sizes: '180x180' }],
    },
    openGraph: {
      title: 'Cyber-ZONE — Kompyuter klub platformasi',
      description: t('heroSubtitle'),
      type: 'website',
    },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#0a0a0c',
};

export async function generateStaticParams() {
  return [{ locale: 'uz' }, { locale: 'ru' }, { locale: 'en' }];
}

export default async function RootLayout({ children, params }: Props) {
  const { locale } = await params;
  const messages = await getMessages();

  return (
    <html lang={locale} className="dark" data-theme="obsidian" suppressHydrationWarning>
      <head>
        <style>{`
          :root {
            --font-orbitron: ${orbitron.style.fontFamily};
            --font-inter: ${inter.style.fontFamily};
          }
        `}</style>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('cyber-zone-theme')||localStorage.getItem('cyber-arena-theme')||'obsidian';var all=['obsidian','midnight','cyberpunk','aurora','halloween'];if(all.indexOf(t)===-1)t='obsidian';document.documentElement.dataset.theme=t;}catch(e){}document.documentElement.style.colorScheme='dark';})();`,
          }}
        />
        <link rel="dns-prefetch" href="https://accounts.google.com" />
        <link rel="preconnect" href="https://accounts.google.com" crossOrigin="" />
        <link rel="preconnect" href="https://apis.google.com" crossOrigin="" />
        <link rel="dns-prefetch" href="https://www.gstatic.com" />
        <link rel="preconnect" href="https://www.gstatic.com" crossOrigin="" />
        <script src="https://accounts.google.com/gsi/client" async defer />
      </head>
      <body
        className={`${inter.className} antialiased min-h-screen flex flex-col`}
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AuthInit />
          <HalloweenDecor />
          <Header />
          <PageTransition>{children}</PageTransition>
          <Footer />
          <BottomTabBar />
          <ChatWidget />
          <ToastContainer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}