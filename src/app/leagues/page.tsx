"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Trophy, ChevronRight } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { SUPPORTED_LEAGUES, LEAGUE_LOGOS } from "@/lib/constants";
import type { StandingsTable, StandingsTab, BracketRound } from "@/lib/types";

const COUNTRY_ORDER = [
  { name: "Internacional", flag: "🌎" },
  { name: "Argentina", flag: "🇦🇷" },
  { name: "Brasil", flag: "🇧🇷" },
  { name: "Uruguay", flag: "🇺🇾" },
  { name: "Chile", flag: "🇨🇱" },
  { name: "Colombia", flag: "🇨🇴" },
  { name: "España", flag: "🇪🇸" },
  { name: "Inglaterra", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { name: "Alemania", flag: "🇩🇪" },
  { name: "Italia", flag: "🇮🇹" },
  { name: "Estados Unidos", flag: "🇺🇸" },
];

const LEAGUES_PAGE_EXCLUDED_IDS = new Set([281, 5, 6]);

function groupByCountry() {
  const groups: Record<string, typeof SUPPORTED_LEAGUES> = {};
  for (const league of SUPPORTED_LEAGUES) {
    if (LEAGUES_PAGE_EXCLUDED_IDS.has(league.id)) continue;
    if (!groups[league.country]) groups[league.country] = [];
    groups[league.country].push(league);
  }
  return groups;
}

function TrendDots({ trend }: { trend: number[] }) {
  if (!trend || trend.length === 0) return <span className="text-gray-600">-</span>;
  return (
    <div className="flex gap-0.5 justify-center">
      {trend.map((v, i) => (
        <span
          key={i}
          className={`inline-block w-2 h-2 rounded-full ${
            v === 1 ? "bg-green-500" : v === 2 ? "bg-yellow-400" : "bg-red-500"
          }`}
          title={v === 1 ? "G" : v === 2 ? "E" : "P"}
        />
      ))}
    </div>
  );
}

function StandingsTable({
  table,
  t,
  showTrend,
}: {
  table: StandingsTable;
  t: ReturnType<typeof useLanguage>["t"];
  showTrend: boolean;
}) {
  const rows = table.standings;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-white/5 border-b-2 border-white/20">
            <th className="px-2 py-3 text-xs font-black uppercase tracking-wider text-gray-400 w-8 text-center">#</th>
            <th className="px-2 py-3 text-xs font-black uppercase tracking-wider text-gray-400">{t.leagues.team}</th>
            <th className="px-2 py-3 text-xs font-black uppercase tracking-wider text-gray-400 text-center w-8">{t.leagues.gp}</th>
            <th className="px-2 py-3 text-xs font-black uppercase tracking-wider text-gray-400 text-center w-8 hidden sm:table-cell">{t.leagues.g}</th>
            <th className="px-2 py-3 text-xs font-black uppercase tracking-wider text-gray-400 text-center w-8 hidden sm:table-cell">{t.leagues.e}</th>
            <th className="px-2 py-3 text-xs font-black uppercase tracking-wider text-gray-400 text-center w-8 hidden sm:table-cell">{t.leagues.p}</th>
            <th className="px-2 py-3 text-xs font-black uppercase tracking-wider text-gray-400 text-center w-12 hidden md:table-cell">{t.leagues.gol}</th>
            <th className="px-2 py-3 text-xs font-black uppercase tracking-wider text-gray-400 text-center w-8 hidden md:table-cell">{t.leagues.gd}</th>
            {showTrend && (
              <th className="px-2 py-3 text-xs font-black uppercase tracking-wider text-gray-400 text-center w-16 hidden lg:table-cell">{t.leagues.form}</th>
            )}
            <th className="px-2 py-3 text-xs font-black uppercase tracking-wider text-gray-400 text-center w-10 bg-white/5">{t.leagues.pts}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.team.name || i}
              className={`border-b border-white/5 hover:bg-white/5 transition-colors ${
                row.destinationColor ? "border-l-2" : ""
              }`}
              style={row.destinationColor ? { borderLeftColor: row.destinationColor } : undefined}
            >
              <td className="px-2 py-2.5 text-center">
                <span
                  className={`inline-flex items-center justify-center w-6 h-6 text-xs font-black ${
                    row.rank <= 3
                      ? "bg-accent-primary text-black"
                      : row.rank >= rows.length - 2
                      ? "bg-red-500/80 text-white"
                      : "bg-white/10 text-white"
                  }`}
                >
                  {row.rank}
                </span>
              </td>
              <td className="px-2 py-2.5">
                <span className="font-bold text-white text-sm truncate block">{row.team.name}</span>
              </td>
              <td className="px-2 py-2.5 text-center text-sm text-gray-300 font-bold">{row.played}</td>
              <td className="px-2 py-2.5 text-center text-sm text-green-400 font-bold hidden sm:table-cell">{row.won}</td>
              <td className="px-2 py-2.5 text-center text-sm text-yellow-400 font-bold hidden sm:table-cell">{row.drawn}</td>
              <td className="px-2 py-2.5 text-center text-sm text-red-400 font-bold hidden sm:table-cell">{row.lost}</td>
              <td className="px-2 py-2.5 text-center text-sm text-gray-300 font-bold hidden md:table-cell">
                {row.goalsFor}:{row.goalsAgainst}
              </td>
              <td className="px-2 py-2.5 text-center text-sm font-bold hidden md:table-cell">
                <span className={row.goalsDiff > 0 ? "text-green-400" : row.goalsDiff < 0 ? "text-red-400" : "text-gray-400"}>
                  {row.goalsDiff > 0 ? "+" : ""}{row.goalsDiff}
                </span>
              </td>
              {showTrend && (
                <td className="px-2 py-2.5 text-center hidden lg:table-cell">
                  <TrendDots trend={row.trend} />
                </td>
              )}
              <td className="px-2 py-2.5 text-center bg-white/5">
                <span className="font-black text-white text-sm">{row.points}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BracketView({ rounds, t }: { rounds: BracketRound[]; t: ReturnType<typeof useLanguage>["t"] }) {
  if (rounds.length === 0) {
    return (
      <div className="p-8 text-center">
        <Trophy size={40} className="mx-auto text-gray-600 mb-3" />
        <p className="text-gray-400 font-bold text-sm uppercase tracking-wider">{t.leagues.noBracket}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rounds.map((round) => (
        <div key={round.name} className="border-2 border-white/20">
          <div className="bg-white/5 px-4 py-2 border-b-2 border-white/20">
            <h3 className="font-black text-accent-primary uppercase text-sm tracking-wider">{round.name}</h3>
          </div>
          <div className="divide-y divide-white/10">
            {round.matches.map((match, i) => (
              <div key={i} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex-1 text-right">
                  <span className="font-bold text-white text-sm">{match.homeTeam}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {match.homeScore !== "" ? (
                    <>
                      <span className="font-black text-white text-lg bg-white/10 px-3 py-1 min-w-[2rem] text-center">{match.homeScore}</span>
                      <span className="text-gray-500 font-bold">-</span>
                      <span className="font-black text-white text-lg bg-white/10 px-3 py-1 min-w-[2rem] text-center">{match.awayScore}</span>
                    </>
                  ) : (
                    <span className="text-gray-500 font-bold text-sm px-2">vs</span>
                  )}
                </div>
                <div className="flex-1 text-left">
                  <span className="font-bold text-white text-sm">{match.awayTeam}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TabButtons({
  tabs,
  activeTab,
  onSelect,
  generalLabel,
  tabNames,
}: {
  tabs: StandingsTab[];
  activeTab: number;
  onSelect: (i: number) => void;
  generalLabel: string;
  tabNames: Record<string, string>;
}) {
  if (tabs.length <= 1) return null;
  return (
    <div className="flex gap-1 px-2 sm:px-4 pt-3 pb-1 overflow-x-auto border-b-2 border-white/10">
      {tabs.map((tab, i) => (
        <button
          key={i}
          onClick={() => onSelect(i)}
          className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all ${
            activeTab === i
              ? "bg-accent-primary text-black border-2 border-black"
              : "text-gray-400 hover:text-white border-2 border-transparent"
          }`}
        >
          {tabNames[tab.name] || tab.name || generalLabel}
        </button>
      ))}
    </div>
  );
}

export default function LeaguesPage() {
  const { t } = useLanguage();
  const grouped = groupByCountry();
  const [selectedId, setSelectedId] = useState(128);
  const [data, setData] = useState<{ tabs: StandingsTab[]; brackets: BracketRound[] }>({ tabs: [], brackets: [] });
  const [activeTab, setActiveTab] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const fetchIdRef = useRef(0);

  const selectedLeague = SUPPORTED_LEAGUES.find((l) => l.id === selectedId);

  useEffect(() => {
    const currentFetchId = ++fetchIdRef.current;
    const controller = new AbortController();

    async function load() {
      try {
        const res = await fetch(`/api/standings?leagueId=${selectedId}`, { signal: controller.signal });
        const d = await res.json();
        if (currentFetchId === fetchIdRef.current) {
          const allTabs = d.tabs || [];
          const namedTabs = allTabs.filter((tab: { name: string }) => tab.name !== "General");
          const generalTabs = allTabs.filter((tab: { name: string }) => tab.name === "General");
          const anualTab = generalTabs.length > 0 ? [{ ...generalTabs[generalTabs.length - 1], name: t.leagues.anual }] : [];
          setData({ tabs: [...namedTabs, ...anualTab], brackets: d.brackets || [] });
          setActiveTab(0);
          setIsLoading(false);
        }
      } catch {
        if (currentFetchId === fetchIdRef.current) {
          setData({ tabs: [], brackets: [] });
          setActiveTab(0);
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      controller.abort();
    };
  }, [selectedId, t.leagues.anual]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  const selectLeague = (id: number) => {
    setSelectedId(id);
    setSidebarOpen(false);
  };

  const currentTab = data.tabs[activeTab];
  const hasTabs = data.tabs.length > 0;
  const hasBrackets = data.brackets.length > 0;
  const hasStandings = hasTabs && currentTab?.tables.some((tbl) => tbl.standings.length > 0);
  const hasData = hasStandings || hasBrackets;

  const portalTarget = typeof document !== "undefined" ? document.body : null;

  return (
    <>
      {portalTarget && isMobile && createPortal(
        <>
          {sidebarOpen && <div className="fixed inset-0 bg-black/60 z-[55] lg:hidden" onClick={() => setSidebarOpen(false)} />}

          <aside
            className={`
              fixed top-0 left-0 z-[60]
              h-screen
              w-72
              bg-accent-primary
              border-4 border-black
              overflow-y-auto
              transition-transform duration-300
              ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
            `}
          >
            <div className="bg-accent-primary border-b-4 border-black p-3 flex items-center justify-between sticky top-0 z-10">
              <span className="font-black text-black uppercase text-sm tracking-wider">{t.leagues.countries}</span>
              <button onClick={() => setSidebarOpen(false)} className="flex items-center justify-center w-8 h-8 text-black border-2 border-pink-500 bg-white hover:bg-pink-500 hover:text-white font-black text-sm transition-colors">X</button>
            </div>
            <nav className="p-3 space-y-1">
              {COUNTRY_ORDER.map((country) => {
                const leagues = grouped[country.name];
                if (!leagues?.length) return null;
                return (
                  <div key={country.name} className="mb-3">
                    <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
                      <span className="font-black text-black uppercase text-xs tracking-wider">
                        {t.leagues.countryNames[country.name as keyof typeof t.leagues.countryNames] || country.name}
                      </span>
                    </div>
                    {leagues.map((league) => (
                      <button
                        key={league.id}
                        onClick={() => selectLeague(league.id)}
                        className={`w-full text-left px-3 py-2 text-sm font-bold transition-all flex items-center gap-2 border-2 ${
                          selectedId === league.id
                            ? "bg-black text-accent-primary border-black shadow-brutal-sm"
                            : "text-black hover:bg-black/10 border-transparent"
                        }`}
                      >
                        <Image src={LEAGUE_LOGOS[league.id] || ""} alt={league.name} width={28} height={28} className="object-contain shrink-0" unoptimized />
                        <span className="truncate">{league.name}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </nav>
          </aside>
        </>,
        document.body
      )}

      <div className="min-h-screen bg-bg-primary">
        <div className="px-3 sm:px-4 md:px-6 py-4 sm:py-6">
          <div className="flex gap-0">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden fixed bottom-20 left-4 z-[70] bg-accent-primary text-black border-4 border-black shadow-brutal p-3 font-black"
            >
              <ChevronRight size={20} className={`transition-transform ${sidebarOpen ? "rotate-180" : ""}`} />
            </button>

            {/* Desktop sidebar (in normal flow) */}
            <aside
              className={`
                hidden lg:block sticky top-20
                h-[calc(100vh-5rem)]
                w-64 xl:w-72
                bg-accent-primary
                border-t-4 border-b-4 border-r-4 border-black
                overflow-y-auto
                shrink-0
              `}
            >
              <nav className="p-3 space-y-1">
                {COUNTRY_ORDER.map((country) => {
                  const leagues = grouped[country.name];
                  if (!leagues?.length) return null;
                  return (
                    <div key={country.name} className="mb-3">
                      <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
                        <span className="font-black text-black uppercase text-xs tracking-wider">
                          {t.leagues.countryNames[country.name as keyof typeof t.leagues.countryNames] || country.name}
                        </span>
                      </div>
                      {leagues.map((league) => (
                        <button
                          key={league.id}
                          onClick={() => selectLeague(league.id)}
                          className={`w-full text-left px-3 py-2 text-sm font-bold transition-all flex items-center gap-2 border-2 ${
                            selectedId === league.id
                              ? "bg-black text-accent-primary border-black shadow-brutal-sm"
                              : "text-black hover:bg-black/10 border-transparent"
                          }`}
                        >
                          <Image src={LEAGUE_LOGOS[league.id] || ""} alt={league.name} width={28} height={28} className="object-contain shrink-0" unoptimized />
                          <span className="truncate">{league.name}</span>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </nav>
            </aside>

            <main className="flex-1 min-w-0">
            {selectedLeague && (
              <div className="bg-accent-primary border-4 border-black shadow-brutal p-4 sm:p-5 mb-4 sm:mb-6 flex items-center gap-3 sm:gap-4">
                <Image src={LEAGUE_LOGOS[selectedLeague.id] || ""} alt={selectedLeague.name} width={48} height={48} className="object-contain shrink-0" unoptimized />
                <div>
                  <h1 className="font-black text-black uppercase text-lg sm:text-xl tracking-tight">{selectedLeague.name}</h1>
                  <p className="text-black/70 text-xs sm:text-sm font-bold">{selectedLeague.countryFlag} {selectedLeague.country}</p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <Trophy size={20} className="text-black/40" />
                </div>
              </div>
            )}

            <div className="border-4 border-white bg-bg-card overflow-hidden">
              {isLoading ? (
                <div className="p-8 text-center">
                  <div className="animate-spin inline-block w-8 h-8 border-4 border-accent-primary border-t-transparent rounded-full mb-3" />
                  <p className="text-gray-400 font-bold text-sm uppercase tracking-wider">{t.leagues.loading}</p>
                </div>
              ) : !hasData ? (
                <div className="p-8 text-center">
                  <Trophy size={40} className="mx-auto text-gray-600 mb-3" />
                  <p className="text-gray-400 font-bold text-sm uppercase tracking-wider">{t.leagues.noStandings}</p>
                  <p className="text-gray-500 text-xs mt-1">{t.leagues.noStandingsDesc}</p>
                </div>
              ) : (
                <>
                  {/* Tabs */}
                  {hasTabs && (
                    <TabButtons tabs={data.tabs} activeTab={activeTab} onSelect={setActiveTab} generalLabel={t.leagues.general} tabNames={t.leagues.tabNames} />
                  )}

                  <div className="p-2 sm:p-4">
                    {/* Standings tables for current tab */}
                    {hasStandings && (
                      <div className="space-y-6">
                        {currentTab.tables.map((table) => (
                          <div key={table.name}>
                            {currentTab.tables.length > 1 && (
                              <div className="bg-white/5 px-4 py-2 mb-2 border-b-2 border-white/20">
                                <h2 className="font-black text-accent-primary uppercase text-sm tracking-wider">{table.name}</h2>
                              </div>
                            )}
                            <StandingsTable table={table} t={t} showTrend={true} />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Brackets */}
                    {hasBrackets && (
                      <div className={hasStandings ? "mt-6 border-t-2 border-white/20 pt-4" : ""}>
                        <BracketView rounds={data.brackets} t={t} />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

          </main>
        </div>
      </div>
    </div>
    </>
  );
}
