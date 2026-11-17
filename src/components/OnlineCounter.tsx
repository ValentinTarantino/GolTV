"use client";

import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const POLL_MS = 10_000;

/**
 * Floating bottom-right counter of everyone currently on the site. It reads
 * the same presence feed the admin panel uses, so it works on every page.
 */
export default function OnlineCounter() {
  const { t } = useLanguage();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/presence", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && typeof data.count === "number") setCount(data.count);
      } catch {
        // transient error — keep the last count
      }
    };

    void poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (count === null) return null;

  return (
    <div
      className="fixed bottom-3 right-3 z-40 flex items-center gap-1.5 border-2 border-white bg-black px-3 py-1.5 text-xs font-black uppercase tracking-wider text-white shadow-brutal"
      title={t.watch.viewers}
    >
      <Eye size={13} strokeWidth={3} className="text-accent-primary" />
      <span>{count}</span>
      <span className="hidden sm:inline">{t.watch.viewers}</span>
    </div>
  );
}
