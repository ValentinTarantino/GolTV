"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

export default function KickoffCountdown({ timestamp }: { timestamp: number }) {
  const { t } = useLanguage();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const diff = Math.max(0, timestamp - now);
  const pad = (n: number) => String(n).padStart(2, "0");

  if (diff <= 0) {
    return (
      <p className="text-sm sm:text-base font-black uppercase text-accent-primary animate-pulse">
        {t.watch.kickoffNow}
      </p>
    );
  }

  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;
  const time =
    days > 0
      ? `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
      : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

  return (
    <div className="flex flex-col items-center gap-1">
      <p className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-text-muted">
        {t.watch.kickoffIn}
      </p>
      <p className="text-2xl sm:text-4xl font-black tabular-nums text-white border-2 border-white bg-black px-3 sm:px-5 py-1 sm:py-2 shadow-[4px_4px_0px_0px_#a3e635]">
        {time}
      </p>
    </div>
  );
}
