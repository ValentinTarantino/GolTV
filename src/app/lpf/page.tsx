"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Maximize2, Minimize2, RefreshCw } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import VideoPlayer from "@/components/player/VideoPlayer";
import ChatBox from "@/components/chat/ChatBox";
import ViewerBadge from "@/components/matches/ViewerBadge";

interface LpfMatch {
  id: string;
  competition: string;
  home: string;
  away: string;
  homeLogo?: string;
  awayLogo?: string;
  start: string;
  status: "live" | "upcoming" | "finished";
}

type ListState = "loading" | "ready" | "error";
type StreamState = "loading" | "ready" | "error";

/** One player of the selected match ("Fuente 1", "Fuente 2"…). */
interface StreamSource {
  src: string;
  kind: "hls" | "iframe";
  /** Resolution the provider announces, when it does. */
  quality?: string;
}

/** The section always opens on the first match of the list. */
function pickInitialMatch(list: LpfMatch[]): string | null {
  return list[0]?.id ?? null;
}

/**
 * Chat/viewer APIs only accept numeric match ids, so the opaque `lpm_…`
 * fixture id is folded into a stable decimal one (first 13 hex digits fit
 * safely in a double).
 */
function chatMatchId(id: string): string {
  const hex = id.replace(/^lpm_/, "").slice(0, 13);
  const n = Number.parseInt(hex, 16);
  return Number.isFinite(n) && n > 0 ? String(n) : "0";
}

/** The kickoff arrives in Argentina time, so it is rendered as UTC. */
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

