"use client";

import Image from "next/image";
import Link from "next/link";
import type { Match } from "@/lib/types";
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
  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in border-4 border-dashed border-white/20">
        <div className="mb-4 text-6xl">⚽</div>
        <h3 className="text-2xl font-black text-white uppercase tracking-widest">No hay partidos</h3>
        <p className="mt-2 text-base font-bold text-white/50 uppercase">
          No se encontraron partidos para esta fecha.
        </p>
      </div>
    );
  }

  // Group matches by league
  const groups: LeagueGroup[] = [];
  const groupMap = new Map<number, LeagueGroup>();

  for (const match of matches) {
    let group = groupMap.get(match.league.id);
    if (!group) {
      group = {
        leagueId: match.league.id,
        leagueName: match.league.name,
        leagueLogo: match.league.logo,
        leagueCountry: match.league.country,
        leagueFlag: match.league.flag,
        matches: [],
      };
      groupMap.set(match.league.id, group);
      groups.push(group);
    }
    group.matches.push(match);
  }

  return (
    <div className="space-y-10">
      {groups.map((group, groupIndex) => (
        <section
          key={group.leagueId}
          className={`border-4 border-white bg-[var(--bg-card)] p-4 sm:p-6 shadow-[6px_6px_0px_0px_var(--accent-secondary)] animate-fade-in stagger-${Math.min(groupIndex + 1, 6)}`}
          style={{ opacity: 0 }}
        >
          {/* League Header */}
          <div
            className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[var(--accent-primary)] border-4 border-black p-4 brutal-shadow-white"
            id={`league-header-${group.leagueId}`}
          >
            <div className="flex items-center gap-4">
              <div className="relative h-12 w-12 flex-shrink-0">
                <Image
                  src={group.leagueLogo}
                  alt={group.leagueName}
                  fill
                  className="object-contain"
                  sizes="48px"
                />
              </div>
              <div className="flex flex-col">
                <h2 className="text-xl sm:text-2xl font-black text-black uppercase tracking-tight">
                  {group.leagueName}
                </h2>
                <span className="text-sm font-bold text-black/80 uppercase tracking-widest">{group.leagueCountry}</span>
              </div>
            </div>
          </div>

          {/* Match Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            {group.matches.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
