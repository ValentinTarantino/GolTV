"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Match } from "@/lib/types";

function formatDateISO(date: Date): string {
  return date.toLocaleString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).slice(0, 10);
}

export default function SearchBar() {
  const { t } = useLanguage();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || matches.length > 0) return;
    const dateStr = formatDateISO(new Date());
    fetch(`/api/matches?date=${dateStr}`)
      .then((r) => r.json())
      .then((data) => setMatches(data.matches ?? []))
      .catch(() => {});
  }, [isOpen, matches.length]);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const filtered = query.trim()
    ? matches.filter((m) => {
        const q = query.toLowerCase();
        return (
          m.homeTeam.name.toLowerCase().includes(q) ||
          m.awayTeam.name.toLowerCase().includes(q) ||
          m.league.name.toLowerCase().includes(q)
        );
      })
    : [];

  const handleSelect = useCallback(
    (match: Match) => {
      const params = new URLSearchParams();
      if (match._pelotaLibreSlug && match._pelotaLibreSources) {
        params.set("plSlug", match._pelotaLibreSlug);
        params.set("plSources", JSON.stringify(match._pelotaLibreSources));
      }
      params.set("home", match.homeTeam.name);
      params.set("away", match.awayTeam.name);
      params.set("league", match.league.name);
      if (match._streamId) params.set("streamId", match._streamId);
      const qs = params.toString();
      router.push(`/watch/${match.id}${qs ? `?${qs}` : ""}`);
      setIsOpen(false);
      setQuery("");
    },
    [router]
  );

  return (
    <div ref={containerRef} className="relative">
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="flex h-8 w-8 items-center justify-center text-white border-2 border-white bg-black shadow-brutal-sm hover:bg-white hover:text-black transition-colors"
          title={t.search.placeholder}
        >
          <Search size={14} strokeWidth={3} />
        </button>
      ) : (
        <div className="flex items-center gap-1">
          <div className="relative">
            <Search size={14} strokeWidth={3} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && (setIsOpen(false), setQuery(""))}
              placeholder={t.search.placeholder}
              className="w-40 sm:w-56 pl-8 pr-2 py-1.5 bg-black text-white text-xs font-bold border-2 border-white shadow-brutal-sm focus:border-accent-primary focus:outline-none"
            />
          </div>
          <button
            onClick={() => { setIsOpen(false); setQuery(""); }}
            className="flex h-8 w-8 items-center justify-center text-white border-2 border-white bg-black shadow-brutal-sm hover:bg-white hover:text-black transition-colors"
          >
            <X size={14} strokeWidth={3} />
          </button>
        </div>
      )}

      {isOpen && query.trim() && (
        <div className="absolute top-full mt-1 right-0 w-72 sm:w-80 max-h-80 overflow-y-auto bg-black border-2 border-white shadow-brutal z-50">
          {matches.length === 0 ? (
            <p className="p-3 text-xs text-text-muted text-center">{t.search.searching}</p>
          ) : filtered.length === 0 ? (
            <p className="p-3 text-xs text-text-muted text-center">{t.search.noResults}</p>
          ) : (
            filtered.map((m) => (
              <button
                key={m.id}
                onClick={() => handleSelect(m)}
                className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/10 transition-colors border-b border-white/10 last:border-0"
              >
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] font-bold text-text-muted uppercase truncate">
                    {m.league.name}
                  </span>
                  <span className="text-xs font-black text-white truncate">
                    {m.homeTeam.name} vs {m.awayTeam.name}
                  </span>
                </div>
                {m.status.short === "LIVE" || m.status.short === "1H" || m.status.short === "2H" ? (
                  <span className="shrink-0 ml-2 px-1.5 py-0.5 text-[9px] font-black bg-accent-red text-white border border-white">
                    LIVE
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
