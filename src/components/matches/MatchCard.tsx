"use client";

import Link from "next/link";
import Image from "next/image";
import { Play } from "lucide-react";
import type { Match } from "@/lib/types";
import { isLive, isFinished, isUpcoming, isViewable, formatTime, getStatusLabel } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

interface MatchCardProps {
  match: Match;
}

export default function MatchCard({ match }: MatchCardProps) {
  const { t } = useLanguage();
  const live = isLive(match.status.short);
  const finished = isFinished(match.status.short);
  const upcoming = isUpcoming(match.status.short);
  const viewable = isViewable(match.status.short, match.timestamp);

  return (
    <Link
      href={`/watch/${match.id}`}
      className={`group block p-4 transition-all duration-200 ${
        live
          ? "bg-black border-4 border-accent-primary shadow-brutal hover:-translate-y-1 hover:-translate-x-1"
          : "bg-bg-card border-4 border-white transition-all relative hover:-translate-y-1 hover:-translate-x-1 hover:shadow-brutal hover:border-accent-primary"
      }`}
      id={`match-card-${match.id}`}
    >
      <div className="flex items-center justify-between gap-4">
        {/* Home Team */}
        <div className="flex flex-1 items-center gap-3 min-w-0">
          <div className="relative h-12 w-12 flex-shrink-0">
            <Image
              src={match.homeTeam.logo}
              alt={match.homeTeam.name}
              fill
              className="object-contain"
              sizes="48px"
            />
          </div>
          <span className="truncate text-base font-bold text-white uppercase tracking-tight">
            {match.homeTeam.name}
          </span>
        </div>

        {/* Score / Status */}
        <div className="flex flex-col items-center gap-1.5 flex-shrink-0 min-w-[90px] bg-white/10 p-2 border-2 border-white/30">
          {(live || finished) && (
            <div className="flex items-center gap-3">
              <span className={`text-2xl font-black tabular-nums ${live ? "text-accent-primary" : "text-white"}`}>
                {match.score.home}
              </span>
              <span className="text-sm font-bold text-white/50">-</span>
              <span className={`text-2xl font-black tabular-nums ${live ? "text-accent-primary" : "text-white"}`}>
                {match.score.away}
              </span>
            </div>
          )}

          {upcoming && (
            <span className="text-lg font-black tabular-nums text-accent-primary bg-black px-2 py-1 border-2 border-accent-primary">
              {formatTime(match.date)}
            </span>
          )}

          {/* Status badge */}
          {finished && (
            <div className="flex items-center gap-1.5 mt-1">
              <span className="inline-flex px-3 py-1 text-xs font-extrabold uppercase bg-white text-black border-2 border-black">
                {getStatusLabel(match.status.short, match.status.elapsed)}
              </span>
            </div>
          )}

          {live && match.status.elapsed && (
            <span className="text-sm font-black text-accent-primary animate-pulse">
              {match.status.elapsed}&apos;
            </span>
          )}
        </div>

        {/* Away Team */}
        <div className="flex flex-1 items-center justify-end gap-3 min-w-0">
          <span className="truncate text-right text-base font-bold text-white uppercase tracking-tight">
            {match.awayTeam.name}
          </span>
          <div className="relative h-12 w-12 flex-shrink-0">
            <Image
              src={match.awayTeam.logo}
              alt={match.awayTeam.name}
              fill
              className="object-contain"
              sizes="48px"
            />
          </div>
        </div>
      </div>

      {/* Watch CTA */}
      {(live || upcoming) && (
        <div className={`mt-4 flex items-center justify-center gap-2 py-3 border-4 font-black uppercase tracking-wider transition-all duration-200 ${
          live || viewable
            ? "bg-accent-primary border-black text-black group-hover:shadow-brutal-white"
            : "bg-black border-white text-white group-hover:bg-white group-hover:text-black"
        }`}>
          <Play size={18} strokeWidth={3} fill={live || viewable ? "black" : "none"} />
          {live ? t.match.watchLiveFree : viewable ? t.match.watchPreviewFree : t.match.watchMatch}
        </div>
      )}
    </Link>
  );
}

