"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Menu, X, Search, Trophy, Play, Volleyball } from "lucide-react";
import TennisRacketIcon from "@/components/icons/TennisRacketIcon";
import BoxingGloveIcon from "@/components/icons/BoxingGloveIcon";
import RacingHelmetIcon from "@/components/icons/RacingHelmetIcon";
import { useLanguage } from "@/contexts/LanguageContext";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import type { Match } from "@/lib/types";
import TimeZoneSelect from "@/components/layout/TimeZoneSelect";

function formatDateISO(date: Date): string {
  return date.toLocaleString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).slice(0, 10);
}

export default function MobileMenu() {
  const { language, setLanguage, t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname?.startsWith(`${href}/`) === true;
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
      const qs = match._preferredPlayer ? `?player=${match._preferredPlayer}` : "";
      router.push(`/watch/${match.id}${qs}`);
      setIsOpen(false);
      setQuery("");
    },
    [router]
  );

  return (
    <div className="xl:hidden">
      <button
        onClick={() => setIsOpen(true)}
        className="flex h-8 w-8 items-center justify-center text-white border-2 border-white bg-black shadow-[4px_4px_0px_0px_#a3e635] hover:bg-white hover:text-black hover:shadow-[4px_4px_0px_0px_#000] transition-colors"
      >
        <Menu size={14} strokeWidth={3} />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-bg-primary">
          <div className="flex items-center justify-between px-4 py-3 border-b-2 border-white">
            <span className="text-white font-black text-sm uppercase">Menu</span>
            <button
              onClick={() => { setIsOpen(false); setQuery(""); }}
              className="flex h-8 w-8 items-center justify-center text-white border-2 border-white bg-black shadow-[4px_4px_0px_0px_#a3e635] hover:bg-white hover:text-black hover:shadow-[4px_4px_0px_0px_#000] transition-colors"
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
                className="w-full pl-9 pr-3 py-2.5 bg-black text-white text-sm font-bold border-2 border-[#f97316] shadow-[4px_4px_0px_0px_#f97316] focus:border-[#fb923c] focus:outline-none"
              />
            </div>
          </div>

          <div className="px-4 py-3 border-b-2 border-white">
            <div className="flex items-center border-2 border-[#a3e635] bg-black shadow-[4px_4px_0px_0px_#a3e635] font-black text-sm">
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
            <TimeZoneSelect mobile />
          </div>

          <div className="px-4 py-3 border-b-2 border-white">
            <Link
              href="/leagues"
              onClick={() => setIsOpen(false)}
              className={isActive("/leagues")
                ? "flex items-center justify-center gap-2 w-full py-2.5 border-2 border-[#3b82f6] bg-black text-[#3b82f6] shadow-[4px_4px_0px_0px_#3b82f6] font-black text-sm uppercase"
                : "flex items-center justify-center gap-2 w-full py-2.5 border-2 border-white bg-black text-white shadow-[4px_4px_0px_0px_#a3e635] font-black text-sm uppercase hover:text-[#3b82f6] hover:border-[#3b82f6] hover:shadow-[4px_4px_0px_0px_#3b82f6] transition-colors"}
            >
              <Trophy size={16} strokeWidth={3} />
              <span>{t.leagues?.title || "LIGAS"}</span>
            </Link>
          </div>

          <div className="px-4 py-3 border-b-2 border-white">
            <Link
              href="/lpf"
              onClick={() => setIsOpen(false)}
              className={isActive("/lpf")
                ? "flex items-center justify-center gap-2 w-full py-2.5 border-2 border-[#38bdf8] bg-black text-[#38bdf8] shadow-[4px_4px_0px_0px_#38bdf8] font-black text-sm uppercase"
                : "flex items-center justify-center gap-2 w-full py-2.5 border-2 border-white bg-black text-white shadow-[4px_4px_0px_0px_#a3e635] font-black text-sm uppercase hover:text-[#38bdf8] hover:border-[#38bdf8] hover:shadow-[4px_4px_0px_0px_#38bdf8] transition-colors"}
              id="mobile-lpf"
            >
              <Play size={16} strokeWidth={3} fill="currentColor" />
              <span>{t.lpf?.nav || "LPF PLAY"}</span>
            </Link>
          </div>

          <div className="px-4 py-3 border-b-2 border-white">
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/50">
              <Volleyball size={13} strokeWidth={3} />
              {t.header.moreSports}
            </div>
            <div className="flex flex-col gap-2">
              <Link
                href="/nba"
                onClick={() => setIsOpen(false)}
                className={isActive("/nba")
                  ? "flex items-center justify-center gap-2 w-full py-2.5 border-2 border-[#f97316] bg-black text-[#f97316] shadow-[4px_4px_0px_0px_#f97316] font-black text-sm uppercase"
                  : "flex items-center justify-center gap-2 w-full py-2.5 border-2 border-white bg-black text-white shadow-[4px_4px_0px_0px_#a3e635] font-black text-sm uppercase hover:text-[#f97316] hover:border-[#f97316] hover:shadow-[4px_4px_0px_0px_#f97316] transition-colors"}
                id="mobile-nba"
              >
                <Volleyball size={16} strokeWidth={3} />
                <span>{t.nba?.nav || "NBA"}</span>
              </Link>
              <Link
                href="/boxeo"
                onClick={() => setIsOpen(false)}
                className={isActive("/boxeo")
                  ? "flex items-center justify-center gap-2 w-full py-2.5 border-2 border-[#ef4444] bg-black text-[#ef4444] shadow-[4px_4px_0px_0px_#ef4444] font-black text-sm uppercase"
                  : "flex items-center justify-center gap-2 w-full py-2.5 border-2 border-white bg-black text-white shadow-[4px_4px_0px_0px_#a3e635] font-black text-sm uppercase hover:text-[#ef4444] hover:border-[#ef4444] hover:shadow-[4px_4px_0px_0px_#ef4444] transition-colors"}
                id="mobile-lucha"
              >
                <BoxingGloveIcon size={16} strokeWidth={3} />
                <span>{t.combat?.nav || "LUCHA"}</span>
              </Link>
              <Link
                href="/tennis"
                onClick={() => setIsOpen(false)}
                className={isActive("/tennis")
                  ? "flex items-center justify-center gap-2 w-full py-2.5 border-2 border-[#eab308] bg-black text-[#eab308] shadow-[4px_4px_0px_0px_#eab308] font-black text-sm uppercase"
                  : "flex items-center justify-center gap-2 w-full py-2.5 border-2 border-white bg-black text-white shadow-[4px_4px_0px_0px_#a3e635] font-black text-sm uppercase hover:text-[#eab308] hover:border-[#eab308] hover:shadow-[4px_4px_0px_0px_#eab308] transition-colors"}
                id="mobile-tennis"
              >
                <TennisRacketIcon size={16} strokeWidth={3} />
                <span>{t.tennis?.nav || "TENIS"}</span>
              </Link>
              <Link
                href="/motor"
                onClick={() => setIsOpen(false)}
                className={isActive("/motor")
                  ? "flex items-center justify-center gap-2 w-full py-2.5 border-2 border-[#22d3ee] bg-black text-[#22d3ee] shadow-[4px_4px_0px_0px_#22d3ee] font-black text-sm uppercase"
                  : "flex items-center justify-center gap-2 w-full py-2.5 border-2 border-white bg-black text-white shadow-[4px_4px_0px_0px_#a3e635] font-black text-sm uppercase hover:text-[#22d3ee] hover:border-[#22d3ee] hover:shadow-[4px_4px_0px_0px_#22d3ee] transition-colors"}
                id="mobile-motor"
              >
                <RacingHelmetIcon size={16} strokeWidth={3} />
                <span>{t.motor?.nav || "CARRERAS"}</span>
              </Link>
            </div>
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
