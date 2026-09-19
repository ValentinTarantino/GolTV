"use client";

import Image from "next/image";
import type { Match } from "@/lib/types";
import { translateLeague } from "@/i18n/dictionaries";
import { useLanguage } from "@/contexts/LanguageContext";
import MatchCard from "./MatchCard";

interface MatchListProps {
  matches: Match[];
}

interface LeagueGroup {
  leagueId: number;
  leagueName: string;
  leagueLogo: string;
  leagueCountry: string;
  leagueFlag: string;
  matches: Match[];
}

export default function MatchList({ matches }: MatchListProps) {
  const { t } = useLanguage();
  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 sm:py-20 text-center animate-fade-in border-3 sm:border-4 border-dashed border-white/20">
        <div className="mb-3 sm:mb-4 text-4xl sm:text-6xl">⚽</div>
        <h3 className="text-xl sm:text-2xl font-black text-white uppercase tracking-widest">{t.home.noMatches}</h3>
        <p className="mt-2 text-sm sm:text-base font-bold text-white/50 uppercase">
          {t.home.noMatchesForDate}
        </p>
      </div>
    );
  }

  const groups: LeagueGroup[] = [];
  const groupMap = new Map<string, LeagueGroup>();

  for (const match of matches) {
    const key = `${match.league.id}:${match.league.slug || match.league.name}`;
    let group = groupMap.get(key);
    if (!group) {
      group = {
        leagueId: match.league.id,
        leagueName: match.league.name,
        leagueLogo: match.league.logo,
        leagueCountry: match.league.country,
        leagueFlag: match.league.flag,
        matches: [],
      };
      groupMap.set(key, group);
      groups.push(group);
    }
    group.matches.push(match);
  }

  return (
    <div className="space-y-6 sm:space-y-10">
      {groups.map((group, groupIndex) => (
        <section
          key={`${group.leagueId}-${group.leagueName}`}
          className={`border-4 border-white bg-bg-card p-3 sm:p-4 md:p-6 shadow-[6px_6px_0px_0px_var(--color-accent-secondary)] animate-fade-in stagger-${Math.min(groupIndex + 1, 6)}`}
          style={{ opacity: 0 }}
        >
          {/* League Header */}
          <div
            className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 bg-accent-primary border-4 border-black p-3 sm:p-4 shadow-brutal-white"
            id={`league-header-${group.leagueId}-${groupIndex}`}
          >
            <div className="flex items-center gap-3 sm:gap-4">
              {group.leagueLogo ? (
                <div className="relative h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0">
                  <Image
                    src={group.leagueLogo}
                    alt={group.leagueName}
                    fill
                    className="object-contain"
                    sizes="40px"
                  />
                </div>
              ) : (
                <div className="flex h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0 items-center justify-center border-2 border-black bg-black text-lg sm:text-xl font-black text-accent-primary">
                  ⚽
                </div>
              )}
              <div className="flex flex-col">
                <h2 className="text-lg sm:text-xl md:text-2xl font-black text-black uppercase tracking-tight">
                  {translateLeague(group.leagueName)}
                </h2>
              </div>
            </div>
          </div>

          {/* Match Cards */}
          <div className="grid gap-3 sm:gap-4 grid-cols-1">
            {group.matches.map((match) => (
              <MatchCard key={`${match.id}-${match._streamId ?? "fixture"}`} match={match} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
