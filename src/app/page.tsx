"use client";

import { useState, useEffect } from "react";
import { Zap, Filter } from "lucide-react";
import MatchList from "@/components/matches/MatchList";
import { MatchSkeleton } from "@/components/ui/Skeleton";
import { LIVE_STATUSES } from "@/lib/constants";
import { formatDateISO } from "@/lib/utils";
import type { Match } from "@/lib/types";

export default function HomePage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showLiveOnly, setShowLiveOnly] = useState(false);

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
  }, []);

  const liveMatches = matches.filter((m) => LIVE_STATUSES.includes(m.status.short));
  const filteredMatches = showLiveOnly ? liveMatches : matches;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6" id="home-page">
      {/* Filters */}
      <div className="mb-8 flex flex-wrap items-center gap-4 animate-fade-in bg-[var(--accent-primary)] border-4 border-black p-4 brutal-shadow transform rotate-1">
        <h1 className="text-3xl font-black text-black uppercase tracking-tight mr-2">
          Partidos de Hoy
        </h1>

        {liveMatches.length > 0 && (
          <div className="inline-flex items-center gap-2 bg-black border-2 border-white px-3 py-1">
            <Zap size={16} strokeWidth={3} className="text-[var(--accent-primary)]" />
            <span className="text-sm font-black text-white uppercase tracking-widest">
              {liveMatches.length} EN VIVO
            </span>
          </div>
        )}

        <button
          onClick={() => setShowLiveOnly(!showLiveOnly)}
          className={`inline-flex items-center gap-2 border-2 px-4 py-1.5 text-sm font-black uppercase transition-all ${
            showLiveOnly
              ? "bg-black border-white text-white brutal-shadow-white hover:-translate-y-1"
              : "bg-white border-black text-black hover:bg-black hover:text-white hover:border-white hover:brutal-shadow-white hover:-translate-y-1"
          }`}
        >
          <Filter size={16} strokeWidth={3} />
          {showLiveOnly ? "VER TODOS" : "SOLO EN VIVO"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-10">
        {/* Main Column — Full Grid */}
        <div className="space-y-6">
          {isLoading ? <MatchSkeleton /> : <MatchList matches={filteredMatches} />}
        </div>
      </div>
    </div>
  );
}
