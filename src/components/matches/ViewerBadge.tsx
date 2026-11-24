"use client";

import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const COUNT_POLL_MS = 15_000;

interface ViewerBadgeProps {
  matchId: string;
  /** Only poll while true (e.g. the match is viewable/live). */
  active?: boolean;
}

/**
 * Admin-only viewer counter. Viewers are registered server-side from ambient
 * traffic (chat polls and playlist reloads carrying the viewer cookie), so
 * this component only reads the count — and only for admins.
 */
export default function ViewerBadge({ matchId, active = true }: ViewerBadgeProps) {
  const { t } = useLanguage();
  const [count, setCount] = useState<number | null>(null);
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

  useEffect(() => {
    if (!active || !isAdmin) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const res = await fetch(`/api/viewers?matchId=${matchId}`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && typeof data.count === "number") setCount(data.count);
        }
      } catch {
        // transient network error — keep the last known count
      } finally {
        if (!cancelled) timer = setTimeout(poll, COUNT_POLL_MS);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [matchId, active, isAdmin]);

  if (!active || !isAdmin || count === null) return null;

  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-black uppercase tracking-wider bg-black text-white border-2 border-white shadow-badge w-fit"
      id="viewer-badge"
      title={t.watch.viewers}
    >
      <Eye size={13} strokeWidth={3} />
      <span data-testid="viewer-count">{count}</span>
      <span className="hidden sm:inline">{t.watch.viewers}</span>
    </span>
  );
}
