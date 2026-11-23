"use client";

import { useState, useEffect, useRef, useSyncExternalStore } from "react";
import { Zap, Filter, RefreshCw } from "lucide-react";
import MatchList from "@/components/matches/MatchList";
import { MatchSkeleton } from "@/components/ui/Skeleton";
import NetworkNotice from "@/components/ui/NetworkNotice";
import { LIVE_STATUSES } from "@/lib/constants";
import type { Match } from "@/lib/types";
import { useLanguage } from "@/contexts/LanguageContext";

function subscribeToHydration() {
  return () => {};
}

export default function HomePage() {
  const { language, t } = useLanguage();
  const [matches, setMatches] = useState<Match[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showLiveOnly, setShowLiveOnly] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const matchesRef = useRef<Match[]>([]);
  useEffect(() => {
    matchesRef.current = matches;
  }, [matches]);

  // Category reordering is offered only to the signed-in admin, but the order
  // itself is stored server-side, so every visitor sees the same sections.
  useEffect(() => {
    let active = true;
    fetch("/api/admin/session", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { isAdmin: false }))
      .then((data: { isAdmin?: boolean }) => {
        if (active) setIsAdmin(Boolean(data.isAdmin));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const currentDate = useSyncExternalStore(
    subscribeToHydration,
    () => {
    const options: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" };
      return new Date().toLocaleDateString(language === "es" ? "es-AR" : "en-US", options);
    },
    () => ""
  );

  useEffect(() => {
    const fetchMatches = async (isBackground = false) => {
      if (!isBackground) setIsLoading(true);
      try {
        const res = await fetch("/api/matches", { cache: "no-store" });
        const data = await res.json();
        setMatches(data.matches);
        setLastUpdated(new Date());
      } catch {
        if (!isBackground) setMatches([]);
      } finally {
        if (!isBackground) setIsLoading(false);
      }
    };

    fetchMatches().then(() => {
      const saved = sessionStorage.getItem("home-scroll");
      if (saved) {
        requestAnimationFrame(() => {
          window.scrollTo(0, Number(saved));
          sessionStorage.removeItem("home-scroll");
        });
      }
    });
  }, []);

  const refreshMatches = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/matches", { cache: "no-store" });
      const data = await res.json();
      setMatches(data.matches);
      setLastUpdated(new Date());
    } catch {
      // Keep the current matches when a manual refresh fails.
    } finally {
      setIsRefreshing(false);
    }
  };

  // Saves the dragged category order. Returns false so MatchList can roll back
  // and show the error banner instead of pretending it was stored.
  const reorderLeagues = async (order: number[]): Promise<boolean> => {
    try {
      const res = await fetch("/api/admin/league-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order }),
        cache: "no-store",
      });
      if (!res.ok) return false;
      // Re-read so every section lands exactly where the server persisted it.
      await refreshMatches();
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    const poll = () => {
      fetch("/api/matches", { cache: "no-store" })
        .then((r) => r.json())
        .then((data) => {
          setMatches(data.matches);
          setLastUpdated(new Date());
        })
        .catch(() => {});
    };

    // Adaptive cadence: live matches refresh every 15s so score/minute move;
    // a quiet fixture only needs a check a minute. Hidden tabs don't poll.
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const hasLive = matchesRef.current.some((m) => LIVE_STATUSES.includes(m.status.short));
      timer = setTimeout(() => {
        if (!document.hidden) poll();
        schedule();
      }, hasLive ? 15_000 : 60_000);
    };
    schedule();

    const onVisibility = () => {
      if (document.hidden) return;
      poll();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const liveMatches = matches.filter((m) => LIVE_STATUSES.includes(m.status.short));
  const filteredMatches = showLiveOnly ? liveMatches : matches;

  return (
    <div className="mx-auto max-w-7xl px-3 pb-20 pt-6 sm:px-4 sm:pb-16 sm:pt-8 md:px-6" id="home-page">
      <NetworkNotice />

      {/* Filters — the single strong accent block of the page. Everything
          above it (ticker, network strip) is deliberately quieter so this
          yellow bar is the only "hero". No rotation: it keeps the left edge
          aligned with the category sections below. */}
      <div className="relative mb-6 animate-fade-in sm:mb-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-6 -top-10 h-40 bg-[radial-gradient(ellipse_at_top,rgba(204,255,0,0.10),transparent_70%)]"
        />
        <div className="relative flex flex-wrap items-center gap-3 border-3 border-black bg-accent-primary p-3 plate-face sm:gap-4 sm:border-4 sm:p-4">
          <div className="mr-1 flex flex-col sm:mr-2">
            <h1 className="text-[26px] font-black uppercase leading-none tracking-tight text-black sm:text-[28px]">
              {t.home.todayMatches}
            </h1>
            {currentDate && (
              <span className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-black/55">
                {currentDate}
              </span>
            )}
          </div>

          {liveMatches.length > 0 && (
            <div className="inline-flex items-center gap-1.5 border-2 border-black bg-black px-2 py-1 sm:gap-2 sm:px-3">
              <Zap size={12} strokeWidth={3} className="text-accent-primary" />
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white">
                {liveMatches.length} {t.home.live}
              </span>
            </div>
          )}

          <button
            onClick={() => setShowLiveOnly(!showLiveOnly)}
            className={`inline-flex h-8 items-center gap-1.5 border-2 border-black px-3 text-[11px] font-black uppercase tracking-wider transition-colors ${
              showLiveOnly
                ? "bg-black text-white"
                : "bg-white text-black hover:bg-black hover:text-white"
            }`}
          >
            <Filter size={12} strokeWidth={3} />
            {showLiveOnly ? t.home.seeAll : t.home.onlyLive}
          </button>

          <div className="ml-auto flex flex-wrap items-center gap-3">
            <span className="flex flex-col items-end text-[9px] font-black uppercase leading-[1.2] tracking-[0.16em] text-black/45">
              <span>{t.home.lastUpdated}</span>
              <span className="text-[11px] tabular-nums tracking-normal text-black/70">
                {lastUpdated ? lastUpdated.toLocaleTimeString(language === "es" ? "es-AR" : "en-US", { hour: "2-digit", minute: "2-digit" }) : "--:--"}
              </span>
            </span>
            <button
              onClick={refreshMatches}
              disabled={isRefreshing}
              className="inline-flex h-8 items-center gap-1.5 border-2 border-black bg-white px-3 text-[11px] font-black uppercase tracking-wider text-black transition-colors hover:bg-black hover:text-white disabled:cursor-wait disabled:opacity-60"
              aria-label={t.home.refresh}
            >
              <RefreshCw size={12} className={isRefreshing ? "animate-spin" : ""} strokeWidth={3} />
              {t.home.refresh}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:gap-10">
        {/* Main Column — Full Grid */}
        <div className="space-y-4 sm:space-y-6">
          {isLoading ? (
            <MatchSkeleton label={t.home.loading} />
          ) : filteredMatches.length === 0 ? (
            <div className="border-3 sm:border-4 border-white bg-black p-8 sm:p-12 text-center shadow-brutal-sm">
              <h2 className="text-lg sm:text-xl font-black uppercase text-white tracking-widest">
                {t.home.noMatches}
              </h2>
            </div>
          ) : (
            <MatchList matches={filteredMatches} isAdmin={isAdmin} onReorder={reorderLeagues} />
          )}
        </div>
      </div>
    </div>
  );
}

