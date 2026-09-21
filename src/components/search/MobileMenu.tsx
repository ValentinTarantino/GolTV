"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Menu, X, Search, Trophy } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Match } from "@/lib/types";

function formatDateISO(date: Date): string {
  return date.toLocaleString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).slice(0, 10);
}

export default function MobileMenu() {
  const { language, setLanguage, t } = useLanguage();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

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
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
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
    <div className="md:hidden">
      <button
        onClick={() => setIsOpen(true)}
        className="flex h-8 w-8 items-center justify-center text-white border-2 border-white bg-black shadow-brutal-sm hover:bg-white hover:text-black transition-colors"
      >
        <Menu size={14} strokeWidth={3} />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-bg-primary">
          <div className="flex items-center justify-between px-4 py-3 border-b-2 border-white">
            <span className="text-white font-black text-sm uppercase">Menu</span>
            <button
              onClick={() => { setIsOpen(false); setQuery(""); }}
              className="flex h-8 w-8 items-center justify-center text-white border-2 border-white bg-black hover:bg-white hover:text-black transition-colors"
            >
              <X size={14} strokeWidth={3} />
            </button>
          </div>

          <div className="px-4 py-4 border-b-2 border-white">
            <div className="relative">
              <Search size={14} strokeWidth={3} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.search.placeholder}
                className="w-full pl-9 pr-3 py-2.5 bg-black text-white text-sm font-bold border-2 border-white focus:border-accent-primary focus:outline-none"
              />
            </div>
          </div>

          <div className="px-4 py-3 border-b-2 border-white">
            <div className="flex items-center border-2 border-white bg-black font-black text-sm">
              <button
                onClick={() => setLanguage("es")}
                className={`flex-1 py-2 transition-colors ${
                  language === "es" ? "bg-white text-black" : "text-white hover:text-accent-primary"
                }`}
              >
                ES
              </button>
              <button
                onClick={() => setLanguage("en")}
                className={`flex-1 py-2 transition-colors ${
                  language === "en" ? "bg-white text-black" : "text-white hover:text-accent-primary"
                }`}
              >
                EN
              </button>
            </div>
          </div>

          <div className="px-4 py-3 border-b-2 border-white">
            <Link
              href="/leagues"
              onClick={() => setIsOpen(false)}
              className="flex items-center justify-center gap-2 w-full py-2.5 bg-accent-primary text-black border-2 border-black shadow-brutal-sm font-black text-sm uppercase"
            >
              <Trophy size={16} strokeWidth={3} />
              <span>{t.leagues?.title || "LIGAS"}</span>
            </Link>
          </div>

          <div className="flex-1 overflow-y-auto">
            {query.trim() && (
              filtered.length === 0 ? (
                <p className="p-4 text-xs text-text-muted text-center">{t.search.noResults}</p>
              ) : (
                filtered.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => handleSelect(m)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/10 transition-colors border-b border-white/10"
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] font-bold text-text-muted uppercase truncate">
                        {m.league.name}
                      </span>
                      <span className="text-sm font-black text-white truncate">
                        {m.homeTeam.name} vs {m.awayTeam.name}
                      </span>
                    </div>
                    {m.status.short === "LIVE" || m.status.short === "1H" || m.status.short === "2H" ? (
                      <span className="shrink-0 ml-2 px-2 py-0.5 text-[10px] font-black bg-accent-red text-white border border-white">
                        LIVE
                      </span>
                    ) : null}
                  </button>
                ))
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
