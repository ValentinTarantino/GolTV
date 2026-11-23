"use client";

import { useRef, useState } from "react";
import RetryImage from "@/components/ui/RetryImage";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import type { Match } from "@/lib/types";
import { translateLeague } from "@/i18n/dictionaries";
import { useLanguage } from "@/contexts/LanguageContext";
import MatchCard from "./MatchCard";

interface MatchListProps {
  matches: Match[];
  isAdmin?: boolean;
  /** Saves the category order. Resolves false when the server rejected it. */
  onReorder?: (order: number[]) => Promise<boolean>;
}

interface LeagueGroup {
  leagueId: number;
  leagueName: string;
  leagueLogo: string;
  leagueCountry: string;
  leagueFlag: string;
  matches: Match[];
}

export default function MatchList({ matches, isAdmin = false, onReorder }: MatchListProps) {
  const { t, language } = useLanguage();
  // Admin-only category order. It starts null so the server order (the one
  // every visitor gets) is used until the admin moves something.
  const [order, setOrder] = useState<number[] | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  // The drop handler must not depend on a state re-render having happened
  // between dragstart and drop, so the source id also lives in a ref.
  const dragSourceRef = useRef<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [orderError, setOrderError] = useState(false);

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

  // Final UI guard for provider duplicates. Sources can occasionally return
  // the same fixture with different ids or ISO offsets; the visible fixture
  // identity is the league, Argentina-local date, and unordered team pair.
  const seenFixtures = new Set<string>();
  const uniqueMatches = matches.filter((match) => {
    const normalize = (value: string) => value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const localDate = new Date(match.date).toLocaleDateString("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
    });
    const teams = [normalize(match.homeTeam.name), normalize(match.awayTeam.name)].sort();
    const key = `${match.league.id}:${localDate}:${teams.join(":")}`;
    if (seenFixtures.has(key)) return false;
    seenFixtures.add(key);
    return true;
  });

  const groups: LeagueGroup[] = [];
  const groupMap = new Map<string, LeagueGroup>();

  for (const match of uniqueMatches) {
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

  const orderedGroups = order
    ? [...groups].sort((left, right) => {
        const leftIndex = order.indexOf(left.leagueId);
        const rightIndex = order.indexOf(right.leagueId);
        if (leftIndex === -1 && rightIndex === -1) return 0;
        if (leftIndex === -1) return 1;
        if (rightIndex === -1) return -1;
        return leftIndex - rightIndex;
      })
    : groups;

  const saveOrder = async (next: number[]) => {
    setOrder(next);
    setOrderError(false);
    if (!onReorder) return;
    setSavingOrder(true);
    const saved = await onReorder(next);
    setSavingOrder(false);
    if (!saved) {
      setOrderError(true);
      // Fall back to the server order on the next poll.
      setOrder(null);
    }
  };

  const moveGroup = (leagueId: number, delta: number) => {
    const ids = orderedGroups.map((group) => group.leagueId);
    const from = ids.indexOf(leagueId);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    void saveOrder(ids);
  };

  const dropOn = (targetId: number) => {
    const source = dragSourceRef.current;
    dragSourceRef.current = null;
    setDragId(null);
    setOverId(null);
    if (source === null || source === targetId) return;
    const ids = orderedGroups.map((group) => group.leagueId);
    const from = ids.indexOf(source);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) return;
    const [moved] = ids.splice(from, 1);
    // Dropping onto a category takes that category's slot: it lands before it.
    ids.splice(to > from ? to - 1 : to, 0, moved);
    void saveOrder(ids);
  };

  const canReorder = Boolean(isAdmin && onReorder);

  return (
    <div className="space-y-8 sm:space-y-10">
      {canReorder && orderError && (
        <div className="border-4 border-red-500 bg-black px-3 py-2 text-xs font-black uppercase tracking-widest text-red-400">
          {t.home.orderError}
        </div>
      )}
        {orderedGroups.map((group, groupIndex) => (
          <section
            key={`${group.leagueId}-${group.leagueName}`}
            className={`border-4 border-white bg-bg-card p-3 shadow-[6px_6px_0px_0px_var(--color-accent-secondary)] animate-fade-in stagger-${Math.min(groupIndex + 1, 6)} sm:p-4 ${
            dragId === group.leagueId ? "opacity-40" : ""
          } ${overId === group.leagueId && dragId !== group.leagueId ? "ring-4 ring-accent-primary" : ""}`}
          style={{ opacity: 0 }}
          onDragOver={canReorder
            ? (event) => {
                event.preventDefault();
                if (overId !== group.leagueId) setOverId(group.leagueId);
              }
            : undefined}
          onDrop={canReorder
            ? (event) => {
                event.preventDefault();
                dropOn(group.leagueId);
              }
            : undefined}
          onDragEnd={canReorder
            ? () => {
                dragSourceRef.current = null;
                setDragId(null);
                setOverId(null);
              }
            : undefined}
        >
          {/* League Header */}
          <div
            className={`plate-face mb-3 flex flex-col justify-between gap-3 border-4 border-black bg-accent-primary py-2.5 pl-2 pr-2.5 sm:mb-4 sm:flex-row sm:items-center sm:gap-4 sm:py-3 sm:pl-2.5 sm:pr-3 ${
              canReorder ? "cursor-grab active:cursor-grabbing" : ""
            }`}
            id={`league-header-${group.leagueId}-${groupIndex}`}
            draggable={canReorder}
            onDragStart={canReorder
              ? (event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", String(group.leagueId));
                  dragSourceRef.current = group.leagueId;
                  setDragId(group.leagueId);
                }
              : undefined}
          >
            <div className="flex items-center gap-3 sm:gap-4">
              {canReorder && (
                <GripVertical
                  size={18}
                  strokeWidth={3}
                  className="hidden shrink-0 text-black/60 sm:block"
                  aria-hidden
                />
              )}
              <div className={`relative isolate h-10 w-10 flex-shrink-0 border-2 border-black shadow-brutal-sm sm:h-12 sm:w-12 ${group.leagueId === 9901 || group.leagueId === 268 || group.leagueId === 57 || group.leagueId === 1034 ? "bg-black" : "bg-white"}`}>
              {group.leagueLogo ? (
                <div className="absolute inset-1">
                  <RetryImage
                    src={group.leagueLogo}
                    alt={group.leagueName}
                    fill
                    className="object-contain"
                    sizes="32px"
                    unoptimized
                    draggable={false}
                  />
                </div>
              ) : (
                <div className="relative z-10 flex h-full w-full items-center justify-center text-lg font-black text-accent-primary sm:text-xl">
                  ⚽
                </div>
              )}
              </div>
              <div className="flex flex-col">
                <h2 className="text-[20px] font-black uppercase leading-none tracking-tight text-black sm:text-[26px]">
                  {translateLeague(group.leagueName, language)}
                </h2>
              </div>
            </div>

            {canReorder && (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="hidden text-[10px] font-black uppercase tracking-widest text-black/60 md:inline">
                  {savingOrder ? t.home.orderSaving : t.home.dragLeague}
                </span>
                <button
                  type="button"
                  onClick={() => moveGroup(group.leagueId, -1)}
                  disabled={groupIndex === 0 || savingOrder}
                  title={t.home.moveLeagueUp}
                  aria-label={t.home.moveLeagueUp}
                  className="border-2 border-black bg-white p-1 text-black transition-colors hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ArrowUp size={14} strokeWidth={3} />
                </button>
                <button
                  type="button"
                  onClick={() => moveGroup(group.leagueId, 1)}
                  disabled={groupIndex === orderedGroups.length - 1 || savingOrder}
                  title={t.home.moveLeagueDown}
                  aria-label={t.home.moveLeagueDown}
                  className="border-2 border-black bg-white p-1 text-black transition-colors hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ArrowDown size={14} strokeWidth={3} />
                </button>
              </div>
            )}
          </div>

          {/* Match Cards */}
          <div className="grid grid-cols-1 gap-1.5">
            {group.matches.map((match, index) => {
              const sourceKey = match._eventSlug ?? match._streamId;
              const identity = sourceKey
                ? `${group.leagueId}-${sourceKey}`
                : `${group.leagueId}-${match.id}-${match.timestamp}-${match.homeTeam.name}-${match.awayTeam.name}`;
              return <MatchCard key={`${identity}-${index}`} match={match} prioritizeLogos={groupIndex === 0 && index < 2} />;
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
