"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Maximize2, Minimize2, RefreshCw } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import VideoPlayer from "@/components/player/VideoPlayer";
import ChatBox from "@/components/chat/ChatBox";
import ViewerBadge from "@/components/matches/ViewerBadge";
import NetworkNotice from "@/components/ui/NetworkNotice";
import { withMatchParam } from "@/lib/viewer-id";

interface CombatMatch {
  id: number;
  title: string;
  sport: string;
  sportName: string;
  startsAt: string;
  timestamp: number;
  live: boolean;
  finished: boolean;
  home?: string;
  away?: string;
}

type ListState = "loading" | "ready" | "error";
type StreamState = "loading" | "ready" | "error";

interface StreamSource {
  src: string;
  kind: "hls" | "iframe";
  quality?: string;
}

function pickInitialMatch(list: CombatMatch[]): number | null {
  return list[0]?.id ?? null;
}

/** Kickoff arrives in UTC; render it in Argentina time like the LPF page. */
function formatTime(start: string): string {
  if (!start) return "";
  const date = new Date(start);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function matchLabel(match: CombatMatch): string {
  if (match.home && match.away) return `${match.home} vs ${match.away}`;
  return match.title;
}

export default function BoxeoPage() {
  const { t } = useLanguage();
  const copy = t.combat;

  const [matches, setMatches] = useState<CombatMatch[]>([]);
  const [listState, setListState] = useState<ListState>("loading");
  const [listReload, setListReload] = useState(0);

  const [activeId, setActiveId] = useState<number | null>(null);
  const [streamSources, setStreamSources] = useState<StreamSource[]>([]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [streamState, setStreamState] = useState<StreamState>("loading");
  const [streamReload, setStreamReload] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/combat/matches")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { matches?: CombatMatch[] }) => {
        if (cancelled) return;
        const next = Array.isArray(data.matches) ? data.matches : [];
        setMatches(next);
        setListState("ready");
        setActiveId((current) => current ?? pickInitialMatch(next));
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
    fetch(`/api/combat/${activeId}`)
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

  const activeMatch = matches.find((match) => match.id === activeId) ?? null;
  const activeSource = streamSources[sourceIndex] ?? null;

  const groups = useMemo(() => {
    const map = new Map<string, CombatMatch[]>();
    for (const match of matches) {
      const key = match.sportName || match.sport.toUpperCase();
      const list = map.get(key) ?? [];
      list.push(match);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [matches]);

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

  // Upcoming fights publish their players when the broadcast starts.
  useEffect(() => {
    if (streamState !== "error" || activeId === null) return;
    const live = matches.find((match) => match.id === activeId)?.live;
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

  const statusLabel = (match: CombatMatch) => {
    if (match.live) return copy.live;
    if (match.finished) return copy.finished;
    return copy.scheduled;
  };

  return (
    <main className="min-h-screen">
      <section className="mx-auto max-w-7xl px-3 py-7 sm:px-4 md:px-6 md:py-10">
        <NetworkNotice />
        <div className="flex flex-col gap-5">
          <div
            ref={stageRef}
            className={`grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] ${isFullscreen ? "bg-neutral-950 p-3" : ""}`}
          >
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-4 border-white bg-black px-3 py-2 shadow-brutal">
                <span className="text-[10px] font-black uppercase tracking-widest text-white sm:text-xs">
                  {copy.nowPlaying}
                </span>
                <span className="flex min-w-0 items-center gap-2">
                  {activeMatch && (
                    <ViewerBadge matchId={String(activeMatch.id)} />
                  )}
                  <span className="truncate text-xs font-black uppercase text-accent-red sm:text-sm">
                    {activeMatch ? matchLabel(activeMatch) : copy.noFight}
                  </span>
                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    title={isFullscreen ? copy.exitFullscreen : copy.fullscreen}
                    aria-label={isFullscreen ? copy.exitFullscreen : copy.fullscreen}
                    className="shrink-0 border-2 border-white bg-black p-1.5 text-white transition-colors hover:bg-accent-red hover:text-white"
                  >
                    {isFullscreen ? <Minimize2 size={14} strokeWidth={3} /> : <Maximize2 size={14} strokeWidth={3} />}
                  </button>
                </span>
              </div>

              {streamState === "ready" && activeSource && activeMatch ? (
                <VideoPlayer
                  url={withMatchParam(activeSource.src, String(activeMatch.id))}
                  title={matchLabel(activeMatch)}
                  kind={activeSource.kind}
                  preferFastStart
                />
              ) : (
                <div className="relative flex aspect-video w-full items-center justify-center border-3 border-white bg-black sm:border-4">
                  {streamState === "loading" ? (
                    <div className="flex flex-col items-center gap-3 px-6 text-center">
                      <RefreshCw size={26} strokeWidth={3} className="animate-spin text-accent-red" />
                      <span className="text-xs font-black uppercase tracking-widest text-white sm:text-sm">
                        {copy.loadingStream}
                      </span>
                    </div>
                  ) : (
                    <div className="flex max-w-sm flex-col items-center gap-3 px-6 text-center">
                      <AlertCircle size={30} strokeWidth={3} className="text-accent-red" />
                      {activeMatch && !activeMatch.live ? (
                        <span className="text-xs font-medium leading-relaxed text-gray-300">
                          {copy.sourcesAtFight}
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
                        className="mt-1 border-2 border-black bg-accent-red px-3 py-1.5 text-[10px] font-black uppercase text-white shadow-btn transition-transform hover:-translate-y-0.5"
                      >
                        {copy.retry}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {streamState === "ready" && streamSources.length > 1 && (
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
                          ? "border-accent-red bg-accent-red text-white"
                          : "border-white bg-black text-white"
                      }`}
                    >
                      {copy.sourceLabel} {idx + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {activeMatch && (
              <div className={isFullscreen ? "h-full min-h-[320px]" : "h-[380px] min-h-0 sm:h-[480px] lg:h-[560px]"}>
                <ChatBox matchId="combat" />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between border-4 border-white bg-black px-3 py-2 shadow-brutal">
              <span className="text-[10px] font-black uppercase tracking-widest text-white sm:text-xs">
                {copy.fights}
              </span>
              <span className="border-2 border-white bg-accent-red px-2 py-0.5 text-[10px] font-black text-white">
                {matches.length}
              </span>
            </div>

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
                  className="mt-1 border-2 border-black bg-accent-red px-3 py-1.5 text-[10px] font-black uppercase text-white shadow-btn transition-transform hover:-translate-y-0.5"
                >
                  {copy.retry}
                </button>
              </div>
            )}

            {listState === "ready" && matches.length === 0 && (
              <div className="flex flex-col items-center gap-2 border-2 border-white/20 px-3 py-4 text-center">
                <span className="text-xs font-black uppercase text-white">{copy.empty}</span>
                <span className="text-[11px] font-medium text-gray-400">{copy.emptyDesc}</span>
              </div>
            )}

            {groups.map(([sport, list]) => (
              <div key={sport} className="flex flex-col gap-2">
                <span className="border-2 border-white/30 bg-black px-3 py-1 text-[10px] font-black uppercase tracking-widest text-accent-red">
                  {sport}
                </span>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-2">
                  {list.map((match) => {
                    const isActive = match.id === activeId;
                    return (
                      <button
                        key={match.id}
                        type="button"
                        data-match={match.id}
                        onClick={() => selectMatch(match.id)}
                        title={matchLabel(match)}
                        className={`flex w-full min-w-0 flex-col gap-2 border-4 px-3 py-3 text-left transition-transform hover:-translate-y-0.5 sm:w-64 sm:shrink-0 sm:px-4 sm:py-3.5 md:w-80 ${
                          isActive
                            ? "border-accent-red bg-accent-red text-white shadow-brutal"
                            : "border-white bg-black text-white shadow-brutal"
                        }`}
                      >
                        <span className="text-left text-xs font-black uppercase leading-tight sm:text-sm">
                          {matchLabel(match)}
                        </span>
                        <span className="flex items-center justify-between gap-1">
                          <span className="text-[10px] font-bold uppercase sm:text-xs">{formatTime(match.startsAt)}</span>
                          {match.live ? (
                            <span className="flex shrink-0 items-center gap-1 text-[10px] font-black uppercase sm:text-xs">
                              <span className="h-1.5 w-1.5 rounded-full bg-accent-red animate-pulse" />
                              {copy.live}
                            </span>
                          ) : (
                            <span className="shrink-0 text-[10px] font-black uppercase sm:text-xs">
                              {statusLabel(match)}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {listState === "loading" && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/90 backdrop-blur-sm">
          <RefreshCw size={36} strokeWidth={3} className="animate-spin text-accent-red" />
          <span className="text-xs font-black uppercase tracking-widest text-white sm:text-sm">
            {copy.loadingMatches}
          </span>
        </div>
      )}
    </main>
  );
}
