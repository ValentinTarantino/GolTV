"use client";

import { useEffect, useState } from "react";

const BAN_CHECK_INTERVAL = 5000; // Check every 5 seconds

export default function BanChecker() {
  const [isBanned, setIsBanned] = useState(false);

  useEffect(() => {
    const checkBan = async () => {
      try {
        const res = await fetch("/api/admin/ban-check", { cache: "no-store" });
        const data = await res.json();
        if (data.banned) {
          setIsBanned(true);
        }
      } catch {
        // Ignore errors - don't block on network issues
      }
    };

    // Check immediately
    checkBan();

    // Then poll periodically
    const interval = setInterval(checkBan, BAN_CHECK_INTERVAL);
    return () => clearInterval(interval);
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
