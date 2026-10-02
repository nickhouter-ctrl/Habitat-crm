'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Vernieuw de opgeslagen conversatiestatus wanneer deze pagina zichtbaar is. */
export function FollowupLive() {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible' && !document.querySelector('input:focus,textarea:focus,select:focus,[role="dialog"]')) router.refresh(); };
    const interval = window.setInterval(refresh, 60000);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', refresh); };
  }, [router]);
  return null;
}