/** Crest of a team; the name is the fallback when the crest is unknown. */
function TeamCrest({ src, name }: { src?: string; name: string }) {
  if (!src) {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-current/40 text-xs font-black uppercase">
        {name.slice(0, 2)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      title={name}
      className="h-9 w-9 shrink-0 object-contain"
      loading="lazy"
    />
  );
}

export default function LpfPlayPage() {
  const { t } = useLanguage();
  const copy = t.lpf;

  const [matches, setMatches] = useState<LpfMatch[]>([]);
  const [listState, setListState] = useState<ListState>("loading");
  const [listReload, setListReload] = useState(0);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [streamSrc, setStreamSrc] = useState<string | null>(null);
  const [streamKind, setStreamKind] = useState<"hls" | "iframe">("hls");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [streamSources, setStreamSources] = useState<StreamSource[]>([]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [streamState, setStreamState] = useState<StreamState>("loading");
  const [streamReload, setStreamReload] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/lpf/matches")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { matches?: LpfMatch[] }) => {
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
    if (!activeId) return;
    let cancelled = false;

    fetch(`/api/lpf/matches/${encodeURIComponent(activeId)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { src?: string | null; kind?: "hls" | "iframe" | null; sources?: StreamSource[] }) => {
        if (cancelled) return;
        if (!data.src) {
          setStreamState("error");
          return;
        }
        setStreamSources(
          Array.isArray(data.sources) && data.sources.length
            ? data.sources
            : [{ src: data.src, kind: data.kind ?? "hls" }]
        );
        setStreamSrc(data.src);
        setStreamKind(data.kind ?? "hls");
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
  const activeSource =
    streamSources[sourceIndex] ??
    (streamSrc ? { src: streamSrc, kind: streamKind } : null);

  const groups = useMemo(() => {
    const map = new Map<string, LpfMatch[]>();
    for (const match of matches) {
      const list = map.get(match.competition) ?? [];
      list.push(match);
      map.set(match.competition, list);
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
    (id: string) => {
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

  // A match the provider has not opened yet gets its sources as soon as the
  // broadcast starts, so the page asks again on its own instead of making the
  // visitor reload. Every attempt is silent: no spinner, no lost source. A
  // live match retries sooner, since its player can also drop mid-game.
  useEffect(() => {
    if (streamState !== "error" || !activeId) return;
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

  const statusLabel = (status: LpfMatch["status"]) => {
    if (status === "live") return copy.live;
    if (status === "finished") return copy.finished;
    return copy.scheduled;
  };

  return (
    <main className="min-h-screen">
      <section className="mx-auto max-w-7xl px-3 py-7 sm:px-4 md:px-6 md:py-10">
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
                    <ViewerBadge matchId={chatMatchId(activeMatch.id)} active={activeMatch.status === "live"} />
                  )}
                  <span className="truncate text-xs font-black uppercase text-accent-primary sm:text-sm">
                    {activeMatch ? `${activeMatch.home} vs ${activeMatch.away}` : copy.noChannel}
                  </span>
                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    title={isFullscreen ? copy.exitFullscreen : copy.fullscreen}
                    aria-label={isFullscreen ? copy.exitFullscreen : copy.fullscreen}
                    className="shrink-0 border-2 border-white bg-black p-1.5 text-white transition-colors hover:bg-accent-primary hover:text-black"
                  >
                    {isFullscreen ? <Minimize2 size={14} strokeWidth={3} /> : <Maximize2 size={14} strokeWidth={3} />}
                  </button>
                </span>
              </div>

              <p className="border-2 border-accent-primary/60 bg-black px-3 py-1.5 text-[10px] font-bold uppercase leading-snug tracking-wide text-gray-300 sm:text-[11px]">
                {copy.patienceNotice}
              </p>

            {streamState === "ready" && activeSource && activeMatch ? (
              <VideoPlayer
                url={activeSource.src}
                title={`${activeMatch.home} vs ${activeMatch.away}`}
                kind={activeSource.kind}
                preferFastStart
              />
            ) : (
              <div className="relative flex aspect-video w-full items-center justify-center border-3 border-white bg-black sm:border-4">
                {streamState === "loading" ? (
                  <div className="flex flex-col items-center gap-3 px-6 text-center">
                    <RefreshCw size={26} strokeWidth={3} className="animate-spin text-accent-primary" />
                    <span className="text-xs font-black uppercase tracking-widest text-white sm:text-sm">
                      {copy.loadingStream}
                    </span>
                  </div>
                ) : (
                  <div className="flex max-w-sm flex-col items-center gap-3 px-6 text-center">
                    <AlertCircle size={30} strokeWidth={3} className="text-accent-red" />
                    {activeMatch?.status === "upcoming" ? (
                      <span className="text-xs font-medium leading-relaxed text-gray-300">
                        {copy.sourcesAtKickoff}
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

            {activeMatch && (
              <div className={isFullscreen ? "h-full min-h-[320px]" : "h-[380px] min-h-0 sm:h-[480px] lg:h-[560px]"}>
                <ChatBox matchId={chatMatchId(activeMatch.id)} />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between border-4 border-white bg-black px-3 py-2 shadow-brutal">
              <span className="text-[10px] font-black uppercase tracking-widest text-white sm:text-xs">
                {copy.matches}
              </span>
              <span className="border-2 border-white bg-accent-primary px-2 py-0.5 text-[10px] font-black text-black">
                {matches.length}
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

            {listState === "ready" && matches.length === 0 && (
              <div className="flex flex-col items-center gap-2 border-2 border-white/20 px-3 py-4 text-center">
                <span className="text-xs font-black uppercase text-white">{copy.empty}</span>
                <span className="text-[11px] font-medium text-gray-400">{copy.emptyDesc}</span>
              </div>
            )}

            {groups.map(([competition, list]) => (
              <div key={competition} className="flex flex-col gap-2">
                <span className="border-2 border-white/30 bg-black px-3 py-1 text-[10px] font-black uppercase tracking-widest text-accent-primary">
                  {competition}
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
                        title={`${match.home} vs ${match.away}`}
                        className={`flex w-full min-w-0 flex-col gap-2 border-4 px-3 py-3 text-left transition-transform hover:-translate-y-0.5 sm:w-64 sm:shrink-0 sm:px-4 sm:py-3.5 md:w-80 ${
                          isActive
                            ? "border-accent-primary bg-accent-primary text-black shadow-brutal"
                            : "border-white bg-black text-white shadow-brutal"
                        }`}
                      >
                      <span className="flex items-center justify-center gap-2">
                        <TeamCrest src={match.homeLogo} name={match.home} />
                        <span className="text-[11px] font-black uppercase opacity-80 sm:text-xs">vs</span>
                        <TeamCrest src={match.awayLogo} name={match.away} />
                      </span>
                      <span className="text-center text-xs font-black uppercase leading-tight sm:text-sm">
                        {match.home} <span className="opacity-80">vs</span> {match.away}
                      </span>
                      <span className="flex items-center justify-between gap-1">
                        <span className="text-[11px] font-bold uppercase sm:text-xs">{formatTime(match.start)}</span>
                        {match.status === "live" ? (
                          <span className="flex shrink-0 items-center gap-1 text-[11px] font-black uppercase">
                            <span className="h-1.5 w-1.5 rounded-full bg-accent-red animate-pulse" />
                            {copy.live}
                          </span>
                        ) : (
                          <span className="shrink-0 text-[11px] font-black uppercase">
                            {statusLabel(match.status)}
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
        </div>
      </section>

      {listState === "loading" && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/90 backdrop-blur-sm">
          <RefreshCw size={36} strokeWidth={3} className="animate-spin text-accent-primary" />
          <span className="text-xs font-black uppercase tracking-widest text-white sm:text-sm">
            {copy.loadingMatches}
          </span>
        </div>
      )}
    </main>
  );
}
