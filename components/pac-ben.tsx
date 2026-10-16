'use client';

import { useEffect, useRef } from 'react';
import { startPacBen } from '@/lib/main.ts';

/** The whole game lives on one canvas; React only gives it somewhere to sit. */
export function PacBenGame({ font }: { font: string }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current) return;
    const params = new URLSearchParams(window.location.search);
    const level = Number(params.get('level')) || undefined;
    return startPacBen(host.current, { font, level });
  }, [font]);

  return <div ref={host} className="game" />;
}
