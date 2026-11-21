"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { Match } from "@/lib/types";
import { translateLeague } from "@/i18n/dictionaries";
import { useLanguage } from "@/contexts/LanguageContext";
import MatchCard from "./MatchCard";

interface MatchListProps {
  matches: Match[];
}

interface LeagueGroup {
  key: string;
  leagueId: number;
  leagueName: string;
  leagueLogo: string;
  leagueCountry: string;
  leagueFlag: string;
  matches: Match[];
}

export default function MatchList({ matches }: MatchListProps) {
  const { t, language } = useLanguage();
  const [isAdmin, setIsAdmin] = useState(false);
  const [groupOrder, setGroupOrder] = useState<string[] | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ key: string; before: boolean } | null>(null);
  const [orderNotPersisted, setOrderNotPersisted] = useState(false);
  const pendingDrop = useRef<{ key: string; before: boolean } | null>(null);
  const dropHandler = useRef<(key: string, before: boolean) => void>(() => {});

  // The admin session cookie is httpOnly, so the client asks the server.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { isAdmin?: boolean } | null) => {
        if (!cancelled && data?.isAdmin) setIsAdmin(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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
        key,
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

  const leagueIdByKey = new Map(groups.map((group) => [group.key, group.leagueId]));

  // Admin drag order wins over the server-provided sequence; groups the
  // admin has not touched yet keep their relative position at the end.
  const orderedGroups = groupOrder
    ? [...groups].sort((a, b) => {
        const ai = groupOrder.indexOf(a.key);
        const bi = groupOrder.indexOf(b.key);
        return (ai === -1 ? Number.MAX_SAFE_INTEGER : ai) - (bi === -1 ? Number.MAX_SAFE_INTEGER : bi);
      })
    : groups;

  /** Persists the visible order; leagues outside today's fixture keep theirs. */
  const persistOrder = async (keys: string[]) => {
    const ids = keys
      .map((key) => leagueIdByKey.get(key))
      .filter((id): id is number => typeof id === "number");
    try {
      const current = await fetch("/api/admin/league-order")
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null);
      const saved: number[] = Array.isArray(current?.order) ? current.order : [];
      const merged = [...ids, ...saved.filter((id) => !ids.includes(id))];
      const res = await fetch("/api/admin/league-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: merged }),
      });
      const data: { persisted?: boolean } | null = res.ok ? await res.json().catch(() => null) : null;
      setOrderNotPersisted(data?.persisted === false);
    } catch {
      setOrderNotPersisted(true);
    }
  };

  function handleDrop(targetKey: string, before: boolean) {
    setDropTarget(null);
    if (!isAdmin || !dragKey || dragKey === targetKey) return;
    const keys = orderedGroups.map((group) => group.key);
    const from = keys.indexOf(dragKey);
    const to = keys.indexOf(targetKey) + (before ? 0 : 1);
    if (from === -1 || to === -1 || to === from || to === from + 1) return;
    const next = keys.filter((key) => key !== dragKey);
    next.splice(to > from ? to - 1 : to, 0, dragKey);
    setGroupOrder(next);
    void persistOrder(next);
  }

  // Pointer-based drag (not HTML5 drag & drop): the mouse wheel keeps
  // scrolling the page mid-drag, which native DnD suppresses.
  useEffect(() => {
    dropHandler.current = handleDrop;
  });

  useEffect(() => {
    if (!isAdmin || !dragKey) return;

    const previousCursor = document.body.style.cursor;
    const previousSelect = document.body.style.userSelect;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    const onMove = (event: PointerEvent) => {
      const hit = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-league-key]");
      const key = hit?.dataset.leagueKey;
      if (key) {
        const rect = hit.getBoundingClientRect();
        const before = event.clientY < rect.top + rect.height / 2;
        pendingDrop.current = { key, before };
        setDropTarget(pendingDrop.current);
      } else {
        pendingDrop.current = null;
        setDropTarget(null);
      }

      // Auto-scroll near the viewport edges while the pointer is held.
      const EDGE = 90;
      const y = event.clientY;
      if (y < EDGE) {
        window.scrollBy(0, -Math.ceil((EDGE - y) / 6));
      } else if (y > window.innerHeight - EDGE) {
        window.scrollBy(0, Math.ceil((y - (window.innerHeight - EDGE)) / 6));
      }
    };

    const finish = () => {
      const target = pendingDrop.current;
      pendingDrop.current = null;
      setDragKey(null);
      setDropTarget(null);
      if (target) dropHandler.current(target.key, target.before);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelect;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [isAdmin, dragKey]);

  if (uniqueMatches.length === 0) {
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

  return (
    <div className="space-y-6 sm:space-y-10">
      {isAdmin && orderNotPersisted && (
        <p className="border-2 border-accent-red bg-black px-3 py-2 text-[11px] font-black uppercase text-accent-red">
          El orden no se guardó en la base de datos — se perderá al reiniciar. Revisá MONGODB_URI.
        </p>
      )}
      {orderedGroups.map((group, groupIndex) => (
        <section
          key={group.key}
          className={`border-4 bg-bg-card p-3 sm:p-4 md:p-6 shadow-[6px_6px_0px_0px_var(--color-accent-secondary)] animate-fade-in stagger-${Math.min(groupIndex + 1, 6)} ${isAdmin ? "transition-all" : ""} ${dragKey === group.key ? "opacity-40" : ""} ${isAdmin && dropTarget?.key === group.key ? (dropTarget.before ? "border-t-accent-primary" : "border-b-accent-primary") : "border-white"}`}
          style={{ opacity: dragKey === group.key ? undefined : 0 }}
          data-league-key={group.key}
        >
          {/* League Header */}
          <div
            className={`mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 bg-accent-primary border-4 border-black p-3 sm:p-4 shadow-brutal-white ${isAdmin ? "select-none" : ""}`}
            id={`league-header-${group.leagueId}-${groupIndex}`}
          >
            <div className="flex items-center gap-3 sm:gap-4">
              <div className={`relative isolate h-10 w-10 flex-shrink-0 border-2 border-black shadow-brutal-sm sm:h-12 sm:w-12 ${group.leagueId === 9901 || group.leagueId === 268 || group.leagueId === 57 || group.leagueId === 1034 ? "bg-black" : "bg-white"}`}>
              {group.leagueLogo ? (
                <div className="absolute inset-1">
                  <Image
                    src={group.leagueLogo}
                    alt={group.leagueName}
                    fill
                    className="object-contain"
                    sizes="32px"
                    unoptimized
                  />
                </div>
              ) : (
                <div className="relative z-10 flex h-full w-full items-center justify-center text-lg font-black text-accent-primary sm:text-xl">
                  ⚽
                </div>
              )}
              </div>
              <div className="flex flex-col">
                <h2 className="text-lg sm:text-xl md:text-2xl font-black text-black uppercase tracking-tight">
                  {translateLeague(group.leagueName, language)}
                </h2>
              </div>
            </div>
            {isAdmin && (
              <span
                className="flex cursor-grab items-center justify-center self-center text-black/60 active:cursor-grabbing"
                aria-hidden
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  event.preventDefault();
                  pendingDrop.current = null;
                  setDropTarget(null);
                  setDragKey(group.key);
                }}
              >
                <svg width="14" height="18" viewBox="0 0 14 18" fill="currentColor">
                  <circle cx="4" cy="3" r="1.6" /><circle cx="10" cy="3" r="1.6" />
                  <circle cx="4" cy="9" r="1.6" /><circle cx="10" cy="9" r="1.6" />
                  <circle cx="4" cy="15" r="1.6" /><circle cx="10" cy="15" r="1.6" />
                </svg>
              </span>
            )}
          </div>

          {/* Match Cards */}
          <div className="grid gap-3 sm:gap-4 grid-cols-1">
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
