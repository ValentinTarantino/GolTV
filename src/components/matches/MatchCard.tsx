"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import RetryImage from "@/components/ui/RetryImage";
import CrestPlaceholder from "@/components/ui/CrestPlaceholder";
import { Play } from "lucide-react";
import type { Match } from "@/lib/types";
import { shortenTeamName } from "@/lib/constants";
import { isLive, isFinished, isUpcoming, isViewable, formatTime, getStatusLabel } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateCountryName } from "@/i18n/dictionaries";
import { useTimeZone } from "@/contexts/TimeZoneContext";

interface MatchCardProps {
  match: Match;
  prioritizeLogos?: boolean;
}

function nationalTeamFlag(teamName: string): string | null {
  const key = teamName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

  if (key === "singapur" || key === "singapore") return "🇸🇬";
  if (key === "japon" || key === "japan") return "🇯🇵";
  if (key === "rusia" || key === "russia") return "🇷🇺";
  return null;
}

export default function MatchCard({ match, prioritizeLogos = false }: MatchCardProps) {
  const { t, language } = useLanguage();
  const { timeZone } = useTimeZone();
  // Optimizer failures (a badge host rejecting the /_next/image fetch) fall
  // back to the raw remote URL instead of leaving a broken image.
  const [crestFallback, setCrestFallback] = useState<{ home: boolean; away: boolean }>({ home: false, away: false });
  const live = isLive(match.status.short);
  const finished = isFinished(match.status.short);
  const upcoming = isUpcoming(match.status.short);
  const viewable = isViewable(match.status.short, match.timestamp);

  // Agenda fixtures resolve server-side from the match id; only the preferred
  // player travels in the URL.
  const watchUrl = match._preferredPlayer
    ? `/watch/${match.id}?player=${match._preferredPlayer}`
    : `/watch/${match.id}`;

  const saveScroll = () => {
    sessionStorage.setItem("home-scroll", String(window.scrollY));
  };

  // Badges already sealed behind /api/img (or served from the R2 image
  // prefix) are tiny static files: skip the /_next/image optimizer hop so
  // the prefetch below warms the exact URL the <img> will request, and the
  // browser serves it straight from cache.
  const directBadge = (logo: string) =>
    logo.startsWith("/api/img") || logo.includes("/v1/img/");

  // Warm the browser cache for this fixture's crests as soon as the card is
  // visible, so the watch page renders them instantly instead of fetching
  // them while its skeleton is still up.
  useEffect(() => {
    for (const logo of [match.homeTeam.logo, match.awayTeam.logo, match.league.logo]) {
      if (logo) {
        const img = new window.Image();
        img.src = logo;
      }
    }
  }, [match.homeTeam.logo, match.awayTeam.logo, match.league.logo]);

  const cardId = `match-card-${match._eventSlug ?? match._streamId ?? match.id}`;
  // Finished fixtures are results, not destinations: no link, no hover, no
  // watch CTA — clicking one used to open a dead player and confuse users.
  const cardClass = finished
    ? "block py-3 pl-2 pr-3 bg-bg-card border-4 border-white opacity-60 sm:py-4 sm:pl-3 sm:pr-4"
    : `group block py-3 pl-2 pr-3 transition-all duration-200 sm:py-4 sm:pl-3 sm:pr-4 ${
        live
          ? "bg-black border-4 border-accent-primary shadow-brutal hover:-translate-y-1 hover:-translate-x-1"
          : "bg-bg-card border-4 border-white transition-all relative hover:-translate-y-1 hover:-translate-x-1 hover:shadow-brutal hover:border-accent-primary"
      }`;

  const content = (
    <>
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        {/* Home Team */}
        <div className="flex flex-1 items-center gap-2 sm:gap-3 min-w-0">
          <div className="relative h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0">
            {match.homeTeam.logo ? (
              <RetryImage
                src={match.homeTeam.logo}
                alt={match.homeTeam.name}
                fill
                className="object-contain"
                sizes="(max-width: 639px) 40px, 48px"
                loading={prioritizeLogos ? "eager" : "lazy"}
                fetchPriority={prioritizeLogos ? "high" : "auto"}
                unoptimized={crestFallback.home || directBadge(match.homeTeam.logo)}
                onError={() => setCrestFallback((f) => (f.home ? f : { ...f, home: true }))}
                fallback={<CrestPlaceholder className="h-full w-full" />}
              />
            ) : nationalTeamFlag(match.homeTeam.name) ? (
              <span className="flex h-full items-center justify-center text-3xl" role="img" aria-label={match.homeTeam.name}>
                {nationalTeamFlag(match.homeTeam.name)}
              </span>
            ) : (
              <CrestPlaceholder className="h-full w-full" />
            )}
          </div>
          <span className="truncate font-team text-[16px] font-bold uppercase leading-none tracking-[0.01em] text-white sm:text-[18px]">
            {translateCountryName(shortenTeamName(match.homeTeam.name), language)}
          </span>
        </div>

        <span aria-hidden className="hidden h-7 w-px shrink-0 bg-white/10 sm:block" />

        {/* Score / Status */}
        <div className="flex flex-col items-center gap-1 sm:gap-1.5 flex-shrink-0 min-w-[70px] sm:min-w-[88px]">
          {(live || finished) && match.score.home != null && match.score.away != null && (
            <div className="flex items-center gap-2 sm:gap-3">
              <span className={`text-xl font-black tabular-nums sm:text-[22px] ${live ? "text-accent-primary" : "text-white"}`}>
                {match.score.home}
              </span>
              <span className="text-xs sm:text-sm font-bold text-white/40">-</span>
              <span className={`text-xl font-black tabular-nums sm:text-[22px] ${live ? "text-accent-primary" : "text-white"}`}>
                {match.score.away}
              </span>
            </div>
          )}

          {live && (
            <span className="border-2 border-accent-primary bg-black px-2 py-0.5 text-base font-black tabular-nums text-accent-primary sm:text-lg">
              {formatTime(match.date, language, timeZone)}
            </span>
          )}

          {upcoming && (
            <span className="border-2 border-white/25 bg-black px-2 py-0.5 text-base font-black tabular-nums text-white sm:text-lg">
              {formatTime(match.date, language, timeZone)}
            </span>
          )}

          {finished && (
            <span className="border-2 border-white/15 bg-black px-2 py-0.5 text-base font-black tabular-nums text-white/55 sm:text-lg">
              {formatTime(match.date, language, timeZone)}
            </span>
          )}

          {/* Status badge */}
          {finished && (
            <div className="mt-0.5 flex items-center gap-1 sm:mt-1 sm:gap-1.5">
              <span className="inline-flex border-2 border-black bg-white px-2 py-0.5 text-[10px] font-extrabold uppercase text-black sm:px-3 sm:py-1 sm:text-xs">
                {getStatusLabel(match.status.short, match.status.elapsed, language)}
              </span>
            </div>
          )}

          {live && match.status.elapsed && (
            <span className="text-[11px] font-black tracking-wide text-accent-primary animate-pulse">
              {match.status.elapsed}&apos;
            </span>
          )}
        </div>

        <span aria-hidden className="hidden h-7 w-px shrink-0 bg-white/10 sm:block" />

        {/* Away Team */}
        <div className="flex flex-1 items-center justify-end gap-2 sm:gap-3 min-w-0">
          <span className="truncate text-right font-team text-[16px] font-bold uppercase leading-none tracking-[0.01em] text-white sm:text-[18px]">
            {translateCountryName(shortenTeamName(match.awayTeam.name), language)}
          </span>
          <div className="relative h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0">
            {match.awayTeam.logo ? (
              <RetryImage
                src={match.awayTeam.logo}
                alt={match.awayTeam.name}
                fill
                className="object-contain"
                sizes="(max-width: 639px) 40px, 48px"
                loading={prioritizeLogos ? "eager" : "lazy"}
                fetchPriority={prioritizeLogos ? "high" : "auto"}
                unoptimized={crestFallback.away || directBadge(match.awayTeam.logo)}
                onError={() => setCrestFallback((f) => (f.away ? f : { ...f, away: true }))}
                fallback={<CrestPlaceholder className="h-full w-full" />}
              />
            ) : nationalTeamFlag(match.awayTeam.name) ? (
              <span className="flex h-full items-center justify-center text-3xl" role="img" aria-label={match.awayTeam.name}>
                {nationalTeamFlag(match.awayTeam.name)}
              </span>
            ) : (
              <CrestPlaceholder className="h-full w-full" />
            )}
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
    </>
  );

  if (finished) {
    return (
      <div className={cardClass} id={cardId}>
        {content}
      </div>
    );
  }

  return (
    <Link href={watchUrl} onClick={saveScroll} className={cardClass} id={cardId}>
      {content}
    </Link>
  );
}

