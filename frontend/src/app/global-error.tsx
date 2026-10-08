'use client';

/**
 * GLOBAL ERROR BOUNDARY — ildiz layout ichidagi favqulodda xatolar uchun.
 * Next.js talabi: `global-error` kerak bo'lsa html/body ni O'ZI yozadi
 * (chunki faqatgina shu komponent ishga tushadi — root layout almashtiriladi).
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="uz" className="dark" data-theme="obsidian">
      <body className="min-h-screen bg-[#0a0e17] text-gray-100 antialiased">
        <div className="min-h-screen grid place-items-center px-4">
          <div className="rounded-2xl border border-cyber-700 bg-cyber-900/60 p-8 text-center max-w-md w-full">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-red-500/10 border border-red-500/25 grid place-items-center mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h1 className="text-xl font-bold mb-2">Kutilmagan xatolik</h1>
            <p className="text-sm text-gray-400 mb-6 leading-relaxed">
              Sahifa yuklanishida jiddiy muammo aniqlandi. Quyidagi tugmani bosib qayta urinib ko&apos;ring.
            </p>
            <button
              onClick={reset}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-[#0b1322] bg-[#00f0ff] hover:bg-[#39f4ff] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              Qayta urinish
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}