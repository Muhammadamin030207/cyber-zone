'use client';

import { useEffect, useState } from 'react';

/**
 * Halloween dekoratsiyasi — faqat [data-theme="halloween"] rejimida ko'rinadi.
 * Tepada uchuvchi ko'rshapalaklar, qovoqchalar, burchaklardagi to'rlar va
 * o'rgimcha. Elementlar faqat CSS orqali animatsiyalanadi.
 */
export default function HalloweenDecor() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const check = () => setActive(document.documentElement.getAttribute('data-theme') === 'halloween');
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  if (!active) return null;

  return (
    <div className="halloween-decor" aria-hidden="true">
      <span className="hd-item hd-bat">🦇</span>
      <span className="hd-item hd-bat hd-bat--2">🦇</span>
      <span className="hd-item hd-bat hd-bat--3">🦇</span>
      <span className="hd-item hd-bat hd-bat--4">🕸</span>
      <span className="hd-item hd-pumpkin">🎃</span>
      <span className="hd-item hd-pumpkin hd-pumpkin--2">🎃</span>
      <span className="hd-item hd-pumpkin hd-pumpkin--3">🎃</span>
      <span className="hd-item hd-spider">🕷️</span>
      <span className="hd-item hd-spider hd-spider--2">🕷️</span>
      <span className="hd-cobweb hd-cobweb--tl"><span>🕸</span></span>
      <span className="hd-cobweb hd-cobweb--tr"><span>🕸</span></span>
      <span className="hd-cobweb hd-cobweb--bl"><span>🕸</span></span>
      <span className="hd-cobweb hd-cobweb--br"><span>🕸</span></span>
    </div>
  );
}