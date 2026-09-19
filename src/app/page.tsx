"use client";

import { useState, useEffect, useMemo } from "react";
import { Zap, Filter } from "lucide-react";
import MatchList from "@/components/matches/MatchList";
import { MatchSkeleton } from "@/components/ui/Skeleton";
import { LIVE_STATUSES } from "@/lib/constants";
import { formatDateISO } from "@/lib/utils";
import type { Match } from "@/lib/types";
import { useLanguage } from "@/contexts/LanguageContext";

export default function HomePage() {
  const { language, t } = useLanguage();
  const [matches, setMatches] = useState<Match[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showLiveOnly, setShowLiveOnly] = useState(false);

  const currentDate = useMemo(() => {
    const options: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" };
    return new Date().toLocaleDateString(language === "es" ? "es-AR" : "en-US", options);
  }, [language]);

  useEffect(() => {
    const fetchMatches = async () => {
      if (matches.length === 0) setIsLoading(true);
      try {
        const dateStr = formatDateISO(new Date());
        const res = await fetch(`/api/matches?date=${dateStr}`);
        const data = await res.json();
        setMatches(data.matches);
      } catch {
        setMatches([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMatches();
  }, [matches.length]);

  const liveMatches = matches.filter((m) => LIVE_STATUSES.includes(m.status.short));
  const filteredMatches = showLiveOnly ? liveMatches : matches;

  return (
    <div className="mx-auto max-w-7xl px-3 sm:px-4 md:px-6 py-6 sm:py-8" id="home-page">
      {/* Filters */}
      <div className="mb-6 sm:mb-8 flex flex-wrap items-center gap-3 sm:gap-4 animate-fade-in bg-accent-primary border-3 sm:border-4 border-black p-3 sm:p-4 shadow-brutal transform rotate-1">
        <div className="flex flex-col mr-1 sm:mr-2">
          <h1 className="text-2xl sm:text-3xl font-black text-black uppercase tracking-tight">
            {t.home.todayMatches}
          </h1>
          {currentDate && (
            <span className="text-xs sm:text-sm font-bold text-black/80 uppercase tracking-widest mt-1">
              {currentDate}
            </span>
          )}
        </div>

        {liveMatches.length > 0 && (
          <div className="inline-flex items-center gap-1.5 sm:gap-2 bg-black border-2 border-white px-2 sm:px-3 py-0.5 sm:py-1">
            <Zap size={14} strokeWidth={3} className="text-accent-primary" />
            <span className="text-xs sm:text-sm font-black text-white uppercase tracking-widest">
              {liveMatches.length} {t.home.live}
            </span>
          </div>
        )}

        <button
          onClick={() => setShowLiveOnly(!showLiveOnly)}
          className={`inline-flex items-center gap-1.5 sm:gap-2 border-2 px-3 sm:px-4 py-1 sm:py-1.5 text-xs sm:text-sm font-black uppercase transition-all ${
            showLiveOnly
              ? "bg-black border-white text-white shadow-brutal-white hover:-translate-y-1"
              : "bg-white border-black text-black hover:bg-black hover:text-white hover:border-white hover:shadow-brutal-white hover:-translate-y-1"
          }`}
        >
          <Filter size={14} strokeWidth={3} />
          {showLiveOnly ? t.home.seeAll : t.home.onlyLive}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:gap-10">
        {/* Main Column — Full Grid */}
        <div className="space-y-4 sm:space-y-6">
          {isLoading ? (
            <MatchSkeleton />
          ) : filteredMatches.length === 0 ? (
            <div className="border-3 sm:border-4 border-white bg-black p-8 sm:p-12 text-center shadow-brutal-sm">
              <h2 className="text-lg sm:text-xl font-black uppercase text-white tracking-widest">
                {t.home.noMatches}
              </h2>
            </div>
          ) : (
            <MatchList matches={filteredMatches} />
          )}
        </div>
      </div>
    </div>
  );
}

