"use client";

import { useEffect, useState } from "react";
import { BANNED_HEADER } from "@/lib/viewer-id";

const banListeners = new Set<() => void>();
let fetchPatched = false;

/**
 * Wraps window.fetch once so any API response carrying the ban header
 * (`x-goltv-banned: 1`, set by routes that reject banned IPs) flips the UI
 * into the banned screen. Runs at module load — before any component effect
 * — so the very first request of the session is already watched. No polling:
 * the ban is discovered on traffic the site already generates.
 */
function patchFetch(): void {
  if (fetchPatched || typeof window === "undefined") return;
  fetchPatched = true;
  const original = window.fetch.bind(window);
  window.fetch = (async (...args: Parameters<typeof fetch>) => {
    const res = await original(...args);
    if (res.headers.get(BANNED_HEADER) === "1") {
      for (const listener of banListeners) listener();
    }
    return res;
  }) as typeof fetch;
}

patchFetch();

export default function BanGate() {
  const [isBanned, setIsBanned] = useState(false);

  useEffect(() => {
    const onBan = () => setIsBanned(true);
    banListeners.add(onBan);
    return () => {
      banListeners.delete(onBan);
    };
  }, []);

  if (!isBanned) return null;

  return (
    <div className="fixed inset-0 bg-black z-[9999] flex items-center justify-center">
      <div className="text-center p-8">
        <h1 className="text-4xl font-bold text-red-600 mb-4">ACCESO DENEGADO</h1>
        <p className="text-white text-lg">Tu IP ha sido baneada del sitio.</p>
        <p className="text-gray-400 text-sm mt-2">Si crees que es un error, contacta al administrador.</p>
      </div>
    </div>
  );
}
