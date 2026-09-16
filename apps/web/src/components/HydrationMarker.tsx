'use client';

import { useEffect } from 'react';

/**
 * Marks that React hydrated successfully. The inline boot sentinel in
 * layout.tsx watches for this flag and surfaces a red on-screen bar when
 * the app never comes alive (stale cached chunks, blocked scripts, or a
 * runtime crash in an old webview) — turning invisible failures into a
 * message the user can actually see and act on.
 */
export default function HydrationMarker() {
  useEffect(() => {
    (window as unknown as { __lumen_hydrated?: boolean }).__lumen_hydrated = true;
    const bar = document.getElementById('lumen-boot-bar');
    if (bar) bar.remove();
  }, []);
  return null;
}
