"use client";

import { useState, useEffect, useRef, useSyncExternalStore } from "react";
import { Zap, RefreshCw } from "lucide-react";
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

      {/* Scoreboard header — two-tier: dark title block + lime control strip,
          wrapped in a single bordered container with magenta offset shadow. */}
      <div className="relative mb-6 animate-fade-in sm:mb-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-6 -top-12 h-44 bg-[radial-gradient(ellipse_at_top,rgba(204,255,0,0.12),transparent_70%)]"
        />

        <div className="relative overflow-hidden border-4 border-white shadow-[6px_6px_0px_0px_#facc15]">
          {/* ── Title tier: dark scoreboard with diagonal accent ── */}
          <div className="relative bg-[#070805] px-3 py-4 sm:px-5 sm:py-5">
            {/* Diagonal dark gradient overlay on right */}
            <div
              aria-hidden
              className="pointer-events-none absolute right-0 top-0 h-full w-1/2 bg-[linear-gradient(135deg,transparent_40%,rgba(0,0,0,0.3)_100%)]"
            />
            <div className="relative flex flex-wrap items-center gap-2 sm:gap-5">
              {/* Whistle icon — image without border or shadow */}
              <div className="grid h-14 w-14 shrink-0 place-items-center bg-black sm:h-20 sm:w-20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/whistle.png" alt="Silbato" className="h-[48px] w-[48px] object-contain sm:h-[72px] sm:w-[72px]" />
              </div>

              {/* Title + date */}
              <div className="flex min-w-0 flex-1 flex-col">
                <h1 className="text-[22px] font-black uppercase leading-none tracking-tight text-white sm:text-[34px]">
                  {t.home.todayMatches}
                </h1>
                {currentDate && (
                  <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/60 sm:mt-1.5 sm:text-[12px]">
                    {currentDate}
                  </span>
                )}
              </div>

              {/* Stats badges — stacked on mobile, inline on desktop */}
              <div className="flex flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                <span className="border-2 border-white/20 bg-black/80 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-white sm:px-2.5 sm:py-1 sm:text-[11px]">
                  {matches.length} {t.home.fixtures}
                </span>
                {liveMatches.length > 0 && (
                  <span className="inline-flex items-center gap-1 border-2 border-accent-primary/40 bg-accent-primary/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-accent-primary sm:px-2.5 sm:py-1 sm:text-[11px]">
                    <Zap size={10} strokeWidth={3} className="animate-pulse" />
                    {liveMatches.length} {t.home.live}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── Control tier: electric lime strip ── */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t-4 border-black bg-[#c0df00] px-3 py-2 sm:gap-3 sm:px-5 sm:py-2.5">
            {/* Filter toggle */}
            <div className="flex h-7 border-2 border-black bg-white" role="group" aria-label={t.home.onlyLive}>
              <button
                onClick={() => setShowLiveOnly(false)}
                className={`px-2.5 text-[10px] font-black uppercase tracking-wider transition-colors ${
                  !showLiveOnly ? "bg-black text-accent-primary" : "text-black/50 hover:text-black"
                }`}
              >
                {t.home.all}
              </button>
              <button
                onClick={() => setShowLiveOnly(true)}
                className={`flex items-center gap-1 border-l-2 border-black px-2.5 text-[10px] font-black uppercase tracking-wider transition-colors ${
                  showLiveOnly ? "bg-black text-accent-primary" : "text-black/50 hover:text-black"
                }`}
              >
                <Zap size={10} strokeWidth={3} />
                {t.home.onlyLive}
              </button>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-3">
              {/* Timestamp — inline on the lime strip */}
              <span className="hidden text-[9px] font-black uppercase tracking-wider text-black/50 sm:inline sm:text-[10px]">
                {t.home.lastUpdated}{" "}
                <span className="tabular-nums text-black">
                  {lastUpdated ? lastUpdated.toLocaleTimeString(language === "es" ? "es-AR" : "en-US", { hour: "2-digit", minute: "2-digit" }) : "--:--"}
                </span>
              </span>

              {/* Refresh */}
              <button
                onClick={refreshMatches}
                disabled={isRefreshing}
                className="inline-flex h-7 items-center gap-1 border-2 border-black bg-black px-2.5 text-[10px] font-black uppercase tracking-wider text-white transition-colors hover:bg-white hover:text-black disabled:cursor-wait disabled:opacity-60 sm:h-8 sm:gap-1.5 sm:px-3 sm:text-[11px]"
                aria-label={t.home.refresh}
              >
                <RefreshCw size={10} className={isRefreshing ? "animate-spin" : ""} strokeWidth={3} />
                <span className="hidden sm:inline">{t.home.refresh}</span>
              </button>
            </div>
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

