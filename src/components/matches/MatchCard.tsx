"use client";

import Link from "next/link";
import Image from "next/image";
import { Play } from "lucide-react";
import type { Match } from "@/lib/types";
import { shortenTeamName } from "@/lib/constants";
import { isLive, isFinished, isUpcoming, isViewable, formatTime, getStatusLabel } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateCountryName } from "@/i18n/dictionaries";

interface MatchCardProps {
  match: Match;
}

export default function MatchCard({ match }: MatchCardProps) {
  const { t, language } = useLanguage();
  const live = isLive(match.status.short);
  const finished = isFinished(match.status.short);
  const upcoming = isUpcoming(match.status.short);
  const viewable = isViewable(match.status.short, match.timestamp);

  const watchUrl = (() => {
    const params = new URLSearchParams();
    if (match._pelotaLibreSlug && match._pelotaLibreSources) {
      params.set("plSlug", match._pelotaLibreSlug);
      params.set("plSources", JSON.stringify(match._pelotaLibreSources));
    }
    if (match._streamId || match._pelotaLibreSlug) {
      params.set("home", match.homeTeam.name);
      params.set("away", match.awayTeam.name);
      params.set("league", match.league.name);
    }
    if (match._streamId) {
      params.set("streamId", match._streamId);
    }
    const qs = params.toString();
    return `/watch/${match.id}${qs ? `?${qs}` : ""}`;
  })();

  const saveScroll = () => {
    sessionStorage.setItem("home-scroll", String(window.scrollY));
  };

  return (
    <Link
      href={watchUrl}
      onClick={saveScroll}
      className={`group block p-3 sm:p-4 transition-all duration-200 ${
        live
          ? "bg-black border-4 border-accent-primary shadow-brutal hover:-translate-y-1 hover:-translate-x-1"
          : "bg-bg-card border-4 border-white transition-all relative hover:-translate-y-1 hover:-translate-x-1 hover:shadow-brutal hover:border-accent-primary"
      }`}
      id={`match-card-${match.id}`}
    >
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        {/* Home Team */}
        <div className="flex flex-1 items-center gap-2 sm:gap-3 min-w-0">
          <div className="relative h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0">
            {match.homeTeam.logo ? (
              <Image
                src={match.homeTeam.logo}
                alt={match.homeTeam.name}
                fill
                className="object-contain"
                sizes="40px"
              />
            ) : null}
          </div>
          <span className="truncate text-sm sm:text-base font-bold text-white uppercase tracking-tight">
            {translateCountryName(shortenTeamName(match.homeTeam.name), language)}
          </span>
        </div>

        {/* Score / Status */}
        <div className="flex flex-col items-center gap-1 sm:gap-1.5 flex-shrink-0 min-w-[70px] sm:min-w-[90px] bg-white/10 p-1.5 sm:p-2 border-2 border-white/30">
          {(live || finished) && match.score.home != null && match.score.away != null && (
            <div className="flex items-center gap-2 sm:gap-3">
              <span className={`text-xl sm:text-2xl font-black tabular-nums ${live ? "text-accent-primary" : "text-white"}`}>
                {match.score.home}
              </span>
              <span className="text-xs sm:text-sm font-bold text-white/50">-</span>
              <span className={`text-xl sm:text-2xl font-black tabular-nums ${live ? "text-accent-primary" : "text-white"}`}>
                {match.score.away}
              </span>
            </div>
          )}

          {(live || upcoming) && (
            <span className={`text-sm sm:text-lg font-black tabular-nums bg-black px-1.5 sm:px-2 py-0.5 sm:py-1 border-2 ${live ? "text-accent-primary border-accent-primary" : "text-accent-primary border-accent-primary"}`}>
              {formatTime(match.date, language)}
            </span>
          )}

          {finished && (
            <span className="text-sm sm:text-lg font-black tabular-nums text-white/60 bg-black px-1.5 sm:px-2 py-0.5 sm:py-1 border-2 border-white/30">
              {formatTime(match.date, language)}
            </span>
          )}

          {/* Status badge */}
          {finished && (
            <div className="flex items-center gap-1 sm:gap-1.5 mt-0.5 sm:mt-1">
              <span className="inline-flex px-2 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-xs font-extrabold uppercase bg-white text-black border-2 border-black">
                {getStatusLabel(match.status.short, match.status.elapsed, language)}
              </span>
            </div>
          )}

          {live && match.status.elapsed && (
            <span className="text-xs sm:text-sm font-black text-accent-primary animate-pulse">
              {match.status.elapsed}&apos;
            </span>
          )}
        </div>

        {/* Away Team */}
        <div className="flex flex-1 items-center justify-end gap-2 sm:gap-3 min-w-0">
          <span className="truncate text-right text-sm sm:text-base font-bold text-white uppercase tracking-tight">
            {translateCountryName(shortenTeamName(match.awayTeam.name), language)}
          </span>
          <div className="relative h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0">
            {match.awayTeam.logo ? (
              <Image
                src={match.awayTeam.logo}
                alt={match.awayTeam.name}
                fill
                className="object-contain"
                sizes="40px"
              />
            ) : null}
          </div>
        </div>
      </div>

      {/* Watch CTA */}
      {(live || upcoming) && (
        <div className={`mt-3 sm:mt-4 flex items-center justify-center gap-1.5 sm:gap-2 py-2 sm:py-3 border-4 font-black uppercase tracking-wider transition-all duration-200 text-xs sm:text-sm ${
          live || viewable
            ? "bg-accent-primary border-black text-black group-hover:shadow-brutal-white"
            : "bg-black border-white text-white group-hover:bg-white group-hover:text-black"
        }`}>
          <Play size={14} strokeWidth={3} fill={live || viewable ? "black" : "none"} />
          {live ? t.match.watchLiveFree : t.match.watchMatch}
        </div>
      )}
    </Link>
  );
}

