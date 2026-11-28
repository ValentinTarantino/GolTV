"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Maximize2, Minimize2, RefreshCw, Flag } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTimeZone } from "@/contexts/TimeZoneContext";
import VideoPlayer from "@/components/player/VideoPlayer";
import ChatBox from "@/components/chat/ChatBox";
import ViewerBadge from "@/components/matches/ViewerBadge";
import NetworkNotice from "@/components/ui/NetworkNotice";
import { withMatchParam } from "@/lib/viewer-id";
import { displayMotorsportText } from "@/i18n/dictionaries";

interface MotorsportEvent {
  id: number;
  title: string;
  league: string;
  country: string;
  sport: string;
  sportName: string;
  startsAt: string;
  timestamp: number;
  status: "live" | "upcoming" | "finished";
}

type ListState = "loading" | "ready" | "error";
type StreamState = "loading" | "ready" | "error";

interface StreamSource {
  src: string;
  kind: "hls" | "iframe";
  quality?: string;
}

interface ParsedSession {
  eventName: string;
  sessionType: string;
  sessionNumber?: number;
  fullTitle: string;
}

/** Parse "Qatar Grand Prix (Qatar) - Practice 1" into components. */
function parseMotorsportTitle(title: string, language: string): ParsedSession {
  const translated = displayMotorsportText(title, language);
  const dashIndex = translated.lastIndexOf(" - ");
  if (dashIndex === -1) {
    return { eventName: translated, sessionType: translated, fullTitle: translated };
  }
  const eventName = translated.slice(0, dashIndex).trim();
  const sessionType = translated.slice(dashIndex + 3).trim();
  const numMatch = sessionType.match(/\b(\d+)\b/);
  return {
    eventName,
    sessionType,
    sessionNumber: numMatch ? Number.parseInt(numMatch[1], 10) : undefined,
    fullTitle: translated,
  };
}

/** Session type classification for styling and ordering. */
type SessionKind = "practice" | "qualifying" | "sprint" | "race" | "other";

function classifySession(sessionType: string): SessionKind {
  const lower = sessionType.toLowerCase();
  if (lower.includes("practice") || lower.includes("práctica") || lower.includes("entrenamiento")) return "practice";
  if (lower.includes("qualifying") || lower.includes("clasificación") || lower.includes("qualification")) return "qualifying";
  if (lower.includes("sprint")) return "sprint";
  if (lower.includes("race") || lower.includes("carrera") || lower.includes("feature")) return "race";
  return "other";
}

const SESSION_KIND_ORDER: Record<SessionKind, number> = {
  practice: 0,
  qualifying: 1,
  sprint: 2,
  race: 3,
  other: 4,
};

const SESSION_KIND_LABELS: Record<SessionKind, { es: string; en: string; color: string; bg: string; border: string }> = {
  practice: { es: "PRÁCTICA", en: "PRACTICE", color: "text-blue-300", bg: "bg-blue-500/10", border: "border-blue-500/50" },
  qualifying: { es: "CLASIFICACIÓN", en: "QUALIFYING", color: "text-purple-300", bg: "bg-purple-500/10", border: "border-purple-500/50" },
  sprint: { es: "SPRINT", en: "SPRINT", color: "text-orange-300", bg: "bg-orange-500/10", border: "border-orange-500/50" },
  race: { es: "CARRERA", en: "RACE", color: "text-red-300", bg: "bg-red-500/10", border: "border-red-500/50" },
  other: { es: "OTRO", en: "OTHER", color: "text-gray-300", bg: "bg-gray-500/10", border: "border-gray-500/50" },
};

/** Kickoff arrives in UTC; render it in the zone picked in the navbar. */
function formatTime(start: string, _lang: string, timeZone: string): string {
  if (!start) return "";
  const date = new Date(start);
  if (Number.isNaN(date.getTime())) return "";

  // Format in target timezone: DD/MM, HH:MM (24h) + AM/PM suffix
  const parts24 = new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).formatToParts(date);

  const parts12 = new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).formatToParts(date);

  const get = (parts: Intl.DateTimeFormatPart[], type: string) => parts.find(p => p.type === type)?.value ?? "";
  const day = get(parts24, "day");
  const month = get(parts24, "month");
  const hour = get(parts24, "hour").padStart(2, "0");
  const minute = get(parts24, "minute");
  const dayPeriod = get(parts12, "dayPeriod").toUpperCase().replace(".", "");

  return `${day}/${month}, ${hour}:${minute} ${dayPeriod}`;
}

