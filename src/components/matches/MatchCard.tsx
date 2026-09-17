"use client";

import Link from "next/link";
import Image from "next/image";
import { Play, Tv } from "lucide-react";
import type { Match } from "@/lib/types";
import { isLive, isFinished, isUpcoming, isViewable, formatTime, getStatusLabel } from "@/lib/utils";
import LiveBadge from "./LiveBadge";
import Countdown from "./Countdown";

interface MatchCardProps {
  match: Match;
}

export default function MatchCard({ match }: MatchCardProps) {
  const live = isLive(match.status.short);
  const finished = isFinished(match.status.short);
  const upcoming = isUpcoming(match.status.short);
  const viewable = isViewable(match.status.short, match.timestamp);

  return (
    <Link
      href={`/watch/${match.id}`}
      className={`group block p-4 transition-all duration-200 ${
        live
          ? "bg-black border-4 border-[var(--accent-primary)] shadow-[6px_6px_0px_0px_var(--accent-primary)] hover:-translate-y-1 hover:-translate-x-1"
          : "brutal-card"
      }`}
      id={`match-card-${match.id}`}
    >
      {/* League info */}
      <div className="mb-3 flex items-center gap-2 border-b-2 border-white/20 pb-2">
        {match.league.logo && (
          <div className="relative h-4 w-4 flex-shrink-0">
            <Image
              src={match.league.logo}
              alt={match.league.name}
              fill
              className="object-contain"
              sizes="16px"
            />
          </div>
        )}
        <span className="text-xs font-black uppercase tracking-widest text-white/80">
          {match.league.name}
        </span>
      </div>

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
              <span className={`text-2xl font-black tabular-nums ${live ? "text-[var(--accent-primary)]" : "text-white"}`}>
                {match.score.home}
              </span>
              <span className="text-sm font-bold text-white/50">-</span>
              <span className={`text-2xl font-black tabular-nums ${live ? "text-[var(--accent-primary)]" : "text-white"}`}>
                {match.score.away}
              </span>
            </div>
          )}

          {upcoming && (
            <span className="text-lg font-black tabular-nums text-[var(--accent-primary)] bg-black px-2 py-1 border-2 border-[var(--accent-primary)]">
              {formatTime(match.date)}
            </span>
          )}

          {/* Status badge */}
          <div className="flex items-center gap-1.5 mt-1">
            {live && <LiveBadge />}
            {finished && (
              <span className="badge-finished">
                {getStatusLabel(match.status.short, match.status.elapsed)}
              </span>
            )}
            {upcoming && <Countdown timestamp={match.timestamp} />}
          </div>

          {live && match.status.elapsed && (
            <span className="text-sm font-black text-[var(--accent-primary)] animate-pulse">
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

      {/* Broadcast channels for upcoming matches */}
      {upcoming && match.broadcastChannels && match.broadcastChannels.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Tv size={14} strokeWidth={3} className="text-[var(--accent-primary)]" />
          {match.broadcastChannels.map((ch) => (
            <span
              key={ch}
              className="border-2 border-white bg-transparent text-white px-2 py-0.5 text-[10px] font-black uppercase"
            >
              {ch}
            </span>
          ))}
        </div>
      )}

      {/* Watch CTA */}
      {(live || upcoming) && (
        <div className={`mt-4 flex items-center justify-center gap-2 py-3 border-4 font-black uppercase tracking-wider transition-all duration-200 ${
          live || viewable
            ? "bg-[var(--accent-primary)] border-black text-black group-hover:shadow-[4px_4px_0px_0px_white]"
            : "bg-black border-white text-white group-hover:bg-white group-hover:text-black"
        }`}>
          <Play size={18} strokeWidth={3} fill={live || viewable ? "black" : "none"} />
          {live ? "VER EN VIVO GRATIS" : viewable ? "VER PREVIA GRATIS" : "VER PARTIDO"}
        </div>
      )}
    </Link>
  );
}
