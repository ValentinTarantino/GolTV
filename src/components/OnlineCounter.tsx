"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, Users, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import AdminPanel from "@/components/admin/AdminPanel";

// One tiny JSON every 30s per visitor — the count only needs to feel live,
// and /api/presence is a single countDocuments on an indexed field.
const POLL_MS = 30_000;

/**
 * Floating bottom-right counter of everyone currently on the site. Admin-only:
 * regular visitors never see it and never poll /api/presence.
 * Viewers are registered server-side from ambient API traffic; this only
 * reads the total. Clicking it opens a small menu; "Panel admin" opens the
 * admin panel in an overlay on top of the current page — no navigation.
 */
export default function OnlineCounter() {
  const { t } = useLanguage();
  const isAdmin = useIsAdmin();
  const [count, setCount] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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

  // Close the dropdown / panel on outside click / Escape.
  useEffect(() => {
    if (!menuOpen && !panelOpen) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setPanelOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setPanelOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, panelOpen]);

  if (!isAdmin || count === null) return null;

  return (
    <div ref={rootRef} className="fixed bottom-3 right-3 z-40 sm:bottom-4 sm:right-4">
      {menuOpen && !panelOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-52 border-2 border-white bg-black shadow-badge">
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setPanelOpen(true);
            }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[11px] font-black uppercase tracking-wider text-white hover:bg-accent-primary hover:text-black"
          >
            <Users size={13} strokeWidth={3} />
            Panel admin
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        className="flex select-none items-center gap-1.5 border-2 border-white bg-black px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white transition-transform hover:-translate-y-0.5"
        title={t.watch.viewers}
      >
        <Eye size={12} strokeWidth={3} className="text-accent-primary" />
        <span className="tabular-nums">{count}</span>
        <span className="hidden sm:inline">{t.watch.viewers}</span>
      </button>

      {panelOpen && (
        <div className="absolute bottom-full right-0 z-50 mb-2 flex max-h-[70vh] w-[min(92vw,400px)] flex-col border-2 border-white bg-black shadow-badge">
          <div className="flex shrink-0 items-center justify-between border-b border-white/20 px-3 py-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
              Admin · {count} {t.watch.viewers}
            </span>
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              className="flex items-center gap-1 border border-white/40 px-2 py-0.5 text-[10px] font-black uppercase text-white transition-colors hover:bg-accent-primary hover:text-black"
              aria-label="Close admin panel"
            >
              <X size={11} strokeWidth={3} />
              Esc
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <AdminPanel compact onClose={() => setPanelOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