function formatCountdown(ms: number, lang: string): string {
  if (ms <= 0) return lang === "es" ? "Iniciando..." : "Starting...";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

interface EventGroup {
  eventName: string;
  league: string;
  country: string;
  sessions: (MotorsportEvent & { kind: SessionKind; parsed: ParsedSession })[];
}

export default function MotorPage() {
  const { t, language } = useLanguage();
  const { timeZone } = useTimeZone();
  const copy = t.motor;

  const [matches, setMatches] = useState<MotorsportEvent[]>([]);
  const [listState, setListState] = useState<ListState>("loading");
  const [listReload, setListReload] = useState(0);

  const [activeId, setActiveId] = useState<number | null>(null);
  const [streamSources, setStreamSources] = useState<StreamSource[]>([]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [streamState, setStreamState] = useState<StreamState>("loading");
  const [streamReload, setStreamReload] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const stageRef = useRef<HTMLDivElement | null>(null);

  // Live clock for countdowns
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/motor/matches")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { matches?: MotorsportEvent[] }) => {
        if (cancelled) return;
        const next = Array.isArray(data.matches) ? data.matches : [];
        setMatches(next);
        setListState("ready");
        setActiveId(
          (current) =>
            current ?? next.find((match) => match.status !== "finished")?.id ?? null
        );
      })
      .catch(() => {
        if (cancelled) return;
        setMatches([]);
        setListState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [listReload]);

  useEffect(() => {
    if (activeId === null) return;
    let cancelled = false;
    fetch(`/api/motor/${activeId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { sources?: StreamSource[] }) => {
        if (cancelled) return;
        const sources = Array.isArray(data.sources) ? data.sources.filter((s) => s.src) : [];
        if (!sources.length) {
          setStreamState("error");
          return;
        }
        setStreamSources(sources);
        setSourceIndex(0);
        setStreamState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setStreamState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [activeId, streamReload]);

  // Finished sessions drop out of the agenda entirely
  const visibleMatches = useMemo(
    () => matches.filter((match) => match.status !== "finished"),
    [matches]
  );

  // Parse and enrich matches with session kind
  const enrichedMatches = useMemo(() =>
    visibleMatches.map((match) => {
      const parsed = parseMotorsportTitle(match.title, language);
      const kind = classifySession(parsed.sessionType);
      return { ...match, kind, parsed };
    }),
    [visibleMatches, language]
  );

  const activeMatch = enrichedMatches.find((match) => match.id === activeId) ?? null;
  const activeSource = streamSources[sourceIndex] ?? null;

  // Group by event (Grand Prix weekend)
  const eventGroups = useMemo((): EventGroup[] => {
    const map = new Map<string, EventGroup>();
    for (const match of enrichedMatches) {
      const key = match.parsed.eventName;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          eventName: match.parsed.eventName,
          league: match.league,
          country: match.country,
          sessions: [match],
        });
      } else {
        existing.sessions.push(match);
      }
    }
    // Sort sessions within each event by session kind order, then by time
    for (const group of map.values()) {
      group.sessions.sort((a, b) =>
        SESSION_KIND_ORDER[a.kind] - SESSION_KIND_ORDER[b.kind] ||
        a.timestamp - b.timestamp
      );
    }
    // Sort events by earliest session time
    return [...map.values()].sort((a, b) =>
      (a.sessions[0]?.timestamp ?? 0) - (b.sessions[0]?.timestamp ?? 0)
    );
  }, [enrichedMatches]);

  const reloadStream = useCallback(() => {
    setStreamState("loading");
    setStreamReload((n) => n + 1);
  }, []);

  const reloadList = useCallback(() => {
    setListState("loading");
    setListReload((n) => n + 1);
  }, []);

  const selectMatch = useCallback(
    (id: number) => {
      if (id === activeId) {
        setStreamState("loading");
        setStreamReload((n) => n + 1);
        return;
      }
      setStreamState("loading");
      setActiveId(id);
    },
    [activeId]
  );

  // Auto-retry for live sessions without sources yet
  useEffect(() => {
    if (streamState !== "error" || activeId === null) return;
    const live = matches.find((match) => match.id === activeId)?.status === "live";
    const timer = setInterval(() => setStreamReload((n) => n + 1), live ? 25_000 : 45_000);
    return () => clearInterval(timer);
  }, [streamState, activeId, matches]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void stageRef.current?.requestFullscreen();
    }
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  return (
    <main className="min-h-screen">
      <section className="mx-auto max-w-7xl px-3 py-7 sm:px-4 md:px-6 md:py-10">
        <NetworkNotice />
        <div className="flex flex-col gap-5">
          {/* PLAYER AREA */}
          <div
            ref={stageRef}
            className={`grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] ${isFullscreen ? "bg-neutral-950 p-3" : ""}`}
          >
            <div className="flex min-w-0 flex-col gap-4">
              {/* NOW PLAYING HEADER */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-2 border-white bg-black px-3 py-2 shadow-brutal">
                <span className="text-[10px] font-black uppercase tracking-widest text-white sm:text-xs">
                  {copy.nowPlaying}
                </span>
                <span className="flex min-w-0 items-center gap-2">
                  {activeMatch && (
                    <ViewerBadge matchId={String(activeMatch.id)} active={activeMatch.status === "live"} />
                  )}
                  <span className="flex min-w-0 items-center gap-2 truncate">
                    {activeMatch ? (
                      <>
                        {activeMatch.status === "live" && (
                          <span className="shrink-0 flex items-center justify-center h-5 px-2 text-[8px] font-black uppercase text-white bg-accent-red">
                            {copy.live}
                          </span>
                        )}
                        <span className="text-xs font-black uppercase text-accent-primary sm:text-sm truncate">
                          {displayMotorsportText(activeMatch.parsed.eventName, language)}
                        </span>
                        {activeMatch.status !== "live" && (
                          <span className="text-[10px] font-bold uppercase text-white/60">
                            {displayMotorsportText(activeMatch.parsed.sessionType, language)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-xs font-black uppercase text-accent-primary sm:text-sm">{copy.noEvent}</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    title={isFullscreen ? copy.exitFullscreen : copy.fullscreen}
                    aria-label={isFullscreen ? copy.exitFullscreen : copy.fullscreen}
                    className="shrink-0 border border-white bg-black p-1.5 text-white transition-colors hover:bg-accent-primary hover:text-black"
                  >
                    {isFullscreen ? <Minimize2 size={14} strokeWidth={3} /> : <Maximize2 size={14} strokeWidth={3} />}
                  </button>
                </span>
              </div>

              <p className="bg-black/50 px-3 py-1.5 text-[10px] font-bold uppercase leading-snug tracking-wide text-gray-400 sm:text-[11px]">
                {copy.patienceNotice}
              </p>

              {/* VIDEO PLAYER */}
              {streamState === "ready" && activeSource && activeMatch ? (
                <VideoPlayer
                  url={withMatchParam(activeSource.src, String(activeMatch.id))}
                  title={displayMotorsportText(activeMatch.parsed.fullTitle, language)}
                  kind={activeSource.kind}
                  preferFastStart
                />
              ) : (
                <div className="relative flex aspect-video w-full items-center justify-center border-3 border-white bg-black sm:border-4">
                  {streamState === "loading" ? (
                    <div className="flex flex-col items-center gap-3 px-6 text-center">
                      <RefreshCw size={26} strokeWidth={3} className="animate-spin text-[#a855f7]" />
                      <span className="text-xs font-black uppercase tracking-widest text-[#a855f7] sm:text-sm">
                        {copy.loadingStream}
                      </span>
                    </div>
                  ) : (
                    <div className="flex max-w-sm flex-col items-center gap-3 px-6 text-center">
                      <AlertCircle size={30} strokeWidth={3} className="text-accent-red" />
                      {activeMatch?.status === "upcoming" ? (
                        <span className="text-xs font-medium leading-relaxed text-gray-300">
                          {copy.sourcesAtEvent}
                        </span>
                      ) : (
                        <>
                          <span className="text-sm font-black uppercase text-white">{copy.unavailable}</span>
                          <span className="text-xs font-medium leading-relaxed text-gray-400">
                            {copy.unavailableDesc}
                          </span>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={reloadStream}
                        className="mt-1 border-2 border-black bg-accent-primary px-3 py-1.5 text-[10px] font-black uppercase text-black shadow-btn transition-transform hover:-translate-y-0.5"
                      >
                        {copy.retry}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* SOURCE SELECTOR */}
              {streamState === "ready" && streamSources.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-4 border-white bg-black px-3 py-2 shadow-brutal">
                  <span className="text-[10px] font-black uppercase tracking-widest text-white sm:text-xs">
                    {copy.sources}
                  </span>
                  {streamSources.map((source, idx) => (
                    <button
                      key={`${source.src}-${idx}`}
                      type="button"
                      onClick={() => setSourceIndex(idx)}
                      className={`border-2 px-2 py-1 text-[10px] font-black uppercase transition-transform hover:-translate-y-0.5 ${
                        idx === sourceIndex
                          ? "border-accent-primary bg-accent-primary text-black"
                          : "border-white bg-black text-white"
                      }`}
                    >
                      {copy.sourceLabel} {idx + 1}
                      {source.quality && (
                        <>
                          {" "}
                          <span className="opacity-70">{source.quality}</span>
                        </>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* CHAT */}
            {activeMatch && (
              <div className={isFullscreen ? "h-full min-h-[320px]" : "h-[380px] min-h-0 sm:h-[480px] lg:h-[560px]"}>
                <ChatBox matchId="motor" />
              </div>
            )}
          </div>

          {/* EVENTS LIST - GROUPED BY GRAND PRIX */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between border-4 border-white bg-black px-3 py-2 shadow-brutal">
              <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white sm:text-xs">
                <Flag size={14} strokeWidth={3} />
                {copy.events}
              </span>
              <span className="border-2 border-white bg-accent-primary px-2 py-0.5 text-[10px] font-black text-black">
                {visibleMatches.length}
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {listState === "loading" && (
                <p className="border-2 border-white/20 px-3 py-4 text-center text-xs font-bold uppercase text-gray-400">
                  {copy.loadingMatches}
                </p>
              )}

              {listState === "error" && (
                <div className="flex flex-col items-center gap-2 border-2 border-accent-red/60 px-3 py-4 text-center">
                  <span className="text-xs font-black uppercase text-accent-red">{copy.error}</span>
                  <span className="text-[11px] font-medium text-gray-400">{copy.errorDesc}</span>
                  <button
                    type="button"
                    onClick={reloadList}
                    className="mt-1 border-2 border-black bg-accent-primary px-3 py-1.5 text-[10px] font-black uppercase text-black shadow-btn transition-transform hover:-translate-y-0.5"
                  >
                    {copy.retry}
                  </button>
                </div>
              )}

              {listState === "ready" && visibleMatches.length === 0 && (
                <div className="flex flex-col items-center gap-2 border-2 border-white/20 px-3 py-4 text-center">
                  <span className="text-xs font-black uppercase text-white">{copy.empty}</span>
                  <span className="text-[11px] font-medium text-gray-400">{copy.emptyDesc}</span>
                </div>
              )}

              {eventGroups.map((group, _groupIndex) => (
                <div key={group.eventName} className="flex flex-col gap-2 animate-fade-in stagger-1">
                  {/* EVENT HEADER - Grand Prix card */}
                  <div className="plate-face flex flex-col gap-3 border-4 border-black bg-accent-primary px-3 py-3 shadow-brutal-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4 sm:py-3.5">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="flex shrink-0 items-center justify-center h-10 w-10 border-2 border-black bg-black shadow-brutal-sm rounded">
                        <Flag size={18} strokeWidth={3} className="text-accent-primary" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <h2 className="text-lg font-black uppercase leading-none tracking-tight text-black sm:text-xl truncate">
                          {displayMotorsportText(group.eventName, language)}
                        </h2>
                        <div className="flex items-center gap-2 text-[11px] font-bold uppercase text-black/70">
                          <span>{displayMotorsportText(group.league, language)}</span>
                          {group.country && (
                            <span className="opacity-70">{displayMotorsportText(group.country, language)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className="ml-auto border-2 border-black bg-black px-2 py-0.5 text-[10px] font-black uppercase text-accent-primary sm:text-xs">
                      {group.sessions.length} {group.sessions.length === 1 ? (language === "es" ? "sesión" : "session") : (language === "es" ? "sesiones" : "sessions")}
                    </span>
                  </div>

                  {/* SESSIONS GRID */}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {group.sessions.map((match) => {
                      const isActive = match.id === activeId;
                      const timeUntilStart = match.timestamp - now;
                      const isUpcoming = match.status === "upcoming";
                      const isLive = match.status === "live";

                      // Live sessions - distinct red card, brutalist style
                      if (isLive) {
                        return (
                          <button
                            key={match.id}
                            type="button"
                            data-match={match.id}
                            onClick={() => selectMatch(match.id)}
                            title={displayMotorsportText(match.parsed.fullTitle, language)}
                            className={`flex flex-col gap-2 px-3 py-4 text-left transition-transform hover:-translate-y-0.5 ${
                              isActive
                                ? "border-accent-primary bg-accent-red text-white shadow-brutal"
                                : "border-accent-red/50 bg-accent-red/90 text-white shadow-brutal"
                            }`}
                          >
                            {/* LIVE INDICATOR - Full width banner */}
                            <div className="flex items-center justify-center gap-2">
                              <span className="relative flex h-7 items-center justify-center overflow-hidden bg-black/30 px-3 text-[10px] font-black uppercase tracking-wider">
                                {copy.live}
                                <span className="absolute inset-0 animate-pulse bg-white/20" aria-hidden="true" />
                              </span>
                            </div>

                            {/* SESSION TITLE */}
                            <span className="line-clamp-1 text-center text-sm font-black uppercase leading-tight sm:text-base">
                              {displayMotorsportText(match.parsed.sessionType, language)}
                            </span>

                            {/* TIME */}
                            <div className="flex items-center justify-center pt-1">
                              <span className="text-[11px] font-bold uppercase tracking-wide sm:text-xs">
                                {formatTime(match.startsAt, language, timeZone)}
                              </span>
                            </div>
                          </button>
                        );
                      }

                      // Upcoming / other sessions - BRUTALIST STYLE matching site design (clean, no kind badge)
                      return (
                        <button
                          key={match.id}
                          type="button"
                          data-match={match.id}
                          onClick={() => selectMatch(match.id)}
                          title={displayMotorsportText(match.parsed.fullTitle, language)}
                          className={`flex flex-col gap-1.5 border-4 px-3 py-3 text-left transition-transform hover:-translate-y-0.5 ${
                            isActive
                              ? "border-accent-primary bg-accent-primary text-black shadow-brutal"
                              : "border-white bg-black text-white shadow-brutal"
                          }`}
                        >
                          {/* SESSION TITLE */}
                          <span className="line-clamp-1 text-center text-xs font-black uppercase leading-tight sm:text-sm">
                            {displayMotorsportText(match.parsed.sessionType, language)}
                          </span>

                          {/* TIME / COUNTDOWN */}
                          <div className="flex items-center justify-between gap-1 pt-1 border-t border-white/10">
                            <span className="text-[11px] font-bold uppercase sm:text-xs">
                              {formatTime(match.startsAt, language, timeZone)}
                            </span>
                            {isUpcoming && (
                              <span className="flex shrink-0 items-center gap-1 text-[10px] font-black uppercase text-accent-primary bg-black/50 border border-accent-primary/50 px-1.5 py-0.5">
                                {formatCountdown(timeUntilStart, language)}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {listState === "loading" && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/90 backdrop-blur-sm">
          <RefreshCw size={36} strokeWidth={3} className="animate-spin text-[#a855f7]" />
          <span className="text-xs font-black uppercase tracking-widest text-[#a855f7] sm:text-sm">
            {copy.loadingMatches}
          </span>
        </div>
      )}
    </main>
  );
}