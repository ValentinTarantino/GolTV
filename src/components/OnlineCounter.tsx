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
  // Site-wide presence is only shown to the admin; regular visitors are
  // counted server-side from their ambient API traffic.
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { isAdmin?: boolean } | null) => {
        if (!cancelled && data?.isAdmin) setIsAdmin(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // The counter is admin-only, so only admins pay for the poll; everyone
  // else's presence is registered server-side from ambient traffic.
  useEffect(() => {
    if (!isAdmin) return;

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
