import type { Metadata, Viewport } from 'next';
import { Inter, Orbitron } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations, getMessages } from 'next-intl/server';
import '../globals.css';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import BottomTabBar from '@/components/layout/BottomTabBar';
import AuthInit from '@/components/providers/AuthInit';

const inter = Inter({ subsets: ['latin', 'latin-ext'] });
const orbitron = Orbitron({ subsets: ['latin'], weight: ['400', '700', '900'] });

type Props = { children: React.ReactNode; params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'home' });
  return {
    title: 'CyberArena Hub — Kompyuter klub platformasi',
    description: t('heroSubtitle'),
    manifest: '/manifest.json',
    appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'CyberArena' },
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
            __html: `(function(){try{var t=localStorage.getItem('cyber-zone-theme');if(t==='halloween'||t==='night'||t==='dark'){document.documentElement.dataset.theme=t;}}catch(e){}document.documentElement.style.colorScheme='dark';})();`,
          }}
        />
      </head>
      <body
        className={`${inter.className} antialiased min-h-screen flex flex-col`}
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AuthInit />
          <Header />
          <main className="flex-1 pb-20 md:pb-0">{children}</main>
          <Footer />
          <BottomTabBar />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}