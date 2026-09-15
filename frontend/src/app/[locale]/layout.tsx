import type { Metadata } from 'next';
import { Inter, Orbitron } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations, getMessages } from 'next-intl/server';
import '../globals.css';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import ChatWidget from '@/components/layout/ChatWidget';
import AuthInit from '@/components/providers/AuthInit';

const inter = Inter({ subsets: ['latin', 'latin-ext'] });
const orbitron = Orbitron({ subsets: ['latin'], weight: ['400', '700', '900'] });

type Props = { children: React.ReactNode; params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'home' });
  return {
    title: 'Cyber-ZONE — Kompyuter xonalar platformasi',
    description: t('heroSubtitle'),
  };
}

export async function generateStaticParams() {
  return [{ locale: 'uz' }, { locale: 'ru' }, { locale: 'en' }];
}

export default async function RootLayout({ children, params }: Props) {
  const { locale } = await params;
  const messages = await getMessages();

  return (
    <html lang={locale}>
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
          <main className="flex-1 grid-matrix">{children}</main>
          <Footer />
          <ChatWidget />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}