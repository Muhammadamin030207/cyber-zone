'use client';

import TopBanner from '@/components/home/TopBanner';
import HeroZone from '@/components/home/HeroZone';
import HomeSections from '@/components/home/HomeSections';

/**
 * Bosh sahifa — topda yangilik/reklama banneri + CYBER-ZONE hero, pastida
 * statistika / qanday ishlaydi / zonalar / yangiliklar / CTA bo'limlari.
 * Global Header/Footer layout'da turadi; bu yerda faqat mazmun.
 */
export default function HomePage() {
  return (
    <div className="min-h-[calc(100dvh-8rem)] flex flex-col">
      <TopBanner />
      <HeroZone />
      <HomeSections />
    </div>
  );
}