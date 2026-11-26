"use client";

import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";

// One tiny JSON every 30s per visitor — the count only needs to feel live,
// and /api/presence is a single countDocuments on an indexed field.
const POLL_MS = 30_000;

/**
 * Floating bottom-right counter of everyone currently on the site. Admin-only:
 * regular visitors never see it and never poll /api/presence.
 * Viewers are registered server-side from ambient API traffic; this only
 * reads the total.
 */
export default function OnlineCounter() {
  const { t } = useLanguage();
  const isAdmin = useIsAdmin();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let hidden = false;

    const onVisibility = () => {
      hidden = document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibility);

    const poll = async () => {
      if (hidden) {
        timer = setTimeout(poll, POLL_MS);
        return;
      }
      try {
        const res = await fetch("/api/presence", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && typeof data.count === "number") setCount(data.count);
        }
      } catch {
        // transient error — keep the last count
      } finally {
        if (!cancelled) timer = setTimeout(poll, POLL_MS);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isAdmin]);

  if (!isAdmin || count === null) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-3 right-3 z-40 flex select-none items-center gap-1.5 border-2 border-white bg-black px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white sm:bottom-4 sm:right-4"
      title={t.watch.viewers}
    >
      <Eye size={12} strokeWidth={3} className="text-accent-primary" />
      <span className="tabular-nums">{count}</span>
      <span className="hidden sm:inline">{t.watch.viewers}</span>
    </div>
  );
}
