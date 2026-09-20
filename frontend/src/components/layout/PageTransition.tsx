'use client';

import { usePathname } from 'next/navigation';

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <main key={pathname} className="page-enter flex-1">
      {children}
    </main>
  );
}